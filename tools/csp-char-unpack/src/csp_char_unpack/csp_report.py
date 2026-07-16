from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from .util import hash_bytes, write_json

CSP_BLEND_MODES = {
    0: "normal",
    1: "darken",
    2: "multiply",
    3: "color-burn",
    4: "linear-burn",
    5: "subtract",
    6: "darker-color",
    7: "lighten",
    8: "screen",
    9: "color-dodge",
    10: "glow-dodge",
    11: "add",
    12: "add-glow",
    13: "lighter-color",
    14: "overlay",
    15: "soft-light",
    16: "hard-light",
    17: "vivid-light",
    18: "linear-light",
    19: "pin-light",
    20: "hard-mix",
    21: "difference",
    22: "exclusion",
    23: "hue",
    24: "saturation",
    25: "color",
    26: "luminosity",
    30: "pass-through",
    36: "divide",
}


def _json_value(value: Any) -> Any:
    if isinstance(value, bytes):
        return {"type": "blob", "byteLength": len(value), "sha256": hash_bytes(value)}
    return value


def _row(row: sqlite3.Row) -> dict[str, Any]:
    return dict(zip(row.keys(), map(_json_value, row), strict=True))


def export_csp_report(sqlite_file: Path, output_file: Path) -> dict[str, Any]:
    diagnostics: list[str] = []
    with sqlite3.connect(sqlite_file) as connection:
        connection.row_factory = sqlite3.Row
        table_names = [
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").fetchall()
        ]
        canvas_rows = [_row(row) for row in connection.execute("SELECT * FROM Canvas").fetchall()]
        layer_rows_raw = connection.execute("SELECT * FROM Layer ORDER BY _PW_ID").fetchall()
        layer_rows = [_row(row) for row in layer_rows_raw]

    canvas = canvas_rows[0] if canvas_rows else {}
    root_main_id = canvas.get("CanvasRootFolder")
    by_main_id = {int(row["MainId"]): row for row in layer_rows_raw if row["MainId"] is not None}
    visited: set[int] = set()
    tree_nodes: list[dict[str, Any]] = []

    def walk_chain(first_main_id: int | None, parent_node_id: str | None, parent_path: str) -> None:
        current = int(first_main_id or 0)
        chain_seen: set[int] = set()
        while current:
            if current in chain_seen:
                diagnostics.append(f"Cycle detected in LayerNextIndex chain at MainId {current}.")
                return
            chain_seen.add(current)
            source = by_main_id.get(current)
            if source is None:
                diagnostics.append(f"Layer link references missing MainId {current}.")
                return
            visited.add(current)
            node_id = f"CSP{len(tree_nodes) + 1:04d}"
            name = str(source["LayerName"] or "")
            component = name or f"<unnamed:{current}>"
            path = f"{parent_path}/{component}" if parent_path else f"/{component}"
            composite = source["LayerComposite"]
            tree_nodes.append(
                {
                    "id": node_id,
                    "mainId": current,
                    "parentId": parent_node_id,
                    "name": name,
                    "path": path,
                    "layerType": source["LayerType"],
                    "isFolder": bool(source["LayerFolder"]),
                    "visible": bool((source["LayerVisibility"] or 0) & 1),
                    "opacityCsp": source["LayerOpacity"],
                    "blendModeCsp": composite,
                    "blendMode": CSP_BLEND_MODES.get(composite, f"unknown:{composite}"),
                    "clipping": bool(source["LayerClip"]),
                    "lockFlags": source["LayerLock"],
                    "firstChildMainId": source["LayerFirstChildIndex"],
                    "nextMainId": source["LayerNextIndex"],
                }
            )
            walk_chain(source["LayerFirstChildIndex"], node_id, path)
            current = int(source["LayerNextIndex"] or 0)

    root_row = by_main_id.get(int(root_main_id or 0))
    if root_row is None:
        diagnostics.append(f"Canvas root layer MainId {root_main_id!r} was not found.")
    else:
        visited.add(int(root_main_id))
        walk_chain(root_row["LayerFirstChildIndex"], None, "")

    unvisited = sorted(set(by_main_id) - visited)
    if unvisited:
        diagnostics.append(f"Unreachable Layer rows retained in rawLayers: {unvisited}.")

    report = {
        "schemaVersion": 1,
        "sourceDatabase": sqlite_file.name,
        "tables": table_names,
        "canvas": canvas_rows,
        "rootMainId": root_main_id,
        "treeNodes": tree_nodes,
        "rawLayers": layer_rows,
        "diagnostics": diagnostics,
    }
    write_json(output_file, report)
    return report
