# VS Code Nani 0.8.0 Alignment

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/vscode-nani-v0.8.0-alignment`

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-08-05`
- Updated: `2026-08-05`
- Completed Commit: `cd84670`
- Archive Target: `docs/archive/completed-tasks/vscode-nani-v0.8.0-alignment.md`

## Goal

Align the VS Code Nani extension with Asset Protocol v5, PinP, and FontFaceId,
including project-aware asset diagnostics and navigation, without changing
project runtime, generation, requirement, or catalog-link behavior.

## Context

- Extension baseline tag: `vscode-nani-v0.7.0`.
- Contract authority: `docs/ccr/nani-command-authoring-asset-reference.md`.
- Existing user changes below `apps/game-a/**` are outside this task.

## Constraints

- Shared changes are limited to additive authoring metadata in contracts.
- Do not modify `nani-project`, parser, compiler, asset packages, generator,
  Apps, runtime, renderer, root manifests, or lockfile.
- VS Code asset errors must not affect shared execution disposition.
- FontFace support consumes the existing parser contract only.

## Allowed Paths

- `tools/vscode-nani/**`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/index.test.ts`
- `docs/ccr/nani-command-authoring-asset-reference.md`
- `docs/tasks/vscode-nani-v0.8.0-alignment.md`

## Forbidden Paths

- `apps/**`
- `packages/nani-project/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `packages/asset-project/**`
- `packages/asset-registry/**`
- `packages/app-*/**`, renderer and presenter packages
- `scripts/**`, root `package.json`, and `pnpm-lock.yaml`

## Contracts

- Preserve `NaniCommandParamSpec.resource` behavior.
- Add only `NaniCommandParamSpec.authoring.assetReference` with selector role.
- Preserve AssetId, AssetRequirement, ScenarioIR, RuntimeScript, and manifest
  shapes and semantics.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Catalog-driven stop selectors | Contracts and extension completion tests |
| Static asset errors | Unit and Extension Host exact-diagnostic tests |
| Asset hover and definition | Unit and Extension Host provider tests |
| Live project refresh | Extension Host create/delete/rename/config tests |
| PinP and FontFace alignment | Grammar, completion, hover, and diagnostic tests |
| No main-project behavior change | Unmodified shared tests and boundary diff audit |

## Regression Requirements

- Normal: valid load and selector references complete, hover, and navigate.
- Rejection: invalid, missing, wrong-capability, and missing-character references
  publish exact `nani-assets` errors.
- Boundary: dynamic, group-only, wildcard, untrusted, non-file, and unconfigured
  documents do not receive project asset errors.
- Refresh: asset/config creation, deletion, rename, and repair invalidate one
  coherent project generation.
- Compatibility: existing loading resource bindings and shared project behavior
  remain unchanged.

Test placement:

- `packages/contracts/src/index.test.ts`
- `tools/vscode-nani/src/**/*.test.ts`
- `tools/vscode-nani/test/**/*.test.cts`

## Dependency Changes

None. Do not edit package manifests or `pnpm-lock.yaml`.

## CCR Triggers

- Any shared change beyond the accepted authoring metadata stops this task.
- Any need to change runtime or App behavior becomes a separate task.

## Required Gates

```bash
pnpm --filter v-ronpa-nani test
pnpm --filter v-ronpa-nani check-types
pnpm --filter v-ronpa-nani build:prod
pnpm --filter v-ronpa-nani test:extension
pnpm vitest run packages/contracts/src/index.test.ts tools/vscode-nani/src
pnpm validate:contracts
pnpm validate:ccr
pnpm validate:boundaries
pnpm typecheck
pnpm test
pnpm validate:baseline
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
BASE_REF=integration/v-ronpa-baseline pnpm validate:task-boundaries -- --task docs/tasks/vscode-nani-v0.8.0-alignment.md
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/vscode-nani-v0.8.0-alignment.md
```

## Programmatic Acceptance

- Every changed public extension behavior has normal and rejection coverage.
- Shared resource requirements and execution behavior remain unchanged.
- All required gates pass from a clean worktree.
- The packaged VSIX reports version 0.8.0 and has a recorded SHA-256.

## Manual Acceptance

- Diff contains only Allowed Paths.
- Resource errors are sourced as `nani-assets`, not shared project fatal errors.
- Selector support comes from catalog metadata, not an extension command map.
- Existing Game A worktree changes remain untouched.

## Review Packet

- Changed-files and strict-boundary summary.
- Tests, gates, VSIX filename, and SHA-256.
- Remaining editor-only validation limitations.

Validation notes:

- Extension unit tests, typecheck, production build, and three consecutive
  Extension Host runs pass from an isolated worktree.
- Contracts, CCR, command-doc, boundary, task-boundary, asset, diagnostics, and
  both App build gates pass without changing their source files.
- `pnpm test`, `validate:subsystem`, and `validate:baseline` stop only on the two
  existing `scripts/nani-semantic-golden.test.ts` harness-showcase expectations.
  The same source/IR/revision hash mismatch reproduces at the untouched base
  commit `9a956b7`; the task does not update App content or golden snapshots.
- Packaged artifact: `v-ronpa-nani-0.8.0.vsix` (8 files), SHA-256
  `795ad78726f1c42d5451fdc4a5518845356edf9d5113769f6a950df5e00f7135`.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Revert the scoped commit and remove the local tag. No save, manifest, generated
asset, App, or runtime migration is required.

## Done When

- Tests and required gates pass.
- Diff stays within Allowed Paths.
- VSIX is packaged and the local annotated `vscode-nani-v0.8.0` tag exists.
