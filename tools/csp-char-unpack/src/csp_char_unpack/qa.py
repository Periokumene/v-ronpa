from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageOps, ImageStat

from .errors import ToolError
from .layered_pack import LayeredPackResult
from .psd_report import PsdInspection, composite_psd


def _difference(left: Image.Image, right: Image.Image) -> tuple[Image.Image, dict[str, Any]]:
    left = left.convert("RGBA")
    right = right.convert("RGBA")
    original_left_size = left.size
    resampled = left.size != right.size
    if resampled:
        left = left.resize(right.size, Image.Resampling.NEAREST)
    black = Image.new("RGBA", right.size, (0, 0, 0, 255))
    white = Image.new("RGBA", right.size, (255, 255, 255, 255))
    left_black = Image.alpha_composite(black, left).convert("RGB")
    right_black = Image.alpha_composite(black, right).convert("RGB")
    left_white = Image.alpha_composite(white, left).convert("RGB")
    right_white = Image.alpha_composite(white, right).convert("RGB")
    black_difference = ImageChops.difference(left_black, right_black)
    white_difference = ImageChops.difference(left_white, right_white)
    alpha_difference = ImageChops.difference(left.getchannel("A"), right.getchannel("A"))
    visual_difference = ImageChops.lighter(black_difference, white_difference)
    bbox = visual_difference.getbbox()
    black_stats = ImageStat.Stat(black_difference)
    white_stats = ImageStat.Stat(white_difference)
    alpha_stats = ImageStat.Stat(alpha_difference)
    return visual_difference.convert("RGBA"), {
        "leftSize": list(original_left_size),
        "rightSize": list(right.size),
        "leftResampled": resampled,
        "exactMatch": bbox is None,
        "differenceBbox": list(bbox) if bbox else None,
        "meanRgbOnBlack": [round(value, 6) for value in black_stats.mean],
        "rmsRgbOnBlack": [round(value, 6) for value in black_stats.rms],
        "meanRgbOnWhite": [round(value, 6) for value in white_stats.mean],
        "rmsRgbOnWhite": [round(value, 6) for value in white_stats.rms],
        "meanAlpha": round(alpha_stats.mean[0], 6),
        "rmsAlpha": round(alpha_stats.rms[0], 6),
    }


def _reconstruct_records(
    pack_root: Path,
    records: list[dict[str, Any]],
    canvas_size: tuple[int, int],
) -> Image.Image:
    records = sorted(
        records,
        key=lambda record: (int(record["drawOrder"]), str(record["id"])),
    )
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    for record in records:
        asset = Image.open(pack_root / record["asset"]).convert("RGBA")
        metadata = json.loads((pack_root / record["metadata"]).read_text(encoding="utf-8"))
        left, top, right, bottom = (int(value) for value in record["alphaBounds"])
        if asset.size != (right - left, bottom - top):
            raise ToolError(f"Exported sprite geometry mismatch: {record['id']}.")
        position = metadata["localTransform"]["position"]
        metadata_left = int(position["x"])
        metadata_top = canvas_size[1] - int(position["y"])
        if (metadata_left, metadata_top) != (left, top):
            raise ToolError(f"Exported sprite metadata alignment mismatch: {record['id']}.")
        canvas.alpha_composite(asset, dest=(left, top))
    if canvas.getchannel("A").getbbox() is None:
        raise ToolError("Layered reconstruction is empty.")
    return canvas


def _reconstruct_pack(pack_root: Path, result: LayeredPackResult, canvas_size: tuple[int, int]) -> Image.Image:
    selected = set(result.source_preview)
    return _reconstruct_records(
        pack_root,
        [record for record in result.sprites if record["id"] in selected],
        canvas_size,
    )


def _contact_sheet(panels: list[tuple[str, Image.Image]], output: Path) -> None:
    panel_width, panel_height = 400, 500
    label_height = 28
    sheet = Image.new("RGBA", (panel_width * 2, (panel_height + label_height) * 2), (38, 38, 38, 255))
    draw = ImageDraw.Draw(sheet)
    for index, (label, image) in enumerate(panels):
        thumb = ImageOps.contain(image.convert("RGBA"), (panel_width, panel_height), Image.Resampling.LANCZOS)
        column, row = index % 2, index // 2
        x = column * panel_width + (panel_width - thumb.width) // 2
        y = row * (panel_height + label_height) + label_height + (panel_height - thumb.height) // 2
        draw.text((column * panel_width + 8, row * (panel_height + label_height) + 7), label, fill="white")
        sheet.alpha_composite(thumb, dest=(x, y))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def _variant_crop(
    records: list[dict[str, Any]],
    canvas_size: tuple[int, int],
) -> tuple[int, int, int, int]:
    bounds = [[int(value) for value in record["alphaBounds"]] for record in records]
    left = min(item[0] for item in bounds)
    top = min(item[1] for item in bounds)
    right = max(item[2] for item in bounds)
    bottom = max(item[3] for item in bounds)
    padding = max(64, round(max(right - left, bottom - top) * 0.15))
    return (
        max(0, left - padding),
        max(0, top - padding),
        min(canvas_size[0], right + padding),
        min(canvas_size[1], bottom + padding),
    )


