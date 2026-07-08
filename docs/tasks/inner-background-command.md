# innerBackground Command

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/inner-background-command`

## Worktree Path

- Current Codex workspace: `/Users/periokumene/Dev/v-ronpa`

## Status

- State: `In Progress`
- Owner: `Codex`
- Created: `2026-07-01`
- Updated: `2026-07-09`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/inner-background-command.md`

## Goal

Add a public `@inback` `.nani` command that renders a framed Pixi inner
background through `PixiStageSnapshot.innerBackgroundsById`, independent from
the existing full-stage `@back` background path.

## Context

- `docs/ccr/inner-background-command.md` records the public contract change.
- `packages/contracts` owns command catalog, `PixiStageSnapshot`, and `SaveData`.
- `packages/nani-parser` collects script asset references.
- `packages/nani-runtime-compiler` normalizes `.nani` commands into runtime
  commands.
- `packages/pixi-presenter` reduces Pixi commands and owns Pixi layer rendering.
- `packages/app-vn-dispatch` fans emitted runtime commands into Pixi state.
- `packages/app-vn-shell`, `apps/game-a`, and `apps/game-harness` provide app
  and smoke surfaces for end-to-end verification.

## Constraints

- No dependency changes.
- Do not edit `package.json` or `pnpm-lock.yaml`.
- `@inback` is not an alias of `@back`.
- V1 exposes only the reserved `InnerBackground` instance.
- V1 does not support `id`, `pos`, `position`, `rotation`, `scale`, `tint`,
  `pose`, `params`, or `dissolve`.
- Weather, character, and screen effect semantics must remain unchanged.

## Allowed Paths

- `docs/ccr/inner-background-command.md`
- `docs/tasks/inner-background-command.md`
- `docs/nani/command-catalog.md`
- `docs/architecture/presentation-pipeline.md`
- `packages/contracts/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `packages/story-engine/**`
- `packages/pixi-presenter/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-shell/**`
- `packages/media-save/**`
- `apps/game-a/**`
- `apps/game-harness/**`
- `tests/smoke/**`

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`
- Unrelated docs, packages, apps, or assets outside Allowed Paths.

## Contracts

- `naniCommandCatalog` includes project command `inback`.
- `PIXI_MAIN_BACKGROUND_ID` and `PIXI_INNER_BACKGROUND_ID` are the single
  source for reserved Pixi actor ids.
- `PixiStageSnapshotSchema` is version `5` and includes
  `innerBackgroundsById`.
- `SaveDataSchema` is version `5`; Pixi stage v5 is stored only under
  `SaveData.vn.pixiStage`.
- Old Pixi v4 snapshots and SaveData payloads before v5 are rejected.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| `@inback` is a public Pixi command | Contract, parser, compiler, and dispatch tests |
| Inner background is saveable and separate from main background | Pixi reducer and contract tests |
| Inner background uses a dedicated Pixi layer and frame | Pixi system tests |
| Reserved ids are centralized | Compiler, presenter, shell, and contract tests import contract constants |
| Old save/snapshot versions are rejected | Contract and media-save tests |
| Game A and harness expose the feature | App tests and smoke assertions |

## Regression Requirements

Required regression cases:

- Normal path: `@inback bg:x effect:fade time:0.2 wait!` compiles and reduces to
  `innerBackgroundsById.InnerBackground`.
- Boundary or rejection path: unsupported v1 params warn; old SaveData before
  v5 and Pixi snapshot v4 reject.
- No-op path: `visible:false` on a missing inner background leaves the snapshot
  unchanged.
- Serialization path: SaveData v5 embeds Pixi v5 under `vn.pixiStage` with
  default `innerBackgroundsById`.

Test placement:

- Contract tests: `packages/contracts/src/index.test.ts`
- Parser/compiler tests: `packages/nani-parser/src/index.test.ts`,
  `packages/nani-runtime-compiler/src/index.test.ts`
- Pixi tests: `packages/pixi-presenter/src/**/*.test.ts`
- Dispatch/save tests: `packages/app-vn-dispatch/src/**/*.test.ts`,
  `packages/media-save/src/**/*.test.ts`
- App and smoke tests: `apps/game-a/src/**/*.test.ts`,
  `apps/game-harness/src/**/*.test.ts`, `tests/smoke/**`

## Dependency Changes

None.

## CCR Triggers

This task intentionally changes public command and save contracts. CCR:
`docs/ccr/inner-background-command.md`.

## Required Gates

```bash
pnpm vitest run packages/contracts/src/index.test.ts packages/nani-parser/src/index.test.ts packages/nani-runtime-compiler/src/index.test.ts packages/pixi-presenter/src/index.test.ts packages/pixi-presenter/src/internal/systemsTasks.test.ts packages/app-vn-dispatch/src/vnRuntimeTransaction.test.ts packages/media-save/src/index.test.ts apps/game-a/src/contentManifest.test.ts apps/game-harness/src/interaction/useHarnessShowcaseRuntimeAdapter.test.ts apps/game-harness/src/interaction/useHarnessShowcaseSaveAdapter.test.ts
pnpm typecheck
pnpm validate:contracts
pnpm validate:boundaries
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/inner-background-command.md
```

## Programmatic Acceptance

The implementation is acceptable when the required regression tests and gates
pass, and smoke coverage asserts `data-pixi-inner-background` for Game A or
harness VN surfaces.

## Manual Acceptance

Reviewers should inspect that `@inback` remains separate from `@back`, no
dependency files changed, and frame rendering does not move weather, character,
or screen effect ownership out of Pixi.

## Review Packet

- Changed files summary.
- Test and gate output.
- Regression coverage summary.
- Screenshot paths for smoke runs, if run.
- CCR link.
- Residual risks or known non-goals.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

This task originally introduced Pixi snapshot v5. Current SaveData v5 ownership
is defined by `docs/ccr/save-data-v5-vn-state-authority.md`; reverting the inner
background task must not reintroduce top-level `story` or `pixiStage` save
fields. Development saves created with the current versions should be
considered incompatible with branches expecting older save shapes.

## Done When

- Tests and gates pass.
- Required regression tests are added.
- Public contract changes have the CCR above.
- Final summary includes verification and residual risk.
