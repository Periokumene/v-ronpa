from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from .errors import ToolError


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def hash_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def publish_directory(staging: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise ToolError(f"Versioned run destination unexpectedly exists: {destination}.")
    staging.replace(destination)


def copy_if_needed(source: Path, destination: Path, expected_hash: str) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if hash_file(destination) != expected_hash:
            raise ToolError(f"Input cache collision at {destination}.")
        return
    shutil.copy2(source, destination)


def prepare_png(image: Any) -> Any:
    if image.mode in {"1", "L", "LA", "P", "RGB", "RGBA"}:
        return image
    return image.convert("RGBA")
