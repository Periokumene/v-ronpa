from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

from .errors import ToolError
from .util import hash_file

UPSTREAM_COMMIT = "e8db68c768f52ec91ba7530820f52537261cbad0"
UPSTREAM_SHA256 = "f4a9f3519fdc5974e164023a4bb771488e187370b770d825a28a3a4def33ab29"
TOOL_ROOT = Path(__file__).resolve().parents[2]
VENDORED_CONVERTER = TOOL_ROOT / "third_party" / "clip_to_psd" / "clip_to_psd.py"


@dataclass(frozen=True)
class ConversionOptions:
    psd_version: int = 1
    sqlite_file: Path | None = None
    preview_file: Path | None = None
    blank_psd_preview: bool = False
    text_layer_raster: str = "enable"
    text_layer_vector: str = "invisible"
    gradient_layer_raster: str = "enable"
    gradient_layer_vector: str = "invisible"
    ignore_zlib_errors: bool = False
    psd_empty_bitmap_data: bool = False
    log_level: str = "INFO"
    extra_args: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class ConversionResult:
    command: tuple[str, ...]
    stdout: str
    stderr: str


def ensure_clip_header(path: Path) -> None:
    if not path.is_file():
        raise ToolError(f"CSP input does not exist: {path}")
    with path.open("rb") as stream:
        header = stream.read(8)
    if header != b"CSFCHUNK":
        raise ToolError(f"Not a supported Clip Studio Paint CSFCHUNK file: {path}")


def verify_vendored_converter() -> None:
    if not VENDORED_CONVERTER.is_file():
        raise ToolError(f"Vendored clip_to_psd source is missing: {VENDORED_CONVERTER}")
    actual = hash_file(VENDORED_CONVERTER)
    if actual != UPSTREAM_SHA256:
        raise ToolError(f"Vendored clip_to_psd checksum mismatch: expected {UPSTREAM_SHA256}, got {actual}.")


def convert_clip_to_psd(input_file: Path, output_psd: Path, options: ConversionOptions) -> ConversionResult:
    ensure_clip_header(input_file)
    verify_vendored_converter()
    if options.psd_version not in {1, 2}:
        raise ToolError(f"PSD version must be 1 or 2, got {options.psd_version}.")

    output_psd.parent.mkdir(parents=True, exist_ok=True)
    for optional in (options.sqlite_file, options.preview_file):
        if optional is not None:
            optional.parent.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        str(VENDORED_CONVERTER),
        str(input_file),
        "-o",
        str(output_psd),
        "--psd-version",
        str(options.psd_version),
        "--log-level",
        options.log_level,
        "--text-layer-raster",
        options.text_layer_raster,
        "--text-layer-vector",
        options.text_layer_vector,
        "--gradient-layer-raster",
        options.gradient_layer_raster,
        "--gradient-layer-vector",
        options.gradient_layer_vector,
    ]
    if options.sqlite_file is not None:
        command.extend(["--sqlite-file", str(options.sqlite_file)])
    if options.preview_file is not None:
        command.extend(["--output-preview-image", str(options.preview_file)])
    if options.blank_psd_preview:
        command.append("--blank-psd-preview")
    if options.ignore_zlib_errors:
        command.append("--ignore-zlib-errors")
    if options.psd_empty_bitmap_data:
        command.append("--psd-empty-bitmap-data")
    command.extend(options.extra_args)

    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout)[-6000:]
        raise ToolError(f"clip_to_psd failed with exit code {completed.returncode}:\n{detail}")
    if not output_psd.is_file() or output_psd.read_bytes()[:4] != b"8BPS":
        raise ToolError(f"clip_to_psd did not produce a valid PSD/PSB file: {output_psd}")
    return ConversionResult(tuple(command), completed.stdout, completed.stderr)
