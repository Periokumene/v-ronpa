from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from psd_tools import PSDImage

from .errors import ToolError
from .util import prepare_png, write_json


def _path_component(name: str) -> str:
    return name.replace("~", "~0").replace("/", "~1")


def _enum_name(value: Any) -> str:
    return str(getattr(value, "name", value))


@dataclass
class PsdNode:
    id: str
    layer: Any = field(repr=False)
    parent_id: str | None
    ancestor_ids: tuple[str, ...]
    path: str
    depth: int
    sibling_index: int
    artifacts: dict[str, Any] = field(default_factory=dict)

    @property
    def bbox(self) -> tuple[int, int, int, int]:
        return tuple(int(value) for value in self.layer.bbox)

    def to_json(self) -> dict[str, Any]:
        effects: list[str] = []
        if self.layer.has_effects():
            try:
                effects = [effect.__class__.__name__ for effect in self.layer.effects]
            except Exception as error:  # pragma: no cover - defensive against unusual PSD descriptors.
                effects = [f"unreadable:{type(error).__name__}"]
        return {
            "id": self.id,
            "parentId": self.parent_id,
            "ancestorIds": list(self.ancestor_ids),
            "path": self.path,
            "name": self.layer.name,
            "depth": self.depth,
            "siblingIndex": self.sibling_index,
            "kind": self.layer.kind,
            "isGroup": self.layer.is_group(),
            "bbox": list(self.bbox),
            "visible": bool(self.layer.visible),
            "effectiveVisible": bool(self.layer.is_visible()),
            "opacity": int(self.layer.opacity),
            "blendMode": _enum_name(self.layer.blend_mode),
            "blendKey": getattr(self.layer.blend_mode, "value", b"").decode("ascii", "replace"),
            "clipping": bool(self.layer.clipping),
            "locks": int(self.layer.locks),
            "hasPixels": bool(self.layer.has_pixels()),
            "hasMask": bool(self.layer.has_mask()),
            "hasVectorMask": bool(self.layer.has_vector_mask()),
            "hasEffects": bool(self.layer.has_effects()),
            "effects": effects,
            "artifacts": self.artifacts,
        }


@dataclass
class PsdInspection:
    psd: PSDImage = field(repr=False)
    nodes: list[PsdNode]
    document: dict[str, Any]
    diagnostics: list[dict[str, str]]

    @property
    def by_layer_object(self) -> dict[int, PsdNode]:
        return {id(node.layer): node for node in self.nodes}

    @property
    def by_id(self) -> dict[str, PsdNode]:
        return {node.id: node for node in self.nodes}


@dataclass(frozen=True)
class CompositeResult:
    image: Any
    skipped_ids: frozenset[str]
    diagnostics: tuple[str, ...]


def inspect_psd(psd_file: Path) -> PsdInspection:
    psd = PSDImage.open(psd_file)
    nodes: list[PsdNode] = []

    def walk(parent: Any, parent_id: str | None, ancestors: tuple[str, ...], parent_path: str, depth: int) -> None:
        for sibling_index, layer in enumerate(parent):
            node_id = f"L{len(nodes) + 1:04d}"
            path = f"{parent_path}/{_path_component(layer.name)}" if parent_path else f"/{_path_component(layer.name)}"
            node = PsdNode(node_id, layer, parent_id, ancestors, path, depth, sibling_index)
            nodes.append(node)
            if layer.is_group():
                walk(layer, node_id, (*ancestors, node_id), path, depth + 1)

    walk(psd, None, (), "", 0)
    color_mode = getattr(psd.color_mode, "name", str(psd.color_mode))
    document = {
        "width": int(psd.width),
        "height": int(psd.height),
        "depth": int(psd.depth),
        "colorMode": color_mode,
        "layerCount": len(nodes),
        "topLevelLayerCount": len(psd),
        "iterationOrder": "background-to-foreground",
    }
    return PsdInspection(psd, nodes, document, [])


