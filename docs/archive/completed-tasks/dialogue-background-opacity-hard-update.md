# Dialogue Background Opacity Hard Update

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/dialogue-background-opacity-hard-update`

## Worktree Path

- Current Codex-managed workspace.

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-07-17`
- Updated: `2026-07-17`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/dialogue-background-opacity-hard-update.md`

## Goal

Remove player-owned textbox opacity, hard-cut settings to version 2, and route
one default-1 Dialogue background appearance parameter through shared and Game A
surfaces without changing UI transition opacity.

## Context

- `docs/ccr/dialogue-background-opacity-ownership.md`
- `packages/contracts/src/index.ts`
- `packages/app-vn-shell/src/GameInteractionViewModels.ts`
- `packages/ui-kit/src/surfaces/VnDialogSurface.tsx`
- `apps/game-a/src/ui/GameASurfaces.tsx`

## Constraints

- No compatibility or migration layer.
- Do not read, map, strip, or delete version 1 settings.
- Keep `UiSurfacePresentation.opacity` as the show/hide transition authority.
- Do not change SaveData, StoryEngine, RuntimeCommand, `.nani`, dependencies, or
  generated assets.
- Preserve historical task and CCR documents as historical records.

## Allowed Paths

- `packages/contracts/**`
- `packages/ui-kit/**`
- `packages/app-vn-shell/**`
- `apps/game-a/**`
- `apps/game-harness/**`
- `tests/smoke/**`
- `docs/ccr/dialogue-background-opacity-ownership.md`
- `docs/tasks/dialogue-background-opacity-hard-update.md`
- `progress.md`

## Forbidden Paths

- `.nani` content.
- Save/runtime/media/Pixi packages.
- `package.json` and `pnpm-lock.yaml`.

## Contracts

- `SettingsSnapshot` version 2.
- `VnDialogAppearance` and `DEFAULT_VN_DIALOG_APPEARANCE`.
- `VnDialogViewModel.appearance`.
- `GameInteractionShell.dialogAppearance`.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Player settings no longer own opacity | Contract and Settings surface unit tests |
| Default Dialogue background opacity is 1 | Shared shell/UI and Game A unit tests |
| Product appearance remains configurable | Explicit appearance unit tests |
| Transition opacity remains independent | View-model and rendered-style unit tests |
| Current apps use settings v2 | Adapter tests and Playwright storage setup |
| Visual behavior remains valid | Game A and Harness Playwright screenshots |

## Regression Requirements

Required regression cases:

- Normal path: omitted appearance resolves to `1`; explicit `0.4` reaches both
  default and custom Dialogue surfaces.
- Boundary path: non-finite input falls back to `1`; values clamp to `0..1`.
- Rejection path: settings version 1 and v2 snapshots containing
  `textboxOpacity` are rejected.
- Independence path: transition opacity does not replace background opacity.
- UI path: shared and Game A Settings surfaces omit the old control.

Test placement:

- `packages/contracts/src/index.test.ts`
- `packages/app-vn-shell/src/**/*.test.ts*`
- `packages/ui-kit/src/surfaces/*.test.tsx`
- `apps/game-a/src/ui/GameASurfaces.test.tsx`
- `tests/smoke/*.spec.ts`

## Dependency Changes

None.

## CCR Triggers

- `SettingsSnapshot` is a public schema and changes under
  `docs/ccr/dialogue-background-opacity-ownership.md`.

## Required Gates

```bash
pnpm vitest run packages/contracts/src/index.test.ts packages/app-vn-shell/src/useGameSettingsAdapter.test.ts packages/app-vn-shell/src/GameInteractionShell.test.ts packages/ui-kit/src/surfaces/VnDialogSurface.test.tsx packages/ui-kit/src/surfaces/GameInteractionSurfaces.test.tsx apps/game-a/src/ui/GameASurfaces.test.tsx
pnpm typecheck
pnpm validate:contracts
pnpm validate:boundaries
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/dialogue-background-opacity-hard-update.md
```

## Programmatic Acceptance

- Every required regression case has focused unit coverage.
- Current app smoke tests pass using version 2 storage keys.
- Type, contract, boundary, build, and subsystem gates pass.

## Manual Acceptance

- Inspect Game A and Harness Dialogue screenshots.
- Confirm Dialogue chrome is fully opaque at the default appearance value.
- Confirm no player Settings screen contains a textbox-opacity control.

## Review Packet

- SettingsSnapshot is version 2, `textboxOpacity` is absent from its schema,
  and both current apps use version 2 storage keys with no version 1 read or
  migration path.
- Shared `VnDialogAppearance`, default `backgroundOpacity: 1`, shell/view-model
  wiring, default VnDialogSurface rendering, and Game A product configuration
  are implemented.
- Focused regressions pass: 6 files and 81 tests. Full gates pass: 314 contract
  tests, 506 repository tests, type/contracts/assets/boundaries/CCR/app cleanup/
  VN cleanup, both production builds, task/subsystem validation, and all 7
  Playwright smoke scenarios.
- Visual evidence inspected:
  `test-results/game-a-settings.png`,
  `test-results/game-a-vn-dialog.png`,
  `test-results/harness-vn-choice.png`, and
  `output/web-game/dialogue-background-opacity-v2/shot-0.png`.
- No dependencies, saves, runtime commands, `.nani`, generated assets, package
  manifests, or lockfiles changed.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting restores settings version 1 and its old storage keys. No save-data or
content rollback is required.

## Done When

- Settings version 2 and appearance wiring are complete.
- Old opacity names and UI controls are absent from active code/tests.
- Required tests, builds, screenshots, and subsystem validation pass.
