from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from csp_char_unpack.cli import _main_parser
from csp_char_unpack.converter import ConversionOptions, convert_clip_to_psd, ensure_clip_header
from csp_char_unpack.errors import ToolError
from csp_char_unpack.layered_pack import DEFAULT_ANCHOR_BOTTOM_OFFSET, DEFAULT_REFERENCE_STAGE_HEIGHT
from csp_char_unpack.pipeline import (
    _new_run_id,
    _validate_conversion_structure,
    build_pipeline,
    list_runs,
    prune_runs,
)
from csp_char_unpack.util import hash_file


def test_rejects_invalid_and_truncated_clip_files(tmp_path: Path) -> None:
    invalid = tmp_path / "invalid.clip"
    invalid.write_bytes(b"not-a-clip")
    with pytest.raises(ToolError, match="CSFCHUNK"):
        ensure_clip_header(invalid)

    truncated = tmp_path / "truncated.clip"
    truncated.write_bytes(b"CSFCHUNK")
    with pytest.raises(ToolError, match="clip_to_psd failed"):
        convert_clip_to_psd(truncated, tmp_path / "truncated.psd", ConversionOptions(blank_psd_preview=True))


def test_failed_build_archives_input_and_publishes_only_diagnostics(tmp_path: Path) -> None:
    source = tmp_path / "broken.clip"
    source.write_bytes(b"CSFCHUNK")
    workspace = tmp_path / "workspace"

    with pytest.raises(ToolError, match="Failed run"):
        build_pipeline(source, "Alice", _workspace_root=workspace)

    digest = hash_file(source)
    assert (workspace / "inputs/Alice" / f"{digest}.clip").read_bytes() == b"CSFCHUNK"
    runs = list((workspace / "outputs/Alice").iterdir())
    assert len(runs) == 1
    manifest = json.loads((runs[0] / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["status"] == "failed"
    assert manifest["characterRoot"] == "/root"
    assert not (runs[0] / "character").exists()
    assert (runs[0] / "reports/validation.json").is_file()


def test_version_ids_never_overwrite_and_prune_is_dry_run_by_default(tmp_path: Path) -> None:
    outputs = tmp_path / "workspace/outputs/Alice"
    outputs.mkdir(parents=True)
    created = datetime(2026, 7, 16, tzinfo=UTC)
    first = _new_run_id(outputs, "a" * 64, created)
    (outputs / first).mkdir()
    second = _new_run_id(outputs, "a" * 64, created)
    assert first != second

    for index, run_id in enumerate([first, second]):
        run = outputs / run_id
        run.mkdir(exist_ok=True)
        (run / "manifest.json").write_text(
            json.dumps({"status": "success", "createdAt": str(index), "source": {"sha256": "a" * 64}}),
            encoding="utf-8",
        )
    workspace = tmp_path / "workspace"
    listing = list_runs("Alice", _workspace_root=workspace)
    assert len(listing["runs"]) == 2
    preview = prune_runs("Alice", 1, _workspace_root=workspace)
    assert len(preview["wouldDeleteRunIds"]) == 1
    assert len(list(outputs.iterdir())) == 2
    applied = prune_runs("Alice", 1, apply=True, _workspace_root=workspace)
    assert len(applied["deletedRunIds"]) == 1
    assert len(list(outputs.iterdir())) == 1


def test_character_id_cannot_escape_workspace(tmp_path: Path) -> None:
    source = tmp_path / "broken.clip"
    source.write_bytes(b"CSFCHUNK")
    with pytest.raises(ToolError, match="filesystem-safe"):
        build_pipeline(source, "../Alice", _workspace_root=tmp_path / "workspace")


def test_rejects_csp_psd_structure_mismatch() -> None:
    csp = {"treeNodes": [{"name": "MAIN", "isFolder": True}]}
    psd = {"nodes": [{"name": "RENAMED", "isGroup": True}]}
    with pytest.raises(ToolError, match="layer structure mismatch"):
        _validate_conversion_structure(csp, psd)

    with pytest.raises(ToolError, match="layer count mismatch"):
        _validate_conversion_structure(csp, {"nodes": []})


def test_v3_cli_requires_character_id_and_rejects_removed_character_root() -> None:
    parser = _main_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["build", "alice.clip"])
    with pytest.raises(SystemExit):
        parser.parse_args(["list"])
    with pytest.raises(SystemExit):
        parser.parse_args(
            ["build", "alice.clip", "--character-id", "alice", "--character-root", "/MAIN"]
        )

    parsed = parser.parse_args(["build", "alice.clip", "--character-id", "alice"])
    assert parsed.character_id == "alice"
    assert parsed.reference_stage_height == DEFAULT_REFERENCE_STAGE_HEIGHT == 900.0
    assert parsed.anchor_bottom_offset == DEFAULT_ANCHOR_BOTTOM_OFFSET == 350.0
    assert not hasattr(parsed, "character_root")
