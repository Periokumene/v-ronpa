from __future__ import annotations

import math
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .errors import ToolError
from .psd_report import PsdInspection, PsdNode
from .util import write_json

PRESET_VERSION = "v1"
DEFAULT_REFERENCE_STAGE_HEIGHT = 700.0
DEFAULT_ANCHOR_BOTTOM_OFFSET = 100.0
ALIAS_GROUPS = frozenset({"ArmL", "ArmR", "MOUTH", "EYE", "EFFECT"})
OPTIONAL_GROUPS = frozenset({"EYE", "EFFECT"})
RESERVED_EXPRESSION_CHARACTERS = frozenset(">+-/\\")
ALLOWED_GROUP_BLEND_MODES = frozenset({"NORMAL", "PASS_THROUGH"})


@dataclass(frozen=True)
class LeafSprite:
    node: PsdNode
    source_path: str
    group: str
    layer: str
    asset_components: tuple[str, ...]
    draw_order: int
    selected_in_source: bool


@dataclass(frozen=True)
class LayeredPackResult:
    sprite_count: int
    groups: tuple[str, ...]
    source_preview: tuple[str, ...]
    root_node_id: str
    tokens: dict[str, list[str]]
    sprites: tuple[dict[str, Any], ...]
    warnings: tuple[str, ...]


def _blend_mode_name(layer: Any) -> str:
    return str(getattr(layer.blend_mode, "name", layer.blend_mode))


def _layer_flag(layer: Any, method: str) -> bool:
    value = getattr(layer, method, None)
    return bool(value()) if callable(value) else False


def _effective_visible(layer: Any) -> bool:
    value = getattr(layer, "is_visible", None)
    return bool(value()) if callable(value) else bool(layer.visible)


def _portable_key(value: str) -> str:
    return unicodedata.normalize("NFC", value).casefold()


def _validate_component(name: str, source_path: str) -> None:
    if not name or name in {".", ".."} or any(ord(character) < 32 for character in name):
        raise ToolError(f"CSP folder has an unsafe runtime name at {source_path}: {name!r}.")
    reserved = sorted(set(name) & RESERVED_EXPRESSION_CHARACTERS)
    if reserved:
        raise ToolError(
            f"CSP folder name at {source_path} uses layered-character expression/path characters {reserved}: {name!r}."
        )


def _validate_group_boundary(node: PsdNode) -> None:
    blend_mode = _blend_mode_name(node.layer)
    if blend_mode not in ALLOWED_GROUP_BLEND_MODES:
        raise ToolError(f"Folder boundary cannot be baked independently: {node.path} uses {blend_mode} blend mode.")
    unsupported: list[str] = []
    if bool(getattr(node.layer, "clipping", False)):
        unsupported.append("clipping")
    if _layer_flag(node.layer, "has_mask"):
        unsupported.append("mask")
    if _layer_flag(node.layer, "has_vector_mask"):
        unsupported.append("vector-mask")
    if _layer_flag(node.layer, "has_effects"):
        unsupported.append("effects")
    if unsupported:
        raise ToolError(f"Folder boundary has unsupported independent-render properties at {node.path}: {unsupported}.")


