# Pause Surface Layering

## Base Branch

- `integration/v-ronpa-baseline`

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-07-11`
- Updated: `2026-07-11`
- Archive Target: `docs/archive/completed-tasks/pause-surface-layering.md`

## Goal

Make the canonical pause surface own the full Game A playfield and remove playable dialogue, choices, and command surfaces from the DOM while paused, then restore them unchanged after resume.

## Context

The pause-section navigation hard cut introduced a canonical shared `PauseSurface`, but Game A replaced that slot with a fragment and left its section shell at `z-index: 1`. Dialogue and command surfaces therefore painted above the pause content. The shared shell also continued deriving playable UI models while its flow mode was `paused`.

## Constraints

- Do not change public contracts or `.nani` IR.
- Keep story/runtime state mounted and unchanged across pause/resume.
- Load confirmation remains the only nested blocking interaction and consumes Escape before resume.
- Preserve unrelated changes, especially `apps/game-a/src/nani/opening.nani`.

## Allowed Paths

- `packages/contracts/**`
- `packages/game-flow-machine/**`
- `packages/app-vn-shell/**`
- `packages/ui-kit/**`
- `apps/game-a/**`
- `apps/game-harness/src/interaction/**`
- `tests/smoke/**`
- `docs/architecture/**`
- `docs/ccr/**`
- `docs/tasks/pause-section-navigation.md`
- `docs/tasks/pause-surface-layering.md`
- `progress.md`

The wider paths account for the still-uncommitted pause-section navigation hard
cut in this integration worktree. This follow-up itself must not introduce an
additional public-contract change.

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`

## Contracts

- Honor the existing `PauseSurfaceViewModel`, `PauseSurfaceActions`, `GamePauseSection`, and one-step `RESUME` behavior.
- No CCR is required because this task changes only rendering ownership and paused-mode view-model derivation.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Pause owns the complete Game A playfield | Game A component markup and Playwright bounding-box assertion |
| Playable DOM cannot cover or receive focus through pause | shared shell unit test and Game A/Harness absence assertions |
| Resume restores the prior playable UI | shared shell unit test and Game A/Harness smoke assertions |
| Load confirmation still locks global pause navigation | Game A surface unit test and existing Escape smoke path |

## Regression Requirements

- Normal path: pause from VN hides dialogue/choices/command bar, then resume restores them.
- Boundary path: load confirmation disables tabs, TITLE, and pause close while Escape cancels confirmation.
- Structural path: Game A provides one real `PauseSurface` dialog rather than a fragment or per-section shell.
- Visual path: pause bounds equal the Game A playfield bounds and screenshots show no dialogue overlap.

## Dependency Changes

None.

## Required Gates

```bash
pnpm vitest run packages/app-vn-shell/src/GameInteractionShell.test.ts apps/game-a/src/ui/GameASurfaces.test.tsx
pnpm typecheck
pnpm validate:boundaries
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pause-surface-layering.md
```

## Programmatic Acceptance

- The task-specific unit and smoke regressions pass.
- Typecheck, boundaries, both production builds, and the subsystem gate pass.
- `test-results/game-a-pause.png` and `test-results/harness-showcase-pause.png` are visually inspected.

## Manual Acceptance

- Game A pause is an opaque full-playfield dialog with one set of tabs and one close control.
- No dialogue, choice, or command DOM remains active while paused.
- Closing once returns directly to the unchanged playable scene.

## Review Packet

- Changed files summary and test/gate output.
- Screenshot paths for Game A and Harness pause states.
- Explicit confirmation that `opening.nani` and public contracts were not edited by this task.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting requires no save migration or content cleanup.

## Done When

- The canonical pause surface owns full-screen layout and accessibility semantics.
- Paused playable surfaces are absent and resume correctly.
- Required tests, builds, screenshots, and subsystem gate pass.
