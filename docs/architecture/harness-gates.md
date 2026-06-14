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
- First vertical-slice fanout screenshots:
  - `test-results/navi-interaction.png`
  - `test-results/r3f-first-person.png`
  - `test-results/story-vn.png`
  - `test-results/vn-dialog.png`
  - `test-results/pixi-vn.png`
  - `test-results/vertical-slice-spawn.png`
  - `test-results/vertical-slice-vn-choice.png`
  - `test-results/vertical-slice-map-change.png`
- Failure screenshots under `test-results/`
- HTML report under `playwright-report/`

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

The first vertical-slice fanout uses fixed query-param entries. They are
temporary developer harnesses, not production routes.

| Entry | Owning worktree | Modules allowed to change |
|---|---|---|
| `/?scenario=baseline` | P0 baseline | app harness only |
| `/?scenario=navi-interaction` | `docs/tasks/navi-interaction-flow.md` | `gameplay`, `navi-director`, scenario folder |
| `/?scenario=r3f-first-person` | `docs/tasks/r3f-first-person.md` | `r3f-adapter`, scenario folder |
| `/?scenario=story-vn` | `docs/tasks/story-vn-stepper.md` | `story-engine`, scenario folder |
| `/?scenario=vn-dialog` | `docs/tasks/vn-dialog-surface.md` | `ui-kit`, scenario folder |
| `/?scenario=pixi-vn` | `docs/tasks/pixi-vn-presenter.md` | `pixi-presenter`, scenario folder |
| `/?scenario=vertical-slice` | `docs/tasks/vertical-slice-integration.md` | vertical-slice scenario folder after P1 lines merge |

Some independent lines intentionally touch multiple modules, for example
`navi-interaction` spans `gameplay` and `navi-director`. The task card is the
source of truth for the exact allowed paths. If a subsystem needs to edit an
app file outside its own pre-created scenario folder, stop and create a
follow-up public-core or integration task instead of widening scope silently.

Temporary scenario folders and harness assets should be removed or migrated
after the vertical slice is accepted.

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
