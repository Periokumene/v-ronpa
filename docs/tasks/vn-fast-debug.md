# VN FastDebug

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/vn-fast-debug`

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-08-01`
- Updated: `2026-08-01`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/vn-fast-debug.md`

## Goal

Add an explicit FastDebug mode that materializes a preview from the current
`.nani` script without replaying entry/upstream scripts, while retaining the
canonical entry replay mode and the existing atomic full-catalog host commit.

## Context

- Architecture: `docs/architecture/vn-devtools.md`
- Debug execution boundary: `packages/app-vn-runtime/debug`
- Reusable controller/UI: `packages/app-vn-devtools`
- App wiring and browser acceptance: `apps/game-a`, `tests/smoke/game-a-multi-nani.spec.ts`

## Constraints

- FastDebug is the global Devtools default and is persisted per tab in session v4.
- Non-entry scripts cold-start at pointer 0; the entry script honors `startLabel`.
- Cross-script navigation in FastDebug blocks explicitly; it never loads or skips the target script.
- Both modes share the existing session stepper and runtime projector.
- Fast calculation is current-script-only; host installation still validates the full candidate catalog atomically.
- Do not change product saves, runtime ports, shared contracts, `.nani` IR, dependencies, or package manifests.
- Do not add caches, checkpoint graphs, workers, compatibility aliases, or v3 session migration.

## Allowed Paths

- `packages/app-vn-runtime/**`
- `packages/app-vn-devtools/**`
- `apps/game-a/**`
- `tests/smoke/game-a-multi-nani.spec.ts`
- `tests/smoke/game-a-vn.spec.ts`
- `scripts/fixtures/nani-semantic-golden.json`
- `docs/architecture/vn-devtools.md`
- `docs/tasks/vn-fast-debug.md`
- `progress.md`

## Forbidden Paths

- `packages/contracts/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- Product VN session/story/dispatch/shell/Pixi packages.
- Game Harness, save/media persistence, `package.json`, and `pnpm-lock.yaml`.
- Other semantic/diagnostic golden records and golden test logic.

## Contracts

- Existing `VnEntryDef`, `VnRuntimeScriptCatalog`, `SaveableVnState`, and `.nani` IR remain unchanged.
- The explicit `@v-ronpa/app-vn-runtime/debug` API hard-cuts `materializeVnDebugTarget` to a required materialization mode.
- Devtools session v4 is per-tab debug state, not product save data; v3 is ignored without migration.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Current-script Fast replay | Runtime tests prove cold start, entry/non-entry origins, and one executed script |
| Strict cross-script boundary | Runtime test returns `fast-cross-script-navigation` without a checkpoint |
| Canonical replay compatibility | Existing and new runtime tests preserve upstream state across scripts |
| Controller/session isolation | Devtools tests cover default, v4 round-trip, v3 rejection, and mode switching |
| Atomic installation | Host/controller tests prove full-catalog rejection leaves runtime unchanged |
| Visible accessible control | Component and Game A smoke cover `aria-pressed`, FAST/ENTRY, refresh, and responsive layout |

## Regression Requirements

- Normal: Fast preview reaches a target in the viewed script without executing upstream state.
- Boundary: Fast cross-script navigation blocks; invalid full catalog cannot be installed.
- Unchanged: Canonical Entry replay still follows authored decisions and cross-script navigation.
- Lifecycle: switching modes cancels pending work, clears pin/decisions, and does not mutate the active game scene.
- Serialization: session v4 persists the active mode; v3 is ignored.

Test placement:

- Runtime behavior: `packages/app-vn-runtime/src/debugMaterializer.test.ts`
- Controller/session/UI: `packages/app-vn-devtools/src/**/*.test.ts(x)`
- App journey: `tests/smoke/game-a-multi-nani.spec.ts`

## Dependency Changes

None. `package.json` and `pnpm-lock.yaml` must remain unchanged.

## CCR Triggers

- Any required change to contracts, `.nani` IR, save data, manifest schema, or product VN ports.
- Any dependency or task-boundary expansion.

## Required Gates

```bash
pnpm vitest run packages/app-vn-runtime/src/debugMaterializer.test.ts packages/app-vn-devtools/src
pnpm generate:assets
pnpm validate:assets
pnpm typecheck
pnpm validate:boundaries
pnpm --filter @v-ronpa/game-a build
pnpm playwright test tests/smoke/game-a-multi-nani.spec.ts
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/vn-fast-debug.md
pnpm validate:baseline
```

## Programmatic Acceptance

- Fast materialization cost and executed path do not depend on entry/upstream scripts.
- All materializer callers pass an explicit mode.
- Full candidate validation remains mandatory before runtime mutation.
- Focused tests, typecheck, boundaries, Game A build/smoke, subsystem, and baseline gates pass.
- `package.json`, `pnpm-lock.yaml`, contracts, and `.nani` sources are unchanged.

## Manual Acceptance

- Inspect the command-strip toggle at desktop and narrow widths.
- Verify FAST and ENTRY status/provenance cannot be confused.
- Verify switching the toggle leaves the current game scene unchanged until Preview.
- Review the final diff for strict runtime/devtools/app ownership.

## Review Packet

- Runtime debug: required discriminated materialization mode, current-script
  cold-start policy, strict cross-script blocking, and materialization
  provenance. Both modes continue through the same session stepper and runtime
  projection loop.
- Devtools: three-level inspection authority, Fast/Entry controller lifecycle,
  v4 session persistence, full-catalog host validation, Fast-specific HMR
  impact tracking, accessible command-strip control, and installed-state
  summaries.
- Game A: v4 session key and debug snapshot wiring, regenerated source assets,
  current smoke locators, and Fast/Entry production-browser coverage.
- Regression evidence:
  - Focused runtime/devtools tests: `106 passed`.
  - Full unit suite: `97 files / 772 tests passed`.
  - Contract/subsystem suite: `58 files / 539 tests passed`.
  - VS Code Nani extension suite: `13 passed`.
  - Game A product smoke plus all repository smoke: `15 passed`.
  - `pnpm validate:assets`, `pnpm typecheck`,
    `pnpm validate:boundaries`, Game A build, Game Harness build, and
    `validate:subsystem` passed.
- Browser evidence:
  - `test-results/game-a-fast-debug-entry-mode.png`
  - `test-results/game-a-multi-nani-chapter-02-view-320.png`
  - `test-results/game-a-multi-nani-fixed-point-chapter-view.png`
  - `output/vn-fast-debug-web-client/shot-0.png`
  - The web-game client produced no console-error artifact.
- Baseline exception: `pnpm validate:baseline` reaches and passes typecheck,
  539 contract/subsystem tests, 772 unit tests, 13 extension tests, assets,
  boundaries, CCR, and cleanup guards, then fails the unchanged Nani
  diagnostics benchmark (`synthetic 10,000-line corpus`: 69.404 ms baseline,
  93.850 ms current). A standalone rerun reproduced it. The benchmark,
  performance fixture, parser/compiler, contracts, and all benchmark input
  sources have no diff from `integration/v-ronpa-baseline`; this task does not
  alter or recalibrate that unrelated gate.
- Residual scope is intentionally limited to the agreed non-goals: no
  cache/checkpoint graph/worker, save migration, or cross-script inference in
  Fast mode.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Revert the task atomically. Product saves and schemas are untouched; v4 Devtools
session state can be discarded safely.

## Done When

- Required behavior and tests pass inside the allowed paths.
- Task status is `Done` and the review packet names browser evidence and residual risks.
