from __future__ import annotations

import importlib.metadata
import json
import re
import shutil
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .converter import UPSTREAM_COMMIT, ConversionOptions, convert_clip_to_psd
from .csp_report import export_csp_report
from .errors import ToolError
from .layered_pack import PRESET_VERSION, LayeredPackResult, build_layered_character_pack
from .psd_report import inspect_psd, write_psd_report
from .qa import generate_qa
from .util import copy_if_needed, hash_file, publish_directory, write_json

TOOL_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = TOOL_ROOT / "workspace"
PACK_VALIDATOR = TOOL_ROOT / "scripts" / "validate-vronpa-pack.mjs"
CHARACTER_ID = re.compile(r"^[A-Za-z0-9:_-]+$")


def _tool_version(distribution: str) -> str:
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:  # pragma: no cover - editable installs normally provide metadata.
        return "unknown"


def _validate_character_id(character_id: str) -> str:
    if not CHARACTER_ID.fullmatch(character_id):
        raise ToolError(
            "Character id must be a non-empty filesystem-safe V-Ronpa id containing only "
            "letters, digits, ':', '_' or '-': "
            f"{character_id!r}."
        )
    return character_id


def _now() -> datetime:
    return datetime.now(UTC)


def _new_run_id(outputs: Path, digest: str, created_at: datetime) -> str:
    stem = f"{created_at.strftime('%Y%m%dT%H%M%S%fZ')}-{digest[:12]}"
    candidate = stem
    suffix = 1
    while (outputs / candidate).exists():
        suffix += 1
        candidate = f"{stem}-{suffix}"
    return candidate


