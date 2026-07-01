# Pixi Presenter Resize Relayout

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/pixi-presenter-resize-relayout`

## Worktree Path

- Manual Git worktree suggestion: `.worktrees/pixi-presenter-resize-relayout`

## Status

- State: `Ready`
- Owner: `TBD`
- Created: `2026-07-01`
- Updated: `2026-07-01`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/pixi-presenter-resize-relayout.md`

## Goal

Make `pixi-presenter` relayout canvas-internal Pixi objects when its host/canvas
size changes, without replaying VN runtime commands, clearing presentation tasks,
or introducing an app/Pixi shared viewport model.

## Context

- `pixi-presenter` already uses Pixi `resizeTo: host`, so the renderer/canvas
  resizes with the host element.
- Pixi display objects that cache geometry, masks, sprite fit, filter areas, or
  shader resolution must still be relaid out explicitly.
- DOM dialog, command bar, menus, and other text-heavy surfaces remain owned by
  app surfaces and `ui-kit`; they are not managed by Pixi resize relayout.

## Constraints

- Keep the resize behavior internal to `packages/pixi-presenter`.
- Do not change public contracts, save schema, RuntimeCommand, or `.nani` IR.
- Do not add a Pixi-local virtual 16:9 viewport, fixed 1440P/2560x1440 design
  canvas, global scene scale, or app/Pixi shared viewport in this task. Pixi
  display objects must relayout directly against the current host/canvas size.
- Resize relayout must not call normal non-animated reconcile because that would
  clear tweens, tasks, and transient effects.

## Allowed Paths

- `packages/pixi-presenter/**`
- `docs/tasks/pixi-presenter-resize-relayout.md`
- `docs/architecture/system-guide.md`
- `docs/architecture/vn-runtime-dispatcher.md`

## Forbidden Paths

- `packages/contracts/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `packages/app-vn-shell/**`
- `packages/ui-kit/**`
- `apps/game-a/**`
- `package.json`
- `pnpm-lock.yaml`

## Contracts

- `PixiPresenterPort` remains unchanged.
- `PixiStageSnapshot`, `RuntimeCommand`, wait task descriptors, save snapshots,
  and asset ids remain unchanged.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Host resize triggers layout-only Pixi relayout | Internal presenter code has a resize observer/rAF path that calls relayout APIs, not normal reconcile |
| Main and inner backgrounds refit on resize | `systemsTasks.test.ts` covers same snapshot with changed viewport dimensions |
| Active actor position transitions survive resize | Unit test keeps actor transition task running and verifies new projected position |
| Full-viewport filters/effects update geometry | Unit tests cover filter areas, bokeh, weather shaders, flash, and glitch relayout |
| DOM UI is not pulled into Pixi layout | Diff stays out of app-vn-shell, ui-kit, and app DOM surfaces |

## Regression Requirements

Required regression cases:

- Normal path: main background and `inBack` relayout after viewport size changes.
- Boundary path: active actor transition is reprojected on resize without task
  cancellation or settling.
- No-op path: duplicate resize keys do not force a normal reconcile or task clear.
- Effects path: filter areas, bokeh, rain/snow shader surfaces, flash, and
  glitch shader resolution update against the new viewport.

Test placement:

- Package tests: `packages/pixi-presenter/src/index.test.ts`
- Internal system tests: `packages/pixi-presenter/src/internal/systemsTasks.test.ts`

## Dependency Changes

None. Do not edit `package.json` or `pnpm-lock.yaml`.

## CCR Triggers

- Any change to public contracts, save data, RuntimeCommand, `.nani` IR, or
  `PixiPresenterPort`.
- Any need to modify app DOM layout, `GameInteractionShell`, or `ui-kit`.
- Any need to introduce a shared app/Pixi viewport bridge.

## Required Gates

```bash
pnpm vitest run packages/pixi-presenter/src/index.test.ts packages/pixi-presenter/src/internal/systemsTasks.test.ts
pnpm typecheck
pnpm validate:boundaries
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-presenter-resize-relayout.md
```

## Programmatic Acceptance

- Pixi package tests pass.
- `pnpm typecheck` passes.
- `pnpm validate:boundaries` passes.
- Subsystem validation passes or reports only pre-existing unrelated dirty files.

## Manual Acceptance

- Capture a 2560x1440 reference screenshot as visual QA evidence only; this is
  not a runtime layout base, virtual viewport, or scale target.
- Resize game-a wider and narrower from that reference capture size.
- Confirm `inBack` remains centered and proportional to the Pixi host.
- Confirm main background does not expose blank canvas.
- Confirm active Pixi wait tasks are not skipped by resize.

## Review Packet

- Changed files summary.
- Test and gate output.
- Screenshot paths for 2560x1440, wider, and narrower game-a validation.
- Residual risks, especially any app-layer viewport follow-up.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting this task does not require save migration, contract snapshot updates,
asset cleanup, or app surface cleanup.

## Done When

- Tests pass.
- Required regression tests are added.
- Diff stays inside allowed paths for this task.
- Documentation states Pixi resize ownership and app DOM non-ownership.
