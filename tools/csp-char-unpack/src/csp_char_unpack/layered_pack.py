from __future__ import annotations

import math
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .errors import ToolError
from .psd_report import PsdInspection, PsdNode
from .util import write_json

PRESET_VERSION = "v2"
CHARACTER_ROOT = "/root"
BODY_NAME = "body"
EFFECT_GROUP = "effect"
DEFAULT_REFERENCE_STAGE_HEIGHT = 700.0
DEFAULT_ANCHOR_BOTTOM_OFFSET = 100.0
LOWER_CAMEL_GROUP = re.compile(r"^[a-z][A-Za-z0-9]*$")
VARIANT_NAME = re.compile(r"^(0|[1-9][0-9]*)$")
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


def _validate_runtime_group_name(name: str, source_path: str) -> None:
    _validate_component(name, source_path)
    if not LOWER_CAMEL_GROUP.fullmatch(name):
        raise ToolError(
            f"Runtime group name must be a safe lower camel identifier at {source_path}: {name!r}."
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


def _direct_children(inspection: PsdInspection) -> dict[str, list[PsdNode]]:
    children: dict[str, list[PsdNode]] = defaultdict(list)
    for node in inspection.nodes:
        if node.parent_id is not None:
            children[node.parent_id].append(node)
    return children


def _require_leaf_folder(node: PsdNode, children: dict[str, list[PsdNode]]) -> None:
    direct = children[node.id]
    if not direct:
        raise ToolError(f"Empty folder cannot produce a layered-character sprite: {node.path}.")
    child_groups = [child for child in direct if child.layer.is_group()]
    if child_groups:
        raise ToolError(
            f"Nested runtime folders are not allowed below a sprite leaf: {node.path}; "
            f"found {[child.path for child in child_groups]}."
        )
    if not any(not child.layer.is_group() for child in direct):
        raise ToolError(f"Leaf folder contains no drawable layers: {node.path}.")


def _validate_portable_uniqueness(values: list[tuple[str, str]], kind: str) -> None:
    portable: dict[str, str] = {}
    for value, source_path in values:
        key = _portable_key(value)
        previous = portable.get(key)
        if previous is not None:
            raise ToolError(f"Case-insensitive/Unicode {kind} collision: {previous!r} and {source_path!r}.")
        portable[key] = source_path


def discover_leaf_sprites(inspection: PsdInspection) -> tuple[PsdNode, list[LeafSprite]]:
    root_matches = [
        node for node in inspection.nodes if node.path == CHARACTER_ROOT and node.layer.is_group()
    ]
    if len(root_matches) != 1:
        if not root_matches:
            raise ToolError(f"Required v2 character root group was not found: {CHARACTER_ROOT}.")
        ids = ", ".join(node.id for node in root_matches)
        raise ToolError(f"Character root group is ambiguous: {CHARACTER_ROOT}; candidates: {ids}.")
    root = root_matches[0]
    _validate_group_boundary(root)
    children = _direct_children(inspection)
    root_children = children[root.id]
    if not root_children:
        raise ToolError(f"Character root contains no authoring folders: {CHARACTER_ROOT}.")
    if any(not child.layer.is_group() for child in root_children):
        direct = [child.path for child in root_children if not child.layer.is_group()]
        raise ToolError(f"Character root may contain only direct authoring folders; found drawable layers: {direct}.")

    body_matches = [node for node in root_children if str(node.layer.name) == BODY_NAME]
    if len(body_matches) != 1:
        raise ToolError(f"Character root must contain exactly one direct /root/body leaf; found {len(body_matches)}.")
    body = body_matches[0]
    if root_children[0].id != body.id:
        raise ToolError("/root/body must be the backmost (first) folder in source order.")
    _validate_group_boundary(body)
    _require_leaf_folder(body, children)
    if not _effective_visible(body.layer):
        raise ToolError("/root/body must be effectively visible.")

    semantic_groups = [node for node in root_children if node.id != body.id]
    effect_matches = [node for node in semantic_groups if str(node.layer.name) == EFFECT_GROUP]
    if len(effect_matches) > 1:
        raise ToolError("Character root may contain at most one direct /root/effect group.")
    if effect_matches and semantic_groups[-1].id != effect_matches[0].id:
        raise ToolError("/root/effect must be the frontmost (last) folder in source order.")

    _validate_portable_uniqueness(
        [(str(node.layer.name), node.path) for node in root_children],
        "runtime group/resource path",
    )

    sprites = [
        LeafSprite(
            node=body,
            source_path="/root/body",
            group="root",
            layer=BODY_NAME,
            asset_components=("root", BODY_NAME),
            draw_order=0,
            selected_in_source=True,
        )
    ]
    runtime_keys = {("root", BODY_NAME)}
    portable_runtime_keys = {_portable_key("root>body"): "root>body"}

    for draw_order, group_node in enumerate(semantic_groups, start=1):
        group_name = str(group_node.layer.name)
        _validate_runtime_group_name(group_name, group_node.path)
        _validate_group_boundary(group_node)
        direct = children[group_node.id]
        if not direct:
            raise ToolError(f"Runtime group contains no variants: {group_node.path}.")
        if any(not child.layer.is_group() for child in direct):
            raise ToolError(
                f"Runtime group may contain only numeric variant folders: {group_node.path}."
            )

        variants: list[tuple[int, PsdNode]] = []
        for variant_node in direct:
            variant_name = str(variant_node.layer.name)
            _validate_component(variant_name, variant_node.path)
            if not VARIANT_NAME.fullmatch(variant_name):
                raise ToolError(
                    f"Variant folder must be a decimal integer without leading zeroes at "
                    f"{variant_node.path}: {variant_name!r}."
                )
            _validate_group_boundary(variant_node)
            _require_leaf_folder(variant_node, children)
            variants.append((int(variant_name), variant_node))
        variant_numbers = sorted(number for number, _node in variants)
        expected = list(range(len(variants)))
        if variant_numbers != expected:
            raise ToolError(
                f"Variant folders must form a continuous 0..N sequence at {group_node.path}; "
                f"found {variant_numbers}, expected {expected}."
            )

        if group_name == EFFECT_GROUP:
            visible = [number for number, node in variants if bool(node.layer.visible)]
            if visible:
                raise ToolError(f"/root/effect variants must all be hidden by default; visible: {visible}.")
        else:
            effective = [number for number, node in variants if _effective_visible(node.layer)]
            if effective != [0]:
                raise ToolError(
                    f"Ordinary runtime group must effectively select only variant 0: "
                    f"{group_node.path}; selected {effective}."
                )
            raw_visible_nonzero = [
                number for number, node in variants if number != 0 and bool(node.layer.visible)
            ]
            if raw_visible_nonzero:
                raise ToolError(
                    f"Ordinary runtime group nonzero variants must be hidden: "
                    f"{group_node.path}; visible {raw_visible_nonzero}."
                )

        for number, variant_node in variants:
            layer = str(number)
            group = f"root/{group_name}"
            key = (group, layer)
            if key in runtime_keys:
                raise ToolError(f"Duplicate layered-character runtime key: {group}>{layer}.")
            runtime_keys.add(key)
            portable_key = _portable_key(f"{group}>{layer}")
            previous = portable_runtime_keys.get(portable_key)
            if previous is not None:
                raise ToolError(
                    f"Case-insensitive/Unicode runtime/resource collision: "
                    f"{previous!r} and {group}>{layer!s}."
                )
            portable_runtime_keys[portable_key] = f"{group}>{layer}"
            sprites.append(
                LeafSprite(
                    node=variant_node,
                    source_path=f"/root/{group_name}/{layer}",
                    group=group,
                    layer=layer,
                    asset_components=("root", group_name, layer),
                    draw_order=draw_order,
                    selected_in_source=group_name != EFFECT_GROUP and number == 0,
                )
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
    tokens: dict[str, list[str]] = {"sourcePreview": source_preview, "default": ["sourcePreview"]}
    portable_tokens = {_portable_key(name): name for name in tokens}

    def add(name: str, expression: str) -> None:
        portable = _portable_key(name)
        previous = portable_tokens.get(portable)
        if name in tokens or previous is not None:
            raise ToolError(f"Automatic composition token collision: {previous or name!r} and {name!r}.")
        tokens[name] = [expression]
        portable_tokens[portable] = name

    has_effect = False
    for sprite in sprites:
        if sprite.layer == BODY_NAME and sprite.group == "root":
            continue
        group_name = sprite.asset_components[1]
        add(f"{group_name}{sprite.layer}", f"{sprite.group}>{sprite.layer}")
        has_effect = has_effect or group_name == EFFECT_GROUP
    if has_effect:
        add("effectOff", "root/effect-")
    return tokens


def _character_anchor(
    sprites_with_bounds: list[tuple[LeafSprite, tuple[int, int, int, int]]],
    width: int,
    height: int,
    anchor_bottom_offset: float,
) -> list[float]:
    body_bounds = [
        bounds
        for sprite, bounds in sprites_with_bounds
        if sprite.group == "root" and sprite.layer == BODY_NAME
    ]
    if len(body_bounds) != 1:
        raise ToolError(f"Body anchor requires exactly one /root/body sprite; found {len(body_bounds)}.")
    return [width / 2, height - body_bounds[0][3] + anchor_bottom_offset]


def _validate_render_parameters(reference_stage_height: float, anchor_bottom_offset: float) -> None:
    if not math.isfinite(reference_stage_height) or reference_stage_height <= 0:
        raise ToolError(f"Reference stage height must be a finite positive number, got {reference_stage_height}.")
    if not math.isfinite(anchor_bottom_offset) or anchor_bottom_offset < 0:
        raise ToolError(f"Anchor bottom offset must be a finite non-negative number, got {anchor_bottom_offset}.")


def build_layered_character_pack(
    inspection: PsdInspection,
    output_root: Path,
    character_id: str,
    *,
    reference_stage_height: float = DEFAULT_REFERENCE_STAGE_HEIGHT,
    anchor_bottom_offset: float = DEFAULT_ANCHOR_BOTTOM_OFFSET,
) -> LayeredPackResult:
    _validate_render_parameters(reference_stage_height, anchor_bottom_offset)
    root, sprites = discover_leaf_sprites(inspection)
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
        metadata_rel = Path(
            "assets", "layers", *sprite.asset_components[:-1], f"{sprite.asset_components[-1]}.json"
        )
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
        raise ToolError("sourcePreview resolved to an empty composition.")
    tokens = _preset_tokens(sprites)
    character = {
        "id": character_id,
        "defaultComposition": ["default"],
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
