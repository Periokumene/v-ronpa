# Harness Gates

## Hard Gates

- `pnpm validate:baseline`
- `pnpm validate:contracts`
- `pnpm typecheck`
- `pnpm test`
- `pnpm validate:boundaries`
- `BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/<name>.md`

Hard gates verify public contracts, input/camera/asset schemas, parser IR,
StoryEngine state and StoryEffect bridge outputs, gameplay outcomes,
Navi/Trial director flow, Trial graph diagnostics, save migration validation,
task path boundaries, CCR requirements, and dependency boundaries.

`validate:boundaries` checks source imports, `package.json` dependency
direction, and `tsconfig.json` project references against the same workspace
dependency matrix.

## Smoke And Evidence Gates

- `pnpm test:smoke`
- Baseline screenshot at `test-results/harness-baseline.png`
- Fixed scenario registry screenshot at `test-results/harness-registry.png`
- Scenario evidence screenshots:
  - `test-results/navi-walk.png`
  - `test-results/navi-vn2d.png`
  - `test-results/navi-inventory.png`
  - `test-results/trial-vn3d.png`
  - `test-results/trial-debate3d.png`
  - `test-results/trial-keyword-break.png`
- Accepted vertical-slice screenshots:
  - `test-results/vertical-slice-spawn.png`
  - `test-results/vertical-slice-vn-choice.png`
  - `test-results/vertical-slice-map-change.png`
  - `test-results/vertical-slice-branch-b.png`
- Failure screenshots under `test-results/`
- HTML report under `playwright-report/`

## Worktree Port Isolation

Run `pnpm setup:worktree-env` once in every worktree before launching the app
or running smoke tests. The script creates an ignored `.env.worktree` with
worktree-specific `PORT` and `VITE_DEV_PORT` values.

`apps/game/vite.config.ts` and `playwright.config.ts` both search upward for
`.env.worktree`. Explicit shell values still win, then `.env.worktree`, then
the default `5173`. Vite uses `strictPort` so a busy port fails loudly instead
of silently moving the app while Playwright waits on a different URL.

Parallel-safe commands:

```bash
pnpm setup:worktree-env
pnpm --filter @v-ronpa/game dev
pnpm test:smoke
```

If a worktree must change its assigned port, delete its local `.env.worktree`
and rerun `pnpm setup:worktree-env`, or set both `PORT` and `VITE_DEV_PORT`
for that shell. Never commit `.env.worktree`, `.local-state/`,
`test-results/`, or `playwright-report/`.

Smoke gates confirm the app boots, the harness can switch between Navi and
Trial, Navi can trigger VN2D and inventory overlays, Trial can switch VN3D and
debate3D presentation profiles, DOM surfaces remain interactive, canvas layers
are present, `InputLockState` changes at mode boundaries, and
`CameraControlMode` distinguishes first-person Navi, scripted-focus VN3D, and
trial-targeting debate.

The first app build intentionally allows the large R3F/Pixi/Three bundle
warning. A later performance task should add route or adapter code splitting
once subsystem APIs stabilize.

## Fixed Harness Scenario Entries

The first vertical-slice fanout used fixed query-param entries as temporary
developer harnesses. After the P1 lines were integrated, only the baseline
harness and the accepted vertical-slice harness remain active.

| Entry | Owning worktree | Modules allowed to change |
|---|---|---|
| `/?scenario=baseline` | P0 baseline | app harness only |
| `/?scenario=vertical-slice` | `docs/tasks/vertical-slice-integration.md` | integration harness, CCR-backed contract bridge, smoke evidence |

Completed temporary subsystem entries are archived under
`docs/archive/completed-tasks/`. Future slices should add new scenario entries
for their own acceptance evidence instead of reviving the removed temporary
entries.

## Inspector Lite

The harness inspector exposes:

- current mode
- Navi substate and Trial presentation profile
- input lock
- script pointer
- variables
- inventory/evidence
- trial segment
- presentation command log
- jump/grant/force outcome controls

Inspector Lite is a developer harness, not production UI.
