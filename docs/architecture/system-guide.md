# V-Ronpa System Guide

## Playable modes and authority

`vn`, `navi`, and `trial` are peer playable root modes. `GameFlowMachine` owns
only the root mode, active title overlay, pause section, and paused `resumeMode`. The app chooses the
target of `START_NEW_GAME`; the flow machine has no default gameplay mode.

Interaction state is a synchronous projection of the flow snapshot, VN facts,
and Navi/Trial host facts. Runtime and shell code must never write derived
interaction state back into the machine.

## Package ownership

- `contracts`: public schemas, SaveData v7, `.nani` runtime IR.
- `nani-parser`: generic `.nani` ScenarioIR plus a required UTF-16 source-map
  sidecar; owns syntax diagnostics and cooked-to-source projection.
- `nani-runtime-compiler`: catalog binding, validation, normalization, and
  runtime-boundary diagnostics; consumes parser IR and source map together,
  binding only from ordered `CommandIR.args`; owns the one semantic serializer
  used by Node asset revisions and browser WebCrypto revisions.
- `app-vn-session`: story session orchestration.
- `app-vn-dispatch`: headless command fanout and pure UI/media transactions.
- `pixi-stage-model`: pure Pixi snapshot reducer, hints, waits, diagnostics.
- `app-vn-runtime`: React runtime hook, canonical capability ports, shared pure
  step projection, and an explicit debug-only inspection/materialization entry.
- `app-vn-devtools`: reusable workbench controller, latest-wins source/commit
  coordination, read-only React Dock, tab-session helpers, and a Vite-only Nani
  source bridge.
- `app-vn-shell`: DOM shell, canonical modal pause-surface ownership, shared
  pause/save/load/settings behavior, and Pixi host. Paused section slots provide
  content only; playable dialog, choices, and commands are omitted until resume.
- `pixi-presenter`: Pixi renderer adapter only; it does not interpret runtime commands.
- `runtime-assets-pixi`: Pixi-owned AssetRegistry fragment only.
- `navi-director` / `trial-director`: mode-specific state and flow.
- app packages: flow/save/overlay composition and per-game content.

## Renderer boundaries

DOM owns text-heavy and accessibility-sensitive UI. Pixi owns VN/trial 2D
presentation. R3F owns exploration and 3D trial staging. Gameplay and state
packages cannot depend on any renderer, browser storage, or audio implementation.

See [VN integration](app-vn-integration.md), [presentation](presentation-pipeline.md),
[assets](asset-pipeline.md), [contracts](contracts.md), and
[Nani source diagnostics](nani-source-diagnostics.md), and
[Nani devtools](vn-devtools.md).

The exact-source boundary is continuously checked by
`pnpm validate:nani-diagnostics-cleanup` and the deterministic stress/performance
gate `pnpm validate:nani-diagnostics-quality`.
