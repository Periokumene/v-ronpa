# CSP layered-character unpack tool

This isolated tool turns a Clip Studio Paint `CSFCHUNK` document into a validated V-Ronpa layered-character pack. It
archives the source, converts through a temporary PSD, validates the v3 authoring tree, composites every sprite leaf,
generates mechanical lower-camel composition tokens, and emits QA evidence.

The tool never writes into an app, registers an asset, or edits a `.nani` script. Source archives and immutable runs remain
below this directory's ignored `workspace/`. See [AUTHORING.md](AUTHORING.md) for the authoritative v3 contract.

## Setup and commands

```bash
cd tools/csp-char-unpack
uv sync --locked

uv run csp-char-unpack build /absolute/path/alice.clip --character-id alice
uv run csp-char-unpack build /absolute/path/alice.clip --character-id alice \
  --reference-stage-height 900 \
  --anchor-bottom-offset 350

uv run csp-char-unpack list --character-id alice
uv run csp-char-unpack prune --character-id alice --keep 10
uv run csp-char-unpack prune --character-id alice --keep 10 --apply
```

`--character-id` is required. The root is always `/root`; there is no root-selection option. Render parameters default to
`900` and `350`. The anchor uses the exact `/root/body/0` alpha bottom, and invalid body content rejects the run.

The CLI has no output-directory option. Every build creates a new UTC timestamped run, including repeated builds of
identical input. `prune` is a dry run unless `--apply` is present; it only removes run directories and never source
archives.

## Workspace and QA

```text
workspace/
  inputs/alice/<full-sha256>.clip
  outputs/alice/<utc-timestamp>-<sha12>/
    manifest.json
    reports/
      validation.json
      csp-layers.json
      psd-document.json
      qa-metrics.json
      qa-contact-sheet.png
      diff.png
      variants/<group>.png
    character/alice/
      character.json
      layers.json
      compositions.json
      assets/layers/**
```

The main contact sheet compares the CSP preview, full PSD, `/root`, and reconstructed default. Each variant sheet starts
from the default composition and replaces one group through all numeric variants; effect variants are explicitly added
even though the group defaults off. The required `body` group receives the same coverage. `qa-metrics.json` records the
panel count and sheet path for every group.

PSD, SQLite, CSP preview, and intermediate images live only in temporary storage. A rejected input remains archived; its
failed run retains diagnostics and reports but no partial `character/` directory.

## Generated tokens

For a group such as `armR`:

```text
/root/armR/0 -> armR0 -> root/armR>0
/root/armR/1 -> armR1 -> root/armR>1
```

The required body group uses the same mechanical mapping:

```text
/root/body/0 -> body0 -> root/body>0
```

Every pack defines `sourcePreview`, `default`, and `character.defaultComposition: ["default"]`. Any optional group can be
added without a tool update. `body` does not receive an off token; `effect` alone receives `effectOff`. The tool does not
emit semantic aliases.

## Manual promotion

After reviewing reports, mirror only the accepted character directory into the explicitly chosen app target. The target
is a replacement boundary; never merge stale JSON or PNG files into the new pack.

```bash
source=workspace/outputs/alice/<run-id>/character/alice
target=/chosen/app/asset/location/alice
mkdir -p "$target"
rsync -a --delete "$source/" "$target/"

cd /path/to/v-ronpa
pnpm generate:assets
pnpm validate:assets
```

No promotion command or tracked source receipt is provided. Promotion remains an explicitly authorized, reviewed task.

## Verification

```bash
uv run ruff check .
uv run pytest
node scripts/validate-vronpa-pack.mjs workspace/outputs/alice/<run-id>/character/alice
```

QA pixel differences are descriptive rather than threshold-gated. Structural errors, invalid visibility, empty sprites,
geometry/token resolution failures, inconsistent source-pixel scale, and project schema failures reject the run.