def _variant_sheet(
    pack_root: Path,
    result: LayeredPackResult,
    group: str,
    canvas_size: tuple[int, int],
    output: Path,
) -> int:
    variants = sorted(
        (record for record in result.sprites if record["group"] == group),
        key=lambda record: int(record["layer"]),
    )
    if not variants:
        raise ToolError(f"Variant QA group has no sprites: {group}.")
    selected_default = set(result.source_preview)
    crop = _variant_crop(variants, canvas_size)
    panels: list[tuple[str, Image.Image]] = []
    for variant in variants:
        selected = {
            expression
            for expression in selected_default
            if not expression.startswith(f"{group}>")
        }
        selected.add(str(variant["id"]))
        composite = _reconstruct_records(
            pack_root,
            [record for record in result.sprites if record["id"] in selected],
            canvas_size,
        )
        panels.append((str(variant["layer"]), composite.crop(crop)))

    columns = min(3, len(panels))
    rows = math.ceil(len(panels) / columns)
    panel_width, panel_height = 360, 420
    label_height = 30
    sheet = Image.new(
        "RGBA",
        (panel_width * columns, (panel_height + label_height) * rows),
        (38, 38, 38, 255),
    )
    draw = ImageDraw.Draw(sheet)
    for index, (label, image) in enumerate(panels):
        thumb = ImageOps.contain(
            image.convert("RGBA"),
            (panel_width, panel_height),
            Image.Resampling.LANCZOS,
        )
        column, row = index % columns, index // columns
        x = column * panel_width + (panel_width - thumb.width) // 2
        y = row * (panel_height + label_height) + label_height + (panel_height - thumb.height) // 2
        draw.text(
            (column * panel_width + 10, row * (panel_height + label_height) + 8),
            label,
            fill="white",
        )
        sheet.alpha_composite(thumb, dest=(x, y))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)
    return len(panels)


def generate_qa(
    inspection: PsdInspection,
    csp_preview: Path,
    pack_root: Path,
    result: LayeredPackResult,
    reports_dir: Path,
) -> dict[str, Any]:
    width, height = int(inspection.psd.width), int(inspection.psd.height)
    full_psd = composite_psd(inspection).image.convert("RGBA")
    root = inspection.by_id[result.root_node_id]
    root_psd = root.layer.composite(viewport=(0, 0, width, height), force=True)
    if root_psd is None:
        raise ToolError("Character root produced no QA composite.")
    root_psd = root_psd.convert("RGBA")
    if root_psd.getchannel("A").getbbox() is None:
        raise ToolError("Character root QA composite is empty.")
    layered = _reconstruct_pack(pack_root, result, (width, height))
    csp = Image.open(csp_preview).convert("RGBA")

    _csp_diff, csp_metrics = _difference(csp, full_psd)
    layered_diff, layered_metrics = _difference(root_psd, layered)
    reports_dir.mkdir(parents=True, exist_ok=True)
    layered_diff.save(reports_dir / "diff.png")
    _contact_sheet(
        [("CSP preview", csp), ("PSD full", full_psd), ("PSD character root", root_psd), ("Layered Default", layered)],
        reports_dir / "qa-contact-sheet.png",
    )
    variant_sheets: list[dict[str, Any]] = []
    variant_groups = sorted(
        {str(record["group"]) for record in result.sprites if str(record["group"]) != "root"},
        key=lambda group: min(
            int(record["drawOrder"]) for record in result.sprites if record["group"] == group
        ),
    )
    for group in variant_groups:
        group_name = group.rsplit("/", 1)[-1]
        relative_path = Path("variants", f"{group_name}.png")
        panel_count = _variant_sheet(
            pack_root,
            result,
            group,
            (width, height),
            reports_dir / relative_path,
        )
        variant_sheets.append(
            {
                "group": group,
                "variantCount": panel_count,
                "sheet": relative_path.as_posix(),
            }
        )
    return {
        "schemaVersion": 2,
        "gating": False,
        "cspPreviewVsPsdDocument": csp_metrics,
        "psdRootVsLayeredDefault": layered_metrics,
        "variantSheets": variant_sheets,
    }
