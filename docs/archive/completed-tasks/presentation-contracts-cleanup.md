# Presentation Contracts Cleanup

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/presentation-contracts-cleanup`

## Worktree Path

- Manual Git worktree suggestion: `.worktrees/presentation-contracts-cleanup`

## Status

- State: `Archived`
- Owner: `integration`
- Created: `2026-06-20`
- Updated: `2026-06-21`
- Completed Commit: `21a3304`
- Archive Target: `docs/archive/completed-tasks/presentation-contracts-cleanup.md`

## Goal

Remove `@v-ronpa/presentation-contracts` as a separate package and move its
presenter runtime trace helper into Pixi internals. This prepares the codebase
for a future saveable stage snapshot system by keeping `packages/contracts` as
the single public contract authority.

## Context

The removed package used names such as `PresentationSnapshot` and
`PresentationPerform` for a mixed presenter memory record. That record contains
applied command history, current visual observations, and active performs, so it
must not become the future SaveData stage snapshot shape.

## Constraints

- Do not introduce StageSnapshot, applySnapshot, SaveData changes, or load
  restore behavior.
- Do not move presenter trace types into `packages/contracts`.
- Do not keep `Snapshot` or `DebugSnapshot` naming for the migrated Pixi helper.
- Keep historical `docs/archive/**` records unchanged unless a gate requires it.

## Allowed Paths

- `AGENTS.md`
- `README.md`
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`
- `scripts/validate-boundaries.mjs`
- `scripts/validate-ccr.mjs`
- `apps/game/src/vnOutputRoutes.test.ts`
- `packages/pixi-presenter/**`
- `packages/presentation-contracts/**`
- `docs/ccr/presentation-contracts-cleanup.md`
- `docs/ccr/template.md`
- `docs/ccr/vn-command-catalog-runtime-dispatcher.md`
- `docs/architecture/contracts.md`
- `docs/architecture/presentation-pipeline.md`
- `docs/architecture/system-guide.md`
- `docs/architecture/vn-runtime-dispatcher.md`
- `docs/templates/worktree-task-card.md`
- `docs/tasks/vertical-slice-integration.md`
- `docs/tasks/presentation-contracts-cleanup.md`

## Forbidden Paths

- `packages/contracts/**`
- `packages/nani-parser/src/types.ts`
- `packages/story-engine/**`
- `tests/smoke/**`

## Contracts

- Removes `@v-ronpa/presentation-contracts` from the public contract surface.
- Leaves `PresentationCommand` in `packages/contracts` unchanged.
- Adds no new schema, save, parser, or StoryEngine contract shape.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Package removed | No workspace, lockfile, tsconfig, or boundary reference remains |
| Pixi trace behavior preserved | Pixi presenter unit tests cover `PresenterTrace` |
| Public contract authority clarified | CCR and architecture docs name `contracts` as the only public schema source |
| No feature creep | No SaveData, StageSnapshot, StoryEngine, or app restore changes |

## Regression Requirements

Required regression cases:

- Normal path: Pixi presenter records applied commands in `PresenterTrace`.
- Boundary path: non-Pixi presentation commands remain no-op safe.
- Cleanup path: workspace gates have no reference to `presentation-contracts`.

Test placement:

- Pixi presenter public port: `packages/pixi-presenter/src/index.test.ts`
- Pixi presenter trace recorder:
  `packages/pixi-presenter/src/internal/presenterTrace.test.ts`
- App route wording: `apps/game/src/vnOutputRoutes.test.ts`
- Tooling and docs: `validate:boundaries`, `validate:contracts`, and subsystem
  validation.

## Dependency Changes

Allowed: remove the workspace package `@v-ronpa/presentation-contracts`, remove
`pixi-presenter`'s dependency on it, and update `pnpm-lock.yaml`.

## CCR Triggers

This task intentionally removes a public contract package and includes:

- `docs/ccr/presentation-contracts-cleanup.md`

## Required Gates

```bash
pnpm install
pnpm validate:contracts
pnpm test
pnpm typecheck
pnpm validate:boundaries
pnpm --filter @v-ronpa/game build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/presentation-contracts-cleanup.md
```

## Programmatic Acceptance

The implementation is acceptable when all required gates pass and no current
non-archive source, script, manifest, or architecture doc outside this task/CCR
imports or references `@v-ronpa/presentation-contracts`.

## Manual Acceptance

Reviewer confirms this task only cleans up the package boundary and does not
change save/load behavior.

## Review Packet

- Changed files summary.
- Gate output.
- Confirmation that no StageSnapshot, SaveData, or restore behavior was added.
- Residual risks for the future snapshot/save task.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting this task restores the separate `presentation-contracts` package and
the Pixi dependency on it. No save data migration is involved.

## Done When

- Required gates pass.
- CCR and architecture docs are updated.
- The deleted package has no active workspace/tooling references.
