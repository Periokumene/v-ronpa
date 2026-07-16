from __future__ import annotations

from pathlib import Path

from csp_char_unpack.converter import ConversionOptions, convert_clip_to_psd
from csp_char_unpack.psd_report import inspect_psd

FIXTURE = Path(__file__).parent / "fixtures" / "upstream" / "test_export_all_features.clip"


def test_mit_fixture_preserves_nontrivial_psd_structure(tmp_path: Path) -> None:
    psd_file = tmp_path / "fixture.psd"
    sqlite_file = tmp_path / "fixture.sqlite"
    preview_file = tmp_path / "preview.png"
    convert_clip_to_psd(
        FIXTURE,
        psd_file,
        ConversionOptions(sqlite_file=sqlite_file, preview_file=preview_file, log_level="WARNING"),
    )
    inspection = inspect_psd(psd_file)

    assert psd_file.read_bytes()[:4] == b"8BPS"
    assert sqlite_file.stat().st_size > 0
    assert preview_file.stat().st_size > 0
    assert any(node.layer.is_group() for node in inspection.nodes)
    assert any(node.layer.blend_mode.name != "NORMAL" for node in inspection.nodes)
    assert any(node.layer.has_mask() for node in inspection.nodes)
    assert any(node.layer.kind in {"type", "gradientfill", "solidcolorfill"} for node in inspection.nodes)