def discover_leaf_sprites(inspection: PsdInspection, character_root: str) -> tuple[PsdNode, list[LeafSprite]]:
    root_matches = [node for node in inspection.nodes if node.path == character_root and node.layer.is_group()]
    if not root_matches:
        raise ToolError(f"Character root group was not found: {character_root}.")
    if len(root_matches) > 1:
        ids = ", ".join(node.id for node in root_matches)
        raise ToolError(f"Character root group is ambiguous: {character_root}; candidates: {ids}.")
    root = root_matches[0]
    by_id = inspection.by_id
    children: dict[str, list[PsdNode]] = defaultdict(list)
    for node in inspection.nodes:
        if node.parent_id is not None:
            children[node.parent_id].append(node)

    subtree_groups = [
        node
        for node in inspection.nodes
        if node.layer.is_group() and (node.id == root.id or root.id in node.ancestor_ids)
    ]
    leaf_nodes: list[PsdNode] = []
    for group in subtree_groups:
        _validate_group_boundary(group)
        direct_children = children[group.id]
        child_groups = [node for node in direct_children if node.layer.is_group()]
        drawable_children = [node for node in direct_children if not node.layer.is_group()]
        if child_groups and drawable_children:
            raise ToolError(
                f"Structural folder mixes child folders and drawable layers: {group.path}; "
                "move direct drawable layers into a dedicated leaf folder."
            )
        if not direct_children:
            raise ToolError(f"Empty folder cannot produce a layered-character sprite: {group.path}.")
        if not child_groups:
            if not drawable_children:
                raise ToolError(f"Leaf folder contains no drawable layers: {group.path}.")
            leaf_nodes.append(group)

    if root in leaf_nodes:
        raise ToolError(
            f"Character root must contain sprite folders instead of being a sprite itself: {character_root}."
        )
    if not leaf_nodes:
        raise ToolError(f"Character root contains no leaf sprite folders: {character_root}.")

    sprites: list[LeafSprite] = []
    group_draw_order: dict[str, int] = {}
    runtime_keys: set[tuple[str, str]] = set()
    portable_runtime_keys: dict[str, str] = {}
    for node in leaf_nodes:
        chain = [by_id[node_id] for node_id in node.ancestor_ids if node_id in by_id] + [node]
        root_index = next(index for index, ancestor in enumerate(chain) if ancestor.id == root.id)
        components = tuple(str(item.layer.name) for item in chain[root_index:])
        source_path = "/" + "/".join(components)
        for component in components:
            _validate_component(component, source_path)
        if len(components) < 2:
            raise ToolError(f"Leaf sprite must be below the character root: {source_path}.")
        group = "/".join(components[:-1])
        layer = components[-1]
        key = (group, layer)
        if key in runtime_keys:
            raise ToolError(f"Duplicate layered-character runtime key: {group}>{layer}.")
        runtime_keys.add(key)
        portable = _portable_key(f"{group}>{layer}")
        previous = portable_runtime_keys.get(portable)
        if previous is not None:
            raise ToolError(f"Case-insensitive runtime/resource collision: {previous!r} and {group}>{layer!s}.")
        portable_runtime_keys[portable] = f"{group}>{layer}"
        draw_order = group_draw_order.setdefault(group, len(group_draw_order))
        sprites.append(
            LeafSprite(
                node=node,
                source_path=source_path,
                group=group,
                layer=layer,
                asset_components=components,
                draw_order=draw_order,
                selected_in_source=_effective_visible(node.layer),
            )
        )

    selected_by_group: dict[str, list[LeafSprite]] = defaultdict(list)
    all_by_group: dict[str, list[LeafSprite]] = defaultdict(list)
    for sprite in sprites:
        all_by_group[sprite.group].append(sprite)
        if sprite.selected_in_source:
            selected_by_group[sprite.group].append(sprite)
    for group in all_by_group:
        selected = selected_by_group[group]
        group_basename = group.rsplit("/", 1)[-1]
        if len(selected) > 1:
            raise ToolError(
                f"Source preview selects multiple leaf sprites in exclusive group {group}: "
                f"{[sprite.layer for sprite in selected]}."
            )
        if group_basename not in OPTIONAL_GROUPS and len(selected) != 1:
            raise ToolError(
                f"Required group must select exactly one visible sprite: {group}; found {len(selected)}."
            )
    return root, sprites