def composite_psd(
    inspection: PsdInspection,
    allowed_ids: set[str] | frozenset[str] | None = None,
    *,
    color: tuple[float, float, float] = (1.0, 1.0, 1.0),
    alpha: float = 0.0,
) -> CompositeResult:
    visible_ids = {node.id for node in inspection.nodes if node.layer.is_visible()}
    requested_ids = visible_ids if allowed_ids is None else visible_ids & set(allowed_ids)
    adjustment_ids = {
        node.id
        for node in inspection.nodes
        if "adjustment" in node.layer.__class__.__module__
        or node.layer.kind in {"curves", "levels", "brightnesscontrast"}
    }
    basic_ids = {
        node.id for node in inspection.nodes if node.layer.kind in {"group", "pixel", "solidcolorfill"}
    }
    attempts = [
        ("full", requested_ids),
        ("without-adjustments", requested_ids - adjustment_ids),
        ("basic-raster", requested_ids & basic_ids),
    ]
    by_layer = inspection.by_layer_object
    diagnostics: list[str] = []
    attempted: set[frozenset[str]] = set()
    last_error: Exception | None = None
    for label, selected_ids in attempts:
        frozen_ids = frozenset(selected_ids)
        if frozen_ids in attempted:
            continue
        attempted.add(frozen_ids)

        def layer_filter(layer: Any, selected: frozenset[str] = frozen_ids) -> bool:
            node = by_layer.get(id(layer))
            return node is not None and node.id in selected

        try:
            image = inspection.psd.composite(
                force=True,
                ignore_preview=True,
                color=color,
                alpha=alpha,
                layer_filter=layer_filter,
            )
            skipped = requested_ids - selected_ids
            if skipped:
                diagnostics.append(f"Composite succeeded with '{label}' fallback; skipped nodes: {sorted(skipped)}.")
            return CompositeResult(image, frozenset(skipped), tuple(diagnostics))
        except Exception as error:  # psd-tools deliberately has partial compositing support.
            last_error = error
            diagnostics.append(f"Composite attempt '{label}' failed: {type(error).__name__}: {error}")
    detail = diagnostics[-1] if diagnostics else str(last_error)
    raise ToolError(f"PSD could not be composited after supported fallbacks: {detail}")


def _save_artifact(image: Any, path: Path) -> dict[str, Any]:
    if image is None:
        return {"status": "no-image"}
    image = prepare_png(image)
    image.save(path)
    return {"status": "exported", "path": path.name, "mode": image.mode, "size": list(image.size)}


def export_psd_units(inspection: PsdInspection, units_dir: Path) -> None:
    for node in inspection.nodes:
        node_dir = units_dir / node.id
        node_dir.mkdir(parents=True, exist_ok=True)
        operations = {
            "raw": ("raw.png", lambda current=node: current.layer.topil()),
            "composite": ("composite.png", lambda current=node: current.layer.composite(force=True)),
        }
        if node.layer.has_mask():
            operations["mask"] = ("mask.png", lambda current=node: current.layer.mask.topil())
        for key, (filename, operation) in operations.items():
            try:
                node.artifacts[key] = _save_artifact(operation(), node_dir / filename)
            except Exception as error:  # Unsupported PSD constructs remain inspectable instead of aborting the run.
                node.artifacts[key] = {"status": "error", "error": f"{type(error).__name__}: {error}"}
                inspection.diagnostics.append(
                    {"nodeId": node.id, "artifact": key, "message": node.artifacts[key]["error"]}
                )


def write_psd_report(inspection: PsdInspection, output_file: Path) -> dict[str, Any]:
    report = {
        "schemaVersion": 1,
        "document": inspection.document,
        "nodes": [node.to_json() for node in inspection.nodes],
        "diagnostics": inspection.diagnostics,
    }
    write_json(output_file, report)
    return report
