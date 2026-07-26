from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .errors import ToolError
from .layered_pack import DEFAULT_ANCHOR_BOTTOM_OFFSET, DEFAULT_REFERENCE_STAGE_HEIGHT
from .pipeline import build_pipeline, list_runs, manifest_summary, prune_runs


def _main_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="csp-char-unpack",
        description="Validate and build a versioned V-Ronpa layered-character pack inside the tool workspace.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    build = subparsers.add_parser("build", help="Archive, validate and build a CSP layered-character pack.")
    build.add_argument("input", type=Path)
    build.add_argument("--character-id", required=True)
    build.add_argument("--reference-stage-height", type=float, default=DEFAULT_REFERENCE_STAGE_HEIGHT)
    build.add_argument("--anchor-bottom-offset", type=float, default=DEFAULT_ANCHOR_BOTTOM_OFFSET)

    listing = subparsers.add_parser("list", help="List versioned build runs for one character.")
    listing.add_argument("--character-id", required=True)

    prune = subparsers.add_parser("prune", help="Preview or apply deletion of old run directories.")
    prune.add_argument("--character-id", required=True)
    prune.add_argument("--keep", type=int, required=True)
    prune.add_argument("--apply", action="store_true")
    return parser


def main() -> None:
    args = _main_parser().parse_args()
    try:
        if args.command == "build":
            output = build_pipeline(
                args.input,
                args.character_id,
                reference_stage_height=args.reference_stage_height,
                anchor_bottom_offset=args.anchor_bottom_offset,
            )
            print(manifest_summary(output))
        elif args.command == "list":
            print(json.dumps(list_runs(args.character_id), ensure_ascii=False, indent=2))
        elif args.command == "prune":
            print(
                json.dumps(
                    prune_runs(args.character_id, args.keep, apply=args.apply),
                    ensure_ascii=False,
                    indent=2,
                )
            )
    except ToolError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2) from error
