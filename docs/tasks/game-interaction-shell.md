# Game Interaction Shell

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/game-interaction-shell`

## Worktree Path

- Manual Git worktree suggestion: `.worktrees/game-interaction-shell`

## Status

- State: `Review`
- Owner: `integration`
- Created: `2026-06-20`
- Updated: `2026-06-20`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/game-interaction-shell.md`

## Goal

Prepare the shared interaction shell for the future VN UI branch by extending
the accepted vertical slice into a real flow entry: title page, Navi
exploration, VN command bar, backlog, save/load, settings shell, and Navi pause
menu.

## Context

This task is public-line preparation for two downstream tracks:

- Performance branch: keep VN presentation output routed through the existing
  dispatcher and Pixi/R3F adapters.
- UI/interaction branch: add mature VN surfaces, settings, save/load, backlog,
  auto/skip, style profiles, and reusable project styling.

The accepted harness entry remains `/?scenario=vertical-slice`, but it now
boots into the title surface instead of directly entering play.

## Constraints

- Keep Navi and Trial as the primary playable modes. Title and overlays are
  app/game-flow concerns.
- `game-flow-machine` owns mode, overlay stack, and capability policy.
- The app interaction adapter wires the current vertical slice runtime and
  save/restore only; it must not become the final production save system.
- `VerticalSliceScenario` may assemble fixtures, adapters, and debug sidebar,
  but must not own save/load/backlog/settings/title logic directly.
- `media-save` stores, migrates, summarizes, lists, loads, and deletes slots. It
  must not collect current runtime snapshots.
- `ui-kit` surfaces are pure display/control surfaces and do not import app
  runtime packages.
- Settings is an empty shell in this task. Backlog is read-only. Save previews
  are text summaries. Auto/skip scheduling remains future work.

## Allowed Paths

- `apps/game/**`
- `packages/contracts/**`
- `packages/game-flow-machine/**`
- `packages/media-save/**`
- `packages/ui-kit/**`
- `tests/smoke/**`
- `scripts/validate-boundaries.mjs`
- `docs/ccr/game-interaction-shell.md`
- `docs/architecture/system-guide.md`
- `docs/architecture/harness-gates.md`
- `docs/architecture/input-and-camera.md`
- `docs/architecture/contracts.md`
- `docs/architecture/vn-runtime-dispatcher.md`
- `docs/review-watchlist.md`
- `docs/tasks/game-interaction-shell.md`
- `apps/game/package.json`
- `packages/ui-kit/package.json`
- `package.json`
- `pnpm-lock.yaml`

## Forbidden Paths

- `packages/nani-parser/src/types.ts`
- `playwright.config.ts`
- `docs/templates/**`

## Contracts

- `GameMode`
- `GameOverlayKind`
- `GameUiAction`
- `GameInteractionContext`
- `InteractionCapabilitySnapshot`
- `SettingsSnapshot`
- `InteractionStyleProfile`
- `UiAssetRef`
- `SaveSlotSummary`
- `SaveData.summary`
- `ContentManifest.uiAssets`
- `ContentManifest.interactionStyles`

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Vertical slice boots into title | Harness registry smoke sees title entry |
| Title entry opens settings/load and starts game | Vertical slice smoke |
| GameFlow capability policy gates UI actions | GameFlow unit tests |
| Save slots can summarize/list/load/delete | Media-save unit tests |
| Save collection is app adapter-owned | App adapter unit test |
| VN toolbar routes LOG/SAVE/LOAD/SETTING | Vertical slice smoke |
| Backlog is read-only | Smoke sees backlog entries without jump controls |
| Save/load restores current VN state | Smoke saves, confirms load, and keeps VN dialog visible |
| Navi ESC opens pause menu | Smoke screenshot and button assertions |

## Regression Requirements

Required regression cases:

- Normal path: title to Navi to VN remains playable and branch outcomes still
  work.
- Boundary path: title load can open with empty slots and no crash.
- Capability path: VN command bar disables/enables from capability snapshot.
- Save path: save slot summary is created, load confirmation appears, confirmed
  load restores the vertical slice runtime.
- Overlay path: ESC in Navi opens pause menu and does not create document scroll.

Test placement:

- Contracts: `packages/contracts/src/index.test.ts`
- GameFlow: `packages/game-flow-machine/src/index.test.ts`
- Media save: `packages/media-save/src/index.test.ts`
- App adapter: `apps/game/src/interaction/useVerticalSliceSaveAdapter.test.ts`
- Smoke: `tests/smoke/harness-registry.spec.ts` and
  `tests/smoke/vertical-slice.spec.ts`

## Dependency Changes

Allowed: add `@xstate/react` to `apps/game`, add the app dependency on
`@v-ronpa/media-save`, and add Radix primitives required by the pure `ui-kit`
overlay surfaces.

## CCR Triggers

This task intentionally changes public contracts and includes:

- `docs/ccr/game-interaction-shell.md`

## Required Gates

```bash
pnpm install
pnpm validate:contracts
pnpm test
pnpm typecheck
pnpm validate:boundaries
pnpm --filter @v-ronpa/game build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/game-interaction-shell.md
```

## Programmatic Acceptance

The implementation is acceptable when all required gates pass and smoke evidence
is written under `test-results/`.

## Manual Acceptance

Reviewer starts `/?scenario=vertical-slice`, verifies title entry, New Game,
VN toolbar, backlog, save/load confirmation, settings shell, and Navi pause
menu readability.

## Review Packet

- Changed files summary.
- Gate output.
- Regression coverage summary.
- Smoke screenshot paths.
- Residual risks and watchlist items for the VN UI branch.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting this task removes the title-first interaction shell and additive
contract fields. Existing save version remains `1`; no migration is required for
the development harness.

## Done When

- Required gates pass.
- CCR and architecture docs are updated.
- Vertical slice boots from title and smoke covers the new overlay flows.
