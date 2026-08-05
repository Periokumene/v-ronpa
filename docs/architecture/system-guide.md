# V-Ronpa System Guide

## Playable modes and authority

`vn`, `navi`, and `trial` are peer playable root modes. `GameFlowMachine` owns
only the root mode, active title overlay, pause section, and paused `resumeMode`. The app chooses the
target of `START_NEW_GAME`; the flow machine has no default gameplay mode.

Interaction state is a synchronous projection of the flow snapshot, VN facts,
and Navi/Trial host facts. Runtime and shell code must never write derived
interaction state back into the machine.

## Package ownership

- `contracts`: public schemas, ContentManifest v5, SaveData v11, and `.nani` runtime IR.
- `nani-parser`: generic `.nani` ScenarioIR plus a required UTF-16 source-map
  sidecar; owns syntax diagnostics and cooked-to-source projection.
- `nani-runtime-compiler`: command binding, static endpoint/catalog linking, validation, normalization, and
  runtime-boundary diagnostics; consumes parser IR and source map together,
  binding only from ordered `CommandIR.args`; owns the one semantic serializer
  used by Node asset revisions and browser WebCrypto revisions.
- `app-vn-session`: story session orchestration and pure cross-script switching.
- `app-vn-dispatch`: headless command fanout and pure UI/media transactions.
- `pixi-stage-model`: pure Pixi snapshot reducer, hints, waits, diagnostics.
- `app-vn-runtime`: React runtime hook, canonical capability ports, runtime-owned
  execution history, operation/navigation coordinators, shared pure step
  projection, and an explicit debug-only inspection/materialization entry.
- `app-vn-devtools`: reusable workbench controller, per-script authority and HMR
  impact coordinators, shared host definition/restore transaction, read-only
  React Dock, tab-session helpers, and a Vite-only Nani source bridge.
- `app-vn-shell`: DOM shell, canonical modal pause-surface ownership, shared
  pause/save/load/settings behavior, the internal document-level web-game
  browser policy, Pixi host, and the shared Pixi script-preparation adapter.
  Paused section slots provide content only;
  playable Dialog/Cue text surfaces, choices, and commands are omitted until
  resume. Dialog and Cue share one StoryText authority and playback clock but
  remain separate mutually exclusive DOM surfaces.
- `asset-project`: Node-only App asset scanning, generation, validation, and Vite publishing rules.
- `asset-registry`: App-owned AssetId-to-URL resolution and MIME capability validation.
- `pixi-presenter`: Pixi renderer adapter only; it does not interpret runtime commands. Its top level owns only Actor, Weather, Persistent screen, Transient, and Trial families; effect leaves own their private resources. Its private FX assets are bundled implementation details, not App manifest content.
- `navi-director` / `trial-director`: mode-specific state and flow.
- app packages: flow/save/overlay composition, per-game content, manifest, and
  application policy callbacks; reusable runtime/Devtools/Pixi mechanisms stay
  in shared packages.

## Renderer boundaries

DOM owns text-heavy and accessibility-sensitive UI. Pixi owns VN/trial 2D
presentation. R3F owns exploration and 3D trial staging. Gameplay and state
packages cannot depend on any renderer, browser storage, or audio implementation.
`@cue` is therefore a DOM StoryText presentation channel, not a Pixi effect or
an app-owned overlay.

See [VN integration](app-vn-integration.md), [presentation](presentation-pipeline.md),
[Pixi effects](pixi-effects.md),
[adding a Pixi effect](adding-pixi-effect.md),
[assets](asset-pipeline.md), [contracts](contracts.md), and
[Nani source diagnostics](nani-source-diagnostics.md), and
[Nani devtools](vn-devtools.md). Browser-native interaction hardening is defined
only in [Web game browser policy](web-game-browser-policy.md).

The exact-source boundary is continuously checked by
`pnpm validate:nani-diagnostics-cleanup` and the deterministic stress/performance
gate `pnpm validate:nani-diagnostics-quality`.
