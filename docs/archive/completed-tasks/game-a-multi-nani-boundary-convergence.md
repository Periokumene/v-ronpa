# Game A Multi-Nani Boundary Convergence Hard Cut

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/game-a-multi-nani-runtime`

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-07-19`
- Updated: `2026-07-19`
- Completed Commit: `This atomic follow-up commit`
- Archive Target: `docs/archive/completed-tasks/game-a-multi-nani-boundary-convergence.md`

## Goal

Hard-cut the remaining multi-Nani ownership drift: runtime-owned execution
history, shared Devtools HMR/host transactions, shell-owned Pixi preparation,
and generated entry/catalog authority, with no compatibility layer.

## Context

- CCR: `docs/ccr/game-a-multi-nani-boundary-convergence-hard-cut.md`
- Predecessor: `docs/ccr/game-a-multi-nani-runtime-hard-cut.md`
- Runtime: `packages/app-vn-runtime`
- Devtools: `packages/app-vn-devtools`
- Product composition: `packages/app-vn-shell`, `apps/game-a`, `apps/game-harness`
- Generation: `scripts/generate-assets.mjs`

## Constraints

- Do not change Manifest v4, SaveData v8, DB v10, or Devtools session v3.
- Do not add migration, compatibility, alias, forwarding, or deprecated APIs.
- Do not change dependencies, `package.json`, or `pnpm-lock.yaml`.
- Keep Story/runtime state renderer-agnostic and preserve the canonical VN ports.
- Keep test Nani out of production catalogs and bundles.

## Allowed Paths

- `README.md`
- `apps/game-a/**`
- `apps/game-harness/**`
- `packages/asset-registry/**`
- `packages/contracts/**`
- `packages/media-save/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `packages/story-engine/**`
- `packages/story-play/**`
- `packages/app-vn-session/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-runtime/**`
- `packages/app-vn-devtools/**`
- `packages/app-vn-shell/**`
- `packages/layered-character/**`
- `packages/pixi-presenter/**`
- `packages/pixi-stage-model/**`
- `packages/runtime-assets-pixi/**`
- `playwright.config.ts`
- `scripts/**`
- `tests/smoke/**`
- `docs/**`

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`
- Persistence schema or migration code.
- Unrelated Navi, Trial, R3F, renderer, or application packages.

## Contracts

- `VnRuntimeDefinition` is the shared entry/catalog composition.
- `VnStoryRuntime.executedScriptPaths` is the live execution-history authority.
- Debug inspection uses script terminology only.
- Devtools host mutations use the shared host-transaction boundary.
- Asset configuration owns entry locator and catalog membership.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Runtime execution history | Unit tests cover A→B→C, restore, reset, failure, and cancellation |
| HMR impact | Unit tests cover inactive, future, current, and previously executed scripts with fixed points |
| Script inspection authority | Unit and smoke tests keep chapter-02 previewable before/after runtime navigation |
| Host transaction | Shared package tests cover preflight, rollback, irreversible restore, Flow error, and session settlement |
| Pixi preparation | Shell tests cover initial/navigation/restore plans and failure Results |
| Generated authority | Generator/app tests prove one locator and ordered catalog per entry |
| Cleanup | Public-surface and cleanup guards reject former symbols and duplicated wiring |
| Product regression | Game A and Harness builds/smoke pass; production excludes test Nani |

## Regression Requirements

- Normal: opening → chapter-02 keeps Workbench Preview and runtime state aligned.
- Boundary: an invisibly executed intermediate script is classified as runtime-impacting.
- Rejection: broken candidate, preparation failure, restore rejection, and late cancellation preserve installed state.
- No-op: a valid future-script HMR changes only the catalog record.
- Persistence: existing v4/v8/v10/v3 shapes remain unchanged and no migration appears.

## Dependency Changes

None.

## Required Gates

```bash
pnpm generate:assets
pnpm generate:command-docs
pnpm typecheck
pnpm validate:contracts
pnpm validate:command-docs
pnpm validate:assets
pnpm validate:boundaries
pnpm validate:app-cleanup
pnpm validate:vn-runtime-cleanup
pnpm test
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/game-a-multi-nani-boundary-convergence.md
pnpm validate:baseline
git diff --check
```

## Programmatic Acceptance

- Every acceptance row has a readable package or smoke regression.
- Current architecture contains one entry/catalog, history, host transaction,
  and Pixi preparation authority.
- Repository search finds no old debug names, app-local generic transaction,
  old asset-config fields, or preparation reason.
- Dependency manifests are byte-for-byte unchanged.

## Manual Acceptance

- Inspect Game A app code for policy-only Devtools and Pixi wiring.
- Inspect chapter-02 Preview before and after normal navigation.
- Verify a future-script HMR leaves the stage and Story session unchanged.
- Review 420px, 320px, and overlay evidence.

## Review Packet

- Changed/removed public-symbol summary.
- Regression-to-test mapping and gate output.
- Screenshot paths and layout labels.
- Residual risks limited to declared non-goals.

## Validation Evidence

- `pnpm validate:contracts`: 58 files and 512 tests passed.
- `pnpm test`: 95 files and 730 tests passed.
- `pnpm test:smoke`: 12 browser tests passed, including fixed-point
  chapter-02 Preview, normal cross-script navigation, and future-script HMR
  with unchanged Story/Pixi/session state.
- Game A and Harness production builds passed; Game A production validation
  confirmed that test Nani catalogs do not enter the product bundle.
- Contract, command-doc, asset, boundary, CCR, app cleanup, VN runtime cleanup,
  subsystem, extension, diagnostics stress/quality, and baseline gates passed.
- Visual evidence:
  - `test-results/game-a-multi-nani-script-selector-420.png`
  - `test-results/game-a-multi-nani-chapter-02-view-320.png`
  - `test-results/game-a-multi-nani-fixed-point-chapter-view.png`
  - `test-results/game-a-multi-nani-cross-script-preview-overlay.png`
  - `test-results/game-a-multi-nani-chapter-02-load.png`
  - `test-results/game-a-multi-nani-future-hmr-stage-unchanged.png`
- `package.json` and `pnpm-lock.yaml` are unchanged.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Revert this follow-up commit together. No storage or schema migration exists.

## Done When

- All required gates pass.
- The task is marked Done with the completed commit.
- After merge, move it to the archive target.
