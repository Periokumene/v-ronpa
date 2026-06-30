# Harness Gates

## Hard Gates

- `pnpm validate:baseline`
- `pnpm validate:contracts`
- `pnpm validate:assets`
- `pnpm typecheck`
- `pnpm test`
- `pnpm validate:boundaries`
- `BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/<name>.md`

Hard gates verify public contracts, input/camera/asset schemas, parser IR,
RuntimeCommand compilation, StoryEngine state and emitted command outputs,
gameplay outcomes, Navi/Trial director flow, Trial graph diagnostics, save
migration validation, generated runtime asset registration, task path
boundaries, CCR requirements, and dependency boundaries.

`validate:boundaries` checks source imports, `package.json` dependency
direction, and `tsconfig.json` project references against the same workspace
dependency matrix.

`pnpm validate:baseline` is the full repository gate. It runs `typecheck`,
`validate:contracts`, unit tests, `validate:assets`, `validate:boundaries`,
`validate:ccr`, `validate:app-cleanup`, both app builds
(`@v-ronpa/game-a` and `@v-ronpa/game-harness`), and `test:smoke`.

`validate:subsystem` is the task-review gate. It enforces task path
boundaries, CCR requirements, dependency boundaries, typecheck, contract tests,
unit tests, both app builds, and smoke. It does not replace the baseline-only
asset generation or app-cleanup residue checks unless those commands are run
separately.

`validate:assets` dry-runs harness asset generation, verifies generated
`RuntimeAsset` files exist, checks harness asset ids resolve through registered
assets, and rejects hardcoded runtime asset file paths in source outside the
generator and registration allowlist.

## Smoke And Evidence Gates

- `pnpm test:smoke`
- Harness root screenshot at `test-results/harness-root.png`
- Game A VN framework screenshots:
  - `test-results/game-a-title.png`
  - `test-results/game-a-vn-dialog.png`
  - `test-results/game-a-save-load.png`
- Accepted harness-showcase screenshots:
  - `test-results/harness-showcase-title.png`
  - `test-results/harness-showcase-navi.png`
  - `test-results/harness-showcase-vn-toolbar.png`
  - `test-results/harness-showcase-backlog.png`
  - `test-results/harness-showcase-save-load.png`
  - `test-results/harness-showcase-pause-menu.png`
  - `test-results/harness-showcase-map-change.png`
  - `test-results/harness-showcase-trial-entry.png`
  - `test-results/harness-showcase-vn-choice.png`
  - `test-results/harness-showcase-branch-b.png`
- Failure screenshots under `test-results/`
- HTML report under `playwright-report/`

## Worktree Port Isolation

Run `pnpm setup:worktree-env` once in every worktree before launching the app
or running smoke tests. The script creates an ignored `.env.worktree` with
worktree-specific `PORT` and `VITE_DEV_PORT` values.

`apps/game-harness/vite.config.ts` and `playwright.config.ts` both search
upward for `.env.worktree`. Explicit shell values still win, then
`.env.worktree`, then the default `5173`. The harness Vite config uses
`strictPort` so a busy port fails loudly instead of silently moving the app
while Playwright waits on a different URL.

Playwright starts `game-harness` on `PORT` and `game-a` on `PORT + 1`. Manual
`game-a` dev runs currently need an explicit `PORT` / `VITE_DEV_PORT` when the
default port is not desired, unless `apps/game-a/vite.config.ts` is updated to
share the worktree port helper and `strictPort`.

Parallel-safe commands:

```bash
pnpm setup:worktree-env
pnpm --filter @v-ronpa/game-harness dev
pnpm test:smoke
```

If a worktree must change its assigned port, delete its local `.env.worktree`
and rerun `pnpm setup:worktree-env`, or set both `PORT` and `VITE_DEV_PORT`
for that shell. Never commit `.env.worktree`, `.local-state/`,
`test-results/`, or `playwright-report/`.

Smoke gates confirm the app boots into the accepted harness showcase title page,
title load/settings entries open, Settings edits persist outside save slots, New
Game enters Navi, Navi can move through first-person exploration, no-target
interactions are rejected, items and evidence update gameplay state, map
transitions remain director-owned, the existing scene can enter Trial mode
through a Navi interactable, Trial presentation/input state comes from
`trial-director`, VN dialog can branch, VN dialog display settings update the
real `VnDialogSurface`, VN AUTO timing responds to settings,
VN toolbar/backlog/save-load surfaces are interactive, Navi ESC opens the pause
menu, canvas layers are present, Pixi task debug readouts stay terminal after
load/skip, runtime asset diagnostics remain at zero through the covered
asset-loading paths, and `InputLockState` changes at Navi/Trial/VN and menu
boundaries.

The first app build intentionally allows the large R3F/Pixi/Three bundle
warning. A later performance task should add route or adapter code splitting
once subsystem APIs stabilize.

## Harness Entry

`apps/game-harness` now boots the integrated showcase directly from `/`. It is
not a registry of independent subsystem slices; it is one game-shaped baseline
that keeps VN, Navi, Trial, Pixi, R3F, media, save/load, settings, pause, debug
readouts, and smoke controls available for capability verification.

## Inspector Lite

The harness inspector exposes:

- current mode
- Navi substate and Trial presentation profile
- input lock
- script pointer
- variables
- inventory/evidence
- trial segment
- latest emitted RuntimeCommand count
- RuntimeCommand/parser/compiler/story/transaction diagnostics
- jump/grant/force outcome controls

Inspector Lite is a developer harness, not production UI.
