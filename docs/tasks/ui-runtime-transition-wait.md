# Runtime UI Transition Wait

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/ui-runtime-transition-wait`

## Worktree Path

- Manual Git worktree suggestion: `.worktrees/ui-runtime-transition-wait`
- Codex App may assign a managed path under `$CODEX_HOME/worktrees`; use the assigned path if launched from Codex App.

## Worktree Environment

Run once after the worktree is created:

```bash
pnpm setup:worktree-env
```

Do not commit `.env.worktree`, `.local-state/`, `test-results/`, or
`playwright-report/`.

## Status

- State: `In Progress`
- Owner: `Codex`
- Created: `2026-07-02`
- Updated: `2026-07-02`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/ui-runtime-transition-wait.md`

## Goal

Implement public `@showUI/@hideUI time/wait` behavior for runtime UI surfaces:
`dialog`, `commandBar`, and `toastLayer`. The runtime must support fade in,
fade out, direct show/hide, reverse interruption from current opacity, UI
`wait!`, and app/shell consumption through presentation ViewModels.

This task does not implement text-retained dialog chrome-only fading and does
not apply `prefers-reduced-motion` timing overrides.

## Context

- `docs/ccr/ui-runtime-transition-wait.md`
- `docs/architecture/vn-runtime-dispatcher.md`
- `docs/architecture/presentation-pipeline.md`
- `docs/architecture/contracts.md`
- `docs/nani/command-catalog.md`
- `packages/contracts/src/index.ts`
- `packages/app-vn-dispatch/src/uiRuntime.ts`
- `packages/app-vn-runtime/src/useVnRuntime.ts`
- `packages/app-vn-shell/src/GameInteractionViewModels.ts`

## Constraints

- Do not create app-specific fade timers or game-a-only patches.
- `app-vn-runtime` remains the actual runtime state and visual clock host.
- `app-vn-dispatch` remains pure reducer/helper logic.
- `app-vn-shell` only consumes ViewModels and mounts surfaces.
- Do not keep a legacy `visible` state track beside surface presentation state.
- Do not change dependencies or package manifests.

## Allowed Paths

- `packages/contracts/**`
- `packages/nani-runtime-compiler/**`
- `packages/story-engine/**`
- `packages/story-play/**`
- `packages/app-vn-session/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-runtime/**`
- `packages/app-vn-shell/**`
- `packages/ui-kit/**`
- `apps/game-a/**`
- `apps/game-harness/src/harness/showcase/**`
- `apps/game-harness/src/interaction/**`
- `tests/smoke/game-a-vn.spec.ts`
- `tests/smoke/harness-showcase.spec.ts`
- `docs/ccr/ui-runtime-transition-wait.md`
- `docs/tasks/ui-runtime-transition-wait.md`
- `docs/architecture/vn-runtime-dispatcher.md`
- `docs/architecture/presentation-pipeline.md`
- `docs/architecture/contracts.md`
- `docs/nani/command-catalog.md`

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`
- `packages/nani-parser/**`
- Navi, Trial, R3F, Pixi adapter packages unless a failing gate proves a
  required compile-only signature adjustment.

## Contracts

- `RuntimeUiGroup`
- `RuntimeCommand`
- `StoryPresentationWait`
- `StoryRuntimeSnapshot`
- `.nani` compiled command params for `showUI` and `hideUI`
- `VnDialogViewModel`, `VnCommandBarViewModel`, and
  `RuntimeToastLayerViewModel`

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| `showUI/hideUI time` creates UI surface transitions | `packages/app-vn-dispatch/src/uiRuntime.test.ts` |
| `wait!` creates UI `presentationWait` and pauses StoryEngine | `packages/story-engine/src/index.test.ts` |
| No `wait!` or invalid target does not pause StoryEngine | `packages/story-engine/src/index.test.ts` |
| Runtime visual clock releases UI waits | `packages/app-vn-runtime/src/**/*.test.ts` and smoke tests |
| Manual/SKIP settles active UI waits | `packages/app-vn-runtime/src/**/*.test.ts` |
| Fading-out surfaces remain mounted in shell VMs | `packages/app-vn-shell/src/GameInteractionShell.test.ts` |
| Default and game-a custom surfaces consume opacity | `packages/ui-kit/src/surfaces/**/*.test.tsx`, `apps/game-a/src/ui/GameASurfaces.test.tsx`, smoke tests |
| Public contracts and docs describe UI wait channel | `packages/contracts/src/index.test.ts`, `docs/ccr/ui-runtime-transition-wait.md` |

## Regression Requirements

Required regression cases:

- Normal path: timed `hideUI/showUI wait!` for `dialog` and `commandBar`.
- Normal path: no-target command applies to all runtime UI groups.
- Boundary path: `time:0` or missing duration settles immediately.
- Boundary path: reverse command during fade starts from current opacity.
- Rejection path: invalid UI target diagnoses in UI runtime and does not create
  a UI presentation wait.
- No-op path: no `wait!` UI command emits without pausing story flow.
- Restore path: active UI waits/transitions are cleared to stable runtime state.

Test placement:

- Package/unit tests: package-local `src/**/*.test.ts` files.
- Contract/compiler tests: `packages/contracts/src/index.test.ts` and
  `packages/nani-runtime-compiler/src/index.test.ts`.
- Smoke tests: `tests/smoke/game-a-vn.spec.ts` and
  `tests/smoke/harness-showcase.spec.ts`.

## Dependency Changes

None. Do not edit `package.json` or `pnpm-lock.yaml`.

## CCR Triggers

- Public contract or `.nani` compiled shape changes must be reflected in
  `docs/ccr/ui-runtime-transition-wait.md`.
- Any expansion beyond the v1 runtime UI target set requires a separate CCR.

## Required Gates

Local iteration gates:

```bash
pnpm vitest run packages/contracts/src/index.test.ts packages/nani-runtime-compiler/src/index.test.ts packages/story-engine/src/index.test.ts packages/story-play/src/index.test.ts packages/app-vn-session/src/index.test.ts packages/app-vn-dispatch/src/uiRuntime.test.ts packages/app-vn-dispatch/src/vnRuntimeTransaction.test.ts packages/app-vn-runtime/src/index.test.ts packages/app-vn-shell/src/GameInteractionShell.test.ts apps/game-a/src/ui/GameASurfaces.test.tsx apps/game-harness/src/interaction/useOverlayPageAdapters.test.ts
pnpm typecheck
pnpm validate:contracts
pnpm test
pnpm validate:boundaries
pnpm validate:ccr
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
```

Merge gate:

```bash
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/ui-runtime-transition-wait.md
```

## Programmatic Acceptance

The implementation is acceptable when the required regression tests pass, public
contract validation passes, app/harness builds pass, smoke tests pass, and the
subsystem gate accepts this task card.

## Manual Acceptance

The reviewer should inspect that UI transition state is centralized in
`app-vn-runtime`/`app-vn-dispatch`, shell and app surfaces consume ViewModel
presentation only, no legacy `visible` runtime track remains, and non-goals are
not partially implemented.

## Review Packet

- Changed files summary.
- Test and gate output.
- Regression coverage summary.
- Smoke screenshot paths from Playwright.
- CCR link.
- Residual risks and non-goals.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting this task removes the UI wait contract and surface presentation shape.
No save migration is required because runtime UI transitions are transient and
restore clears active UI waits.

## Done When

- Required tests and gates pass or failures are documented with root cause.
- Docs, CCR, task card, and smoke checkpoints are updated.
- Diff stays inside allowed paths.
- Public contract changes are covered by the CCR.