def validate_pack(pack_root: Path) -> str:
    completed = subprocess.run(
        ["node", str(PACK_VALIDATOR), str(pack_root)],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr or completed.stdout
        raise ToolError(f"Generated character pack failed project schema/semantic validation:\n{detail}")
    return completed.stdout.strip()


def _base_manifest(
    source: Path,
    cached_input: Path,
    digest: str,
    character_id: str,
    character_root: str,
    run_id: str,
    created_at: datetime,
) -> dict[str, Any]:
    stat = source.stat()
    return {
        "schemaVersion": 2,
        "runId": run_id,
        "createdAt": created_at.isoformat(),
        "characterId": character_id,
        "characterRoot": character_root,
        "preset": {"id": "v-ronpa-layered-character", "version": PRESET_VERSION},
        "source": {
            "originalPath": str(source),
            "archivePath": str(cached_input),
            "size": stat.st_size,
            "modifiedAt": datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(),
            "sha256": digest,
        },
        "tool": {
            "version": _tool_version("csp-char-unpack"),
            "clipToPsdCommit": UPSTREAM_COMMIT,
            "psdToolsVersion": _tool_version("psd-tools"),
            "pillowVersion": _tool_version("pillow"),
        },
    }


def _validate_canvas(csp_report: dict[str, Any], psd_report: dict[str, Any]) -> None:
    canvases = csp_report.get("canvas", [])
    if len(canvases) != 1:
        raise ToolError(f"CSP database must contain exactly one Canvas row; found {len(canvases)}.")
    canvas = canvases[0]
    csp_size = (int(float(canvas.get("CanvasWidth", 0))), int(float(canvas.get("CanvasHeight", 0))))
    document = psd_report["document"]
    psd_size = (int(document["width"]), int(document["height"]))
    if csp_size[0] <= 0 or csp_size[1] <= 0:
        raise ToolError(f"CSP canvas must be positive, got {csp_size[0]}x{csp_size[1]}.")
    if csp_size != psd_size:
        raise ToolError(f"CSP/PSD canvas mismatch: CSP {csp_size[0]}x{csp_size[1]}, PSD {psd_size[0]}x{psd_size[1]}.")


def _validate_conversion_structure(csp_report: dict[str, Any], psd_report: dict[str, Any]) -> None:
    csp_nodes = csp_report.get("treeNodes", [])
    psd_nodes = psd_report.get("nodes", [])
    if len(csp_nodes) != len(psd_nodes):
        raise ToolError(f"CSP/PSD layer count mismatch: CSP {len(csp_nodes)}, PSD {len(psd_nodes)}.")
    mismatches: list[str] = []
    for index, (csp_node, psd_node) in enumerate(zip(csp_nodes, psd_nodes, strict=True), start=1):
        if csp_node.get("name") != psd_node.get("name") or bool(csp_node.get("isFolder")) != bool(
            psd_node.get("isGroup")
        ):
            mismatches.append(
                f"#{index} CSP({csp_node.get('name')!r}, folder={bool(csp_node.get('isFolder'))}) "
                f"!= PSD({psd_node.get('name')!r}, group={bool(psd_node.get('isGroup'))})"
            )
    if mismatches:
        raise ToolError("CSP/PSD layer structure mismatch: " + "; ".join(mismatches[:5]))


def _validation_report(
    *,
    status: str,
    character_root: str,
    result: LayeredPackResult | None,
    warnings: list[Any],
    errors: list[str],
    psd_report: dict[str, Any] | None,
) -> dict[str, Any]:
    outside_root: list[str] = []
    if psd_report is not None:
        prefix = f"{character_root}/"
        outside_root = [
            str(node["path"])
            for node in psd_report["nodes"]
            if node["path"] != character_root and not str(node["path"]).startswith(prefix)
        ]
    return {
        "schemaVersion": 1,
        "status": status,
        "presetVersion": PRESET_VERSION,
        "characterRoot": character_root,
        "outsideRootPaths": outside_root,
        "spriteCount": result.sprite_count if result else 0,
        "groups": list(result.groups) if result else [],
        "sourcePreview": list(result.source_preview) if result else [],
        "tokens": result.tokens if result else {},
        "sprites": list(result.sprites) if result else [],
        "warnings": warnings,
        "errors": errors,
    }


def build_pipeline(
    input_file: Path,
    character_id: str,
    character_root: str,
    *,
    _workspace_root: Path | None = None,
) -> Path:
    source = input_file.expanduser().resolve()
    if not source.is_file():
        raise ToolError(f"CSP input does not exist: {source}")
    character_id = _validate_character_id(character_id)
    if not character_root.startswith("/") or character_root == "/":
        raise ToolError(f"Character root must be an absolute PSD folder path such as /MAIN: {character_root!r}.")

    workspace = (_workspace_root or WORKSPACE_ROOT).expanduser().resolve()
    digest = hash_file(source)
    cached_input = workspace / "inputs" / character_id / f"{digest}.clip"
    copy_if_needed(source, cached_input, digest)
    outputs = workspace / "outputs" / character_id
    outputs.mkdir(parents=True, exist_ok=True)
    created_at = _now()
    run_id = _new_run_id(outputs, digest, created_at)
    output = outputs / run_id
    staging = Path(tempfile.mkdtemp(prefix=f".{run_id}.staging-", dir=outputs))
    reports = staging / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    base_manifest = _base_manifest(source, cached_input, digest, character_id, character_root, run_id, created_at)
    result: LayeredPackResult | None = None
    psd_report: dict[str, Any] | None = None
    warnings: list[Any] = []
    errors: list[str] = []

    temporary_parent = workspace / ".tmp"
    temporary_parent.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.TemporaryDirectory(prefix=f"{run_id}-", dir=temporary_parent) as temporary:
            intermediate = Path(temporary)
            psd_file = intermediate / "source.psd"
            sqlite_file = intermediate / "source.sqlite"
            csp_preview = intermediate / "csp-preview.png"
            convert_clip_to_psd(
                cached_input,
                psd_file,
                ConversionOptions(sqlite_file=sqlite_file, preview_file=csp_preview),
            )
            csp_report = export_csp_report(sqlite_file, reports / "csp-layers.json")
            inspection = inspect_psd(psd_file)
            psd_report = write_psd_report(inspection, reports / "psd-document.json")
            _validate_canvas(csp_report, psd_report)
            _validate_conversion_structure(csp_report, psd_report)
            if csp_report["diagnostics"]:
                warnings.extend(csp_report["diagnostics"])
            if psd_report["diagnostics"]:
                warnings.extend(psd_report["diagnostics"])
            pack_root = staging / "character" / character_id
            result = build_layered_character_pack(inspection, pack_root, character_id, character_root)
            warnings.extend(result.warnings)
            schema_validation = validate_pack(pack_root)
            qa_metrics = generate_qa(inspection, csp_preview, pack_root, result, reports)
            write_json(reports / "qa-metrics.json", qa_metrics)

        validation = _validation_report(
            status="passed",
            character_root=character_root,
            result=result,
            warnings=warnings,
            errors=errors,
            psd_report=psd_report,
        )
        write_json(reports / "validation.json", validation)
        manifest = {
            **base_manifest,
            "status": "success",
            "output": {"characterPack": f"character/{character_id}", "reports": "reports"},
            "summary": {
                "cspTreeNodeCount": len(csp_report["treeNodes"]),
                "psdNodeCount": len(psd_report["nodes"]),
                "spriteCount": result.sprite_count,
                "groupCount": len(result.groups),
                "warningCount": len(warnings),
            },
            "schemaValidation": schema_validation,
        }
        write_json(staging / "manifest.json", manifest)
        publish_directory(staging, output)
        return output
    except Exception as error:
        message = str(error) or type(error).__name__
        errors.append(message)
        pack_dir = staging / "character"
        if pack_dir.exists():
            shutil.rmtree(pack_dir)
        write_json(
            reports / "validation.json",
            _validation_report(
                status="failed",
                character_root=character_root,
                result=result,
                warnings=warnings,
                errors=errors,
                psd_report=psd_report,
            ),
        )
        write_json(
            staging / "manifest.json",
            {
                **base_manifest,
                "status": "failed",
                "error": {"type": type(error).__name__, "message": message},
                "output": {"reports": "reports"},
            },
        )
        try:
            publish_directory(staging, output)
        except Exception:
            if staging.exists():
                shutil.rmtree(staging)
            raise
        raise ToolError(f"Build rejected: {message}\nFailed run: {output}") from error


def list_runs(character_id: str, *, _workspace_root: Path | None = None) -> dict[str, Any]:
    character_id = _validate_character_id(character_id)
    workspace = (_workspace_root or WORKSPACE_ROOT).expanduser().resolve()
    outputs = workspace / "outputs" / character_id
    runs: list[dict[str, Any]] = []
    if outputs.is_dir():
        for run_dir in sorted((path for path in outputs.iterdir() if path.is_dir()), reverse=True):
            manifest_file = run_dir / "manifest.json"
            try:
                manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
                runs.append(
                    {
                        "runId": run_dir.name,
                        "status": manifest.get("status", "unknown"),
                        "createdAt": manifest.get("createdAt"),
                        "sourceSha256": manifest.get("source", {}).get("sha256"),
                        "path": str(run_dir),
                    }
                )
            except (OSError, json.JSONDecodeError):
                runs.append({"runId": run_dir.name, "status": "corrupt", "path": str(run_dir)})
    return {"characterId": character_id, "workspace": str(workspace), "runs": runs}


def prune_runs(
    character_id: str,
    keep: int,
    *,
    apply: bool = False,
    _workspace_root: Path | None = None,
) -> dict[str, Any]:
    if keep < 0:
        raise ToolError(f"--keep must be zero or greater, got {keep}.")
    listing = list_runs(character_id, _workspace_root=_workspace_root)
    runs = listing["runs"]
    targets = runs[keep:]
    if apply:
        for target in targets:
            shutil.rmtree(Path(target["path"]))
    return {
        "characterId": listing["characterId"],
        "apply": apply,
        "keep": keep,
        "keptRunIds": [run["runId"] for run in runs[:keep]],
        "deletedRunIds" if apply else "wouldDeleteRunIds": [run["runId"] for run in targets],
        "inputArchivePreserved": True,
    }


def manifest_summary(output: Path) -> str:
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    return json.dumps(
        {
            "runId": manifest["runId"],
            "status": manifest["status"],
            "output": str(output),
            "characterPack": str(output / manifest["output"]["characterPack"]),
            "sourceSha256": manifest["source"]["sha256"],
            "summary": manifest["summary"],
        },
        ensure_ascii=False,
        indent=2,
    )
