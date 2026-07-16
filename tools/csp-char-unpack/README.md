# CSP layered-character unpack tool

This isolated tool turns a Clip Studio Paint `CSFCHUNK` document into a validated V-Ronpa layered-character pack. It
archives the source, converts through a temporary PSD, validates the authoring tree, composites every leaf folder into a
sprite, generates the mechanical composition tokens, and emits compact QA evidence.

The tool never writes into an app, registers an asset, or edits a `.nani` script. All source archives and runs remain below
this directory's ignored `workspace/`. See [AUTHORING.md](AUTHORING.md) for the CSP folder contract.

## Setup

```bash
cd tools/csp-char-unpack
uv sync --locked
```

## Commands

Build a new immutable run:

```bash
uv run csp-char-unpack build /absolute/path/alice.clip \
  --character-id Alice \
  --character-root /MAIN
```

The generated render space uses two configurable pixel parameters:

- `--reference-stage-height` defaults to `700` and sets `stageScale` to that value divided by the CSP canvas height.
- `--anchor-bottom-offset` defaults to `100` and moves the character anchor upward from the exact `BODY` sprite's
  alpha-bounds bottom. If no valid `BODY` sprite exists, the tool uses the bottom of the union of all sprite alpha bounds.

The anchor X coordinate always uses the CSP canvas center. Positive anchor-bottom offsets move the anchor upward in the
character-local coordinate system.

The CLI has no output-directory option. Every invocation creates a new UTC timestamped run, including repeated builds of
identical input. The input archive is content-addressed and reused.

```bash
uv run csp-char-unpack list --character-id Alice
uv run csp-char-unpack prune --character-id Alice --keep 10
uv run csp-char-unpack prune --character-id Alice --keep 10 --apply
```

`prune` is a dry run unless `--apply` is present. It only removes run directories and never removes archived CSP inputs.

## Workspace

```text
workspace/
  inputs/Alice/<full-sha256>.clip
  outputs/Alice/<utc-timestamp>-<sha12>/
    manifest.json
    reports/
      validation.json
      csp-layers.json
      psd-document.json
      qa-metrics.json
      qa-contact-sheet.png
      diff.png
    character/Alice/
      character.json
      layers.json
      compositions.json
      assets/layers/**
```

PSD, SQLite, CSP preview and intermediate images live only in a temporary workspace and are removed at the end. A rejected
input is still archived; its failed run contains a manifest and diagnostics but no `character/` directory.

## Tokens

`SourcePreview` is the effective visible composition in the CSP, and `Default` references it. Preset `v1` additionally
recognizes only the exact parent groups `ArmL`, `ArmR`, `MOUTH`, `EYE`, and `EFFECT`. It concatenates root-relative folder
components without changing case, for example:

```text
MAIN/ArmL > 0  -> ArmL0   -> MAIN/ArmL>0
MAIN/MOUTH > 2 -> MOUTH2  -> MAIN/MOUTH>2
```

`EYE` and `EFFECT` may have zero visible variants and receive `EYEOff` and `EFFECTOff`, mapped to the supported whole-group
removal expressions. The tool does not generate character-specific concepts such as `Base`, `Happy`, or `Slice02`.

## Manual promotion

After reviewing `reports/`, copy only the self-contained character directory into the intended app location and update the
app manifest or script in a separate, explicitly authorized task:

```bash
cp -R workspace/outputs/Alice/<run-id>/character/Alice /chosen/app/asset/location
```

No promotion command is provided intentionally.

## Verification

```bash
uv run ruff check .
uv run pytest
node scripts/validate-vronpa-pack.mjs workspace/outputs/Alice/<run-id>/character/Alice
```

QA pixel differences are descriptive and never a hard threshold. Structural errors, empty sprites, invalid geometry, token
resolution failures and project schema failures reject the run.
