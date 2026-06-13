# Harness Gates

## Hard Gates

- `pnpm validate:contracts`
- `pnpm typecheck`
- `pnpm test`
- `pnpm validate:boundaries`

Hard gates verify public contracts, input/camera/asset schemas, parser IR,
StoryEngine state and StoryEffect bridge outputs, gameplay outcomes,
Navi/Trial director flow, Trial graph diagnostics, save migration validation,
and dependency boundaries.

## Smoke And Evidence Gates

- `pnpm test:smoke`
- Baseline screenshot at `test-results/harness-baseline.png`
- Scenario evidence screenshots:
  - `test-results/navi-walk.png`
  - `test-results/navi-vn2d.png`
  - `test-results/navi-inventory.png`
  - `test-results/trial-vn3d.png`
  - `test-results/trial-debate3d.png`
  - `test-results/trial-keyword-break.png`
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
