# CSP Layered-Character Unpack Tool

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `tools/csp-char-unpack`

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-07-14`
- Updated: `2026-07-16`

## Allowed Paths

- `tools/csp-char-unpack/**`

## Forbidden Paths

- `apps/**`
- `packages/**`
- `docs/**`
- `package.json`
- `pnpm-lock.yaml`

## Goal

Provide one isolated CSP-to-layered-character pipeline with content-addressed source archives, immutable runs, strict folder
validation, mechanical token generation, project schema/semantic validation and compact visual QA.

## Public Behavior

- `build` can only publish below the tool-owned ignored workspace.
- Every invocation creates a new run; invalid sources retain archive and diagnostics but no character pack.
- `list` reports runs; `prune` is dry-run by default and never deletes source archives.
- `/MAIN` leaf folders become sprites. Default comes from CSP visibility; only the v1 Arm/EYE/EFFECT/MOUTH aliases are
  generated.
- Generated packs are self-contained but are never copied or registered in an app.

## Regression Requirements

- File boundary: invalid/truncated CSFCHUNK, safe character ids, full-hash archive and failed-run isolation.
- Structure boundary: missing/leaf roots, mixed structural folders, empty images, boundary properties and visibility
  cardinality.
- Token boundary: exact case-preserving aliases, EYE/EFFECT Off tokens, collision rejection and resolver validation.
- Lifecycle boundary: distinct version ids, list, dry-run prune, applied prune and preserved input archive.
- End to end: vendored MIT fixture converts to a nontrivial PSD; latest ignored Alice builds 25 sprites from an 800x1000
  `/MAIN` tree and passes project validation.

## Required Gates

```bash
cd tools/csp-char-unpack
uv sync --locked
uv run ruff check .
uv run pytest
cd ../..
pnpm typecheck
pnpm validate:boundaries
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task tools/csp-char-unpack/TASK.md
```

## Done When

- Tool tests and project gates pass.
- Latest Alice ignored output contains a validated character pack and compact reports.
- Every tracked diff relative to the baseline is under `tools/csp-char-unpack/**`.