def _composite_leaf(inspection: PsdInspection, sprite: LeafSprite) -> tuple[Any, tuple[int, int, int, int]]:
    by_id = inspection.by_id
    visibility_scope = [by_id[node_id] for node_id in sprite.node.ancestor_ids if node_id in by_id] + [sprite.node]
    original_visibility = [(node.layer, bool(node.layer.visible)) for node in visibility_scope]
    try:
        for layer, _visible in original_visibility:
            layer.visible = True
        image = sprite.node.layer.composite(
            viewport=(0, 0, int(inspection.psd.width), int(inspection.psd.height)),
            force=True,
        )
    except Exception as error:
        raise ToolError(
            f"Leaf sprite could not be composited: {sprite.source_path}: {type(error).__name__}: {error}"
        ) from error
    finally:
        for layer, visible in reversed(original_visibility):
            layer.visible = visible
    if image is None:
        raise ToolError(f"Leaf sprite produced no image: {sprite.source_path}.")
    image = image.convert("RGBA")
    alpha_bbox = image.getchannel("A").getbbox()
    if alpha_bbox is None:
        raise ToolError(f"Leaf sprite produced an empty transparent image: {sprite.source_path}.")
    return image.crop(alpha_bbox), tuple(int(value) for value in alpha_bbox)


def _metadata(
    character_id: str, sprite: LeafSprite, alpha_bbox: tuple[int, int, int, int], height: int
) -> dict[str, Any]:
    left, top, _right, _bottom = alpha_bbox
    return {
        "sourcePath": f"{character_id}{sprite.source_path}",
        "drawOrder": sprite.draw_order,
        "sprite": {"pivot": {"x": 0, "y": 0}, "pixelsPerUnit": 1},
        "localTransform": {
            "position": {"x": left, "y": height - top, "z": 0},
            "scale": {"x": 1, "y": 1, "z": 1},
            "rotation": {"x": 0, "y": 0, "z": 0},
        },
        "renderer": {
            "color": {"r": 1, "g": 1, "b": 1, "a": 1},
            "flipX": False,
            "flipY": False,
        },
    }


def _preset_tokens(sprites: list[LeafSprite]) -> dict[str, list[str]]:
    source_preview = [f"{sprite.group}>{sprite.layer}" for sprite in sprites if sprite.selected_in_source]
    tokens: dict[str, list[str]] = {"SourcePreview": source_preview, "Default": ["SourcePreview"]}

    def add(name: str, expression: str) -> None:
        if name in tokens:
            raise ToolError(f"Automatic composition token collision: {name!r}.")
        tokens[name] = [expression]

    off_groups: dict[str, tuple[str, ...]] = {}
    for sprite in sprites:
        group_components = sprite.asset_components[:-1]
        group_basename = group_components[-1]
        relative_group = group_components[1:]
        if group_basename in ALIAS_GROUPS:
            add("".join((*relative_group, sprite.layer)), f"{sprite.group}>{sprite.layer}")
        if group_basename in OPTIONAL_GROUPS:
            off_groups[sprite.group] = relative_group
    for group, relative_group in off_groups.items():
        add("".join((*relative_group, "Off")), f"{group}-")
    return tokens


def _union_bounds(bounds: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int]:
    return (
        min(left for left, _top, _right, _bottom in bounds),
        min(top for _left, top, _right, _bottom in bounds),
        max(right for _left, _top, right, _bottom in bounds),
        max(bottom for _left, _top, _right, bottom in bounds),
    )


def _character_anchor(
    sprites_with_bounds: list[tuple[LeafSprite, tuple[int, int, int, int]]],
    width: int,
    height: int,
    anchor_bottom_offset: float,
) -> list[float]:
    body_bounds = [bounds for sprite, bounds in sprites_with_bounds if sprite.layer == "BODY"]
    anchor_bounds = _union_bounds(body_bounds or [bounds for _sprite, bounds in sprites_with_bounds])
    return [width / 2, height - anchor_bounds[3] + anchor_bottom_offset]


def _validate_render_parameters(reference_stage_height: float, anchor_bottom_offset: float) -> None:
    if not math.isfinite(reference_stage_height) or reference_stage_height <= 0:
        raise ToolError(f"Reference stage height must be a finite positive number, got {reference_stage_height}.")
    if not math.isfinite(anchor_bottom_offset) or anchor_bottom_offset < 0:
        raise ToolError(f"Anchor bottom offset must be a finite non-negative number, got {anchor_bottom_offset}.")


