# VN Command Catalog & Runtime Dispatcher

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/vn-command-catalog-runtime-dispatcher`

## Worktree Path

- Manual Git worktree suggestion: `.worktrees/vn-command-catalog-runtime-dispatcher`

## Status

- State: `Archived`
- Owner: `integration`
- Created: `2026-06-19`
- Updated: `2026-06-21`
- Completed Commit: `1c77c67`
- Archive Target: `docs/archive/completed-tasks/vn-command-catalog-runtime-dispatcher.md`

## Goal

Prepare the common VN architecture for the performance branch and UI branch by
adding an explicit Naninovel command catalog, wildcard command effect route,
StoryEngine handler-registry guardrails, and an app-level VN runtime dispatcher.

## Context

This task follows the public-core planning for two downstream tracks:

- Performance branch: expand supported Naninovel commands and Pixi effects.
- UI branch: add VN controls, settings/backlog/save-load surfaces, and
  configurable visual novel UI styling.

Relevant docs:

- `docs/ccr/vn-command-catalog-runtime-dispatcher.md`
- `docs/nani/basic-p1-example.md`
- `docs/nani/command-catalog.md`
- `docs/architecture/vn-runtime-dispatcher.md`
- `docs/architecture/contracts.md`
- `docs/architecture/presentation-pipeline.md`

## Constraints

- Naninovel official commands must be explicit catalog entries, not generic
  wildcard routes.
- `commandCatalog` is the command declaration source.
- `NaniCommandHandlerRegistry` is execution binding only.
- `VnOutputRouteTable` routes StoryEngine output objects, not `.nani`
  command ids.
- Do not modify `packages/nani-parser/src/types.ts`.
- Do not add dependencies.

## Allowed Paths

- `packages/contracts/src/index.ts`
- `packages/contracts/src/index.test.ts`
- `packages/nani-parser/src/index.ts`
- `packages/nani-parser/src/index.test.ts`
- `packages/nani-parser/fixtures/basic-navi.p1.nani`
- `packages/nani-parser/fixtures/basic-trial-discussion.p1.nani`
- `packages/story-engine/src/index.ts`
- `packages/story-engine/src/index.test.ts`
- `apps/game/src/VnRuntimeDispatcher.tsx`
- `apps/game/src/vnOutputRoutes.ts`
- `apps/game/src/vnOutputRoutes.test.ts`
- `apps/game/src/harness/fixtures/verticalSlice.ts`
- `apps/game/src/harness/scenarios/vertical-slice/VerticalSliceScenario.tsx`
- `docs/ccr/vn-command-catalog-runtime-dispatcher.md`
- `docs/nani/basic-p1-example.md`
- `docs/nani/command-catalog.md`
- `docs/architecture/vn-runtime-dispatcher.md`
- `docs/architecture/contracts.md`
- `docs/architecture/presentation-pipeline.md`
- `docs/architecture/system-guide.md`
- `docs/review-watchlist.md`
- `docs/tasks/vn-command-catalog-runtime-dispatcher.md`
- `tests/smoke/vertical-slice.spec.ts`
- `vitest.config.ts`

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`
- `playwright.config.ts`
- `packages/nani-parser/src/types.ts`

## Contracts

- `NaniCommandDefinition`
- `NaniCommandParamSpec`
- `NaniCommandStatus`
- `NaniCommandCategory`
- `NaniWildcardType`
- `commandCatalog`
- `StoryEffect` including `wildcard-event`
- Existing `PresentationCommand`, `GameplayEvent`, and `StoryRuntimeSnapshot`

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Official command catalog covers Naninovel baseline | Contract test asserts 77 official commands |
| Wildcard command family exists | Contract test asserts 9 wildcard commands |
| Parser preserves official params | Parser test keeps official params out of primary |
| StoryEngine validates from catalog | StoryEngine tests cover invalid official params |
| Stubbed commands no-op with diagnostics | StoryEngine test covers `@bgm` no-op |
| Runtime handler registry cannot drift | StoryEngine test rejects catalog-external handler |
| Reducer diagnostics do not drift from stepper diagnostics | StoryEngine test checks `storyReducer` returns catalog diagnostics |
| Historical implemented commands are catalog-clean | StoryEngine test covers `back.effect`, `shake.actorId/intensity/duration`, and `goto.path` without warnings |
| Wildcard effects route through `effects` | StoryEngine test emits `wildcard-event` only |
| App route table separates snapshot and effect streams | App unit test covers presentation commands and non-presentation effects |
| Presentation effects are not replayed by Pixi | App unit test routes presentation effects to debug only |
| Vertical slice behavior stays intact | Playwright smoke covers VN dialog, Pixi layer, choices, gameplay route |

## Regression Requirements

Required regression cases:

- Normal path: existing VN script still displays dialogue, choices, Pixi
  background/portraits, and gameplay event branch updates.
- Boundary path: invalid official command parameter produces an error
  diagnostic and no presentation command.
- No-op path: declared but unimplemented official command produces a warning
  diagnostic and no-op.
- Drift path: handler registry rejects a command not declared in catalog.
- Serialization/contract path: `wildcard-event` validates as a `StoryEffect`.

Test placement:

- Contracts: `packages/contracts/src/index.test.ts`
- Parser: `packages/nani-parser/src/index.test.ts`
- StoryEngine: `packages/story-engine/src/index.test.ts`
- App routes: `apps/game/src/vnOutputRoutes.test.ts`
- Smoke: `tests/smoke/vertical-slice.spec.ts`

## Dependency Changes

None. Do not edit `package.json` or `pnpm-lock.yaml`.

## CCR Triggers

This task intentionally changes public contracts and includes:

- `docs/ccr/vn-command-catalog-runtime-dispatcher.md`

## Required Gates

```bash
pnpm validate:contracts
pnpm test
pnpm typecheck
pnpm validate:boundaries
pnpm --filter @v-ronpa/game build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/vn-command-catalog-runtime-dispatcher.md
```

## Programmatic Acceptance

The implementation is acceptable when all required gates pass and app route
tests are included in `pnpm test`.

## Manual Acceptance

Review that:

- Official commands are explicitly declared.
- Runtime handlers do not redefine command metadata.
- Wildcard commands are clearly marked as branch-local escape hatches.
- Dispatcher routing is based on runtime output objects.
- Existing vertical-slice VN behavior does not regress.

## Review Packet

- Changed files summary.
- Gate output.
- Regression coverage summary.
- Smoke screenshot paths.
- Residual risks and follow-up items for deeper Naninovel command execution.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting this task removes catalog-derived diagnostics and the app-level VN
dispatcher. No save migration is required.

## Done When

- Required gates pass.
- CCR and docs are present.
- Contract, parser, StoryEngine, app route, and smoke regressions are covered.