def build_layered_character_pack(
    inspection: PsdInspection,
    output_root: Path,
    character_id: str,
    character_root: str,
    *,
    reference_stage_height: float = DEFAULT_REFERENCE_STAGE_HEIGHT,
    anchor_bottom_offset: float = DEFAULT_ANCHOR_BOTTOM_OFFSET,
) -> LayeredPackResult:
    _validate_render_parameters(reference_stage_height, anchor_bottom_offset)
    root, sprites = discover_leaf_sprites(inspection, character_root)
    width = int(inspection.psd.width)
    height = int(inspection.psd.height)
    if width <= 0 or height <= 0:
        raise ToolError(f"PSD canvas must be positive, got {width}x{height}.")
    groups: dict[str, dict[str, dict[str, dict[str, str]]]] = {}
    sprite_records: list[dict[str, Any]] = []
    sprites_with_bounds: list[tuple[LeafSprite, tuple[int, int, int, int]]] = []
    warnings: list[str] = []
    descendants = {
        sprite.node.id: [node for node in inspection.nodes if sprite.node.id in node.ancestor_ids]
        for sprite in sprites
    }

    for sprite in sprites:
        cropped, alpha_bbox = _composite_leaf(inspection, sprite)
        sprites_with_bounds.append((sprite, alpha_bbox))
        asset_rel = Path("assets", "layers", *sprite.asset_components[:-1], f"{sprite.asset_components[-1]}.png")
        metadata_rel = Path("assets", "layers", *sprite.asset_components[:-1], f"{sprite.asset_components[-1]}.json")
        asset_path = output_root / asset_rel
        asset_path.parent.mkdir(parents=True, exist_ok=True)
        cropped.save(asset_path)
        write_json(output_root / metadata_rel, _metadata(character_id, sprite, alpha_bbox, height))
        group = groups.setdefault(sprite.group, {"layers": {}})
        group["layers"][sprite.layer] = {"src": asset_rel.as_posix(), "metadata": metadata_rel.as_posix()}
        contributors = descendants[sprite.node.id]
        for contributor in contributors:
            recovered_features: list[str] = []
            if contributor.layer.kind not in {"group", "pixel", "solidcolorfill"}:
                recovered_features.append(f"kind={contributor.layer.kind}")
            if _layer_flag(contributor.layer, "has_effects"):
                recovered_features.append("effects")
            if _layer_flag(contributor.layer, "has_vector_mask"):
                recovered_features.append("vector-mask")
            if recovered_features:
                warnings.append(f"{contributor.path}: {recovered_features} recovered through raster compositing.")
        sprite_records.append(
            {
                "id": f"{sprite.group}>{sprite.layer}",
                "nodeId": sprite.node.id,
                "sourcePath": sprite.source_path,
                "group": sprite.group,
                "layer": sprite.layer,
                "selectedInSource": sprite.selected_in_source,
                "drawOrder": sprite.draw_order,
                "alphaBounds": list(alpha_bbox),
                "asset": asset_rel.as_posix(),
                "metadata": metadata_rel.as_posix(),
                "contributors": [contributor.id for contributor in contributors],
            }
        )

    source_preview = [f"{sprite.group}>{sprite.layer}" for sprite in sprites if sprite.selected_in_source]
    if not source_preview:
        raise ToolError("SourcePreview resolved to an empty composition.")
    tokens = _preset_tokens(sprites)
    character = {
        "id": character_id,
        "defaultComposition": ["Default"],
        "renderSpace": {
            "stageScale": reference_stage_height / height,
            "characterAnchor": _character_anchor(sprites_with_bounds, width, height, anchor_bottom_offset),
        },
    }
    write_json(output_root / "character.json", character)
    write_json(output_root / "layers.json", {"groups": groups})
    write_json(output_root / "compositions.json", {"tokens": tokens})
    return LayeredPackResult(
        len(sprites),
        tuple(groups),
        tuple(source_preview),
        root.id,
        tokens,
        tuple(sprite_records),
        tuple(dict.fromkeys(warnings)),
    )
