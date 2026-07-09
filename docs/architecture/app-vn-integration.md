# App VN Integration

## Intent

This document owns app-specific wiring for applications that host the shared VN
runtime. It covers how app packages compose `packages/app-vn-runtime`,
`packages/app-vn-shell`, app flow, save/settings adapters, asset registries,
custom surfaces, and debug entry points.

It does not define shared VN execution semantics, runtime command fanout, route
tables, Pixi reducers, or asset manifest contracts. Those remain in:

- `docs/architecture/vn-runtime-dispatcher.md`
- `docs/architecture/presentation-pipeline.md`
- `docs/architecture/asset-pipeline.md`

## Integration Shape

An app-hosted VN path follows this ownership pattern:

- The app creates an `AssetRegistry` from its own `ContentManifest`.
- The app derives narrow runtime settings such as dialog display, reveal speed,
  story-play timing, dialogue bleep volume, and voice locale/volume from its
  canonical settings snapshot.
- The app calls `useVnRuntime` directly or through an app-local wrapper that
  supplies the `VnRuntimeEntry`, asset resolver, settings, media ports, route
  table/profile overrides, and app callbacks.
- The app owns flow transitions such as title to VN, VN overlay to Navi, trial
  entry, return title, and load confirmation.
- The app owns save slot policy and maps save data into
  `restoreVnState()` / `createVnSaveSnapshot()` rather than pushing save
  persistence into shared VN packages.
- The app owns overlay/page adapters that provide app-specific save/settings
  data and dispatch shell actions into app flow or `app-vn-runtime`.
- `GameInteractionShell` mounts DOM runtime UI surfaces and shell overlays from
  committed runtime and flow state.
- `VnRuntimeDispatcher` renders the already-committed Pixi stage snapshot. It
  is not responsible for app startup, flow, save/load, settings, or debug
  policy.

Shared packages must not learn app-specific flow machines, save slot layouts,
Navi/Trial glue, UI skin asset roles, or debug control panels. App packages must
not reimplement the VN story loop, runtime command fanout, reveal timers,
AUTO/SKIP scheduling, voice gates, media handle ownership, or Pixi wait release.

## Game A Standalone VN

`apps/game-a` is a standalone VN2D app integration. It composes:

- `useGameAVnRuntime` as the app-local wrapper around `useVnRuntime`.
- `GameInteractionShell` for title, dialog, choices, command bar, overlays,
  input prompt, toast, movie overlay, and VN advance hit plane.
- `VnRuntimeDispatcher` for Pixi snapshot rendering.
- A Game A `AssetRegistry` from `gameAContentManifest`.
- App-local flow, save, settings, overlay, and UI skin adapters.

Game A does not mount Navi, Trial, R3F, or harness debug controls. Game A source
must not import `app-vn-session`, `app-vn-dispatch`, `story-play`,
StoryEngine, parser/compiler packages, or Pixi presenter internals for normal VN
runtime behavior.

Game A's save adapter is localStorage-backed and stores v5 `SaveData` in
independent app-local slot records. Each record wraps the restore payload plus a
text summary and a reserved preview field; the record is the source of truth,
the index is only a cache, and summaries are normalized from `record.data`
through the shared contracts helper when records are read. VN story and Pixi
stage snapshots are written only to `data.vn.story` and
`data.vn.pixiStage`; `navi` and `trial` are `null` for Game A saves. Game A UI
skin resources are app-local config: skin asset ids
resolve through the app-created `AssetRegistry`, custom
`GameInteractionShell` Surfaces receive resolved availability, and missing skin
assets should surface diagnostics while preserving visible fallback chrome.
Game A currently exposes forty manual save slots in its app-local pages and one
independent hidden quick slot routed by `quick-save` / `quick-load`. Quick load
does not use the load-confirmation overlay; it immediately restores the quick
slot when present, while the command bar disables Q.Load when that slot is
empty.

Game A temporarily treats the VN pause experience as app-local overlay tabs:
`vn-backlog`, `vn-save`, `vn-load`, and `vn-settings` render inside one
full-screen DOM shell, and `open-pause-menu` enters that shell through the log
tab. This is intentionally not a shared pause/resume model. Navi and Trial
pause unification should happen in a later integration pass instead of leaking
their flow semantics into the standalone VN styling iteration.

## Game A Dev Launch Target

Game A's development-only `?vnStart=<label>` shortcut is app startup policy. It
is not `VnRuntimeDispatcher` behavior and is not shared VN runtime state.

The Game A app parses `vnStart` only in dev mode, normalizes an optional `#`
prefix, and passes the result as an app-local `startLabelOverride` into
`useGameAVnRuntime`. The wrapper translates that into the VN entry `startLabel`,
so the actual boot path still goes through `useVnRuntime`,
`createVnSession()`, and StoryEngine jump behavior.

When a valid dev launch target is present, Game A auto-starts once and enters VN
through the normal app flow event. When the label is missing, the app leaves the
user on the title surface and shows a dev-only error. `app-vn-runtime` only
reports the invalid start-label diagnostic and blocks `startStory()` for that
entry; it does not persist, migrate, or restore debug launch state.

`.nani` edits in Game A should full-reload the dev page rather than trying to
preserve old runtime state with HMR. The URL remains the restart contract for
debug labels.

## Harness Showcase Integration

`apps/game-harness` is the integrated showcase baseline. It composes shared VN
runtime with Navi, Trial, Pixi, R3F, media, save/load, settings, pause/menu,
debug readouts, and smoke controls in one game-shaped app.

The harness uses:

- `useHarnessShowcaseRuntimeAdapter` as harness-only wiring around
  `useVnRuntime`, Navi, Trial, gameplay state, R3F first-person bridge, and
  debug state.
- `harnessContentManifest` plus `AssetRegistry` for media, Pixi, R3F,
  UI/evidence, font, and bleep assets.
- `GameInteractionShell` for VN shell UI, overlays, movie overlay, input prompt,
  and VN advance hit plane.
- `VnRuntimeDispatcher` for Pixi snapshot rendering.
- The default `GameInteractionShell` Surface preset as compatibility coverage
  for apps that do not customize UI skin slots.
- `InspectorLite` and harness runtime controls as app debug surfaces, not
  shared runtime behavior.

Scenario code should not manually filter runtime commands by renderer. Shared
fanout changes belong in `VnOutputRouteTable` and
`createVnRuntimePresentationTransaction`; app adapters may pass profile or
route table overrides into `useVnRuntime`.

Harness saves continue to use `packages/media-save` with Dexie storage. The
harness does not use Game A's record envelope. It writes v5 sections directly:
VN story/Pixi under `vn`, Navi state under `navi`, and Trial state under
`trial` only when Trial is active. The harness save adapter owns its own forty
manual slot ids and one hidden quick slot. Dexie remains an id-addressed save
port; it does not own slot count, pagination, or quick-slot policy.

Harness-owned interaction hooks such as `useGameFlowActor`,
`useHarnessShowcaseRuntimeAdapter`, `useHarnessShowcaseSaveAdapter`,
`useOverlayPageAdapters`, and `useFirstPersonExplorationBridge` must remain in
the harness app. They should not move into `packages/app-vn-runtime`,
`packages/app-vn-dispatch`, or `packages/app-vn-shell`.

## Asset Reference Boundary

App VN entries, scripts, maps, UI config, and renderer adapters reference asset
ids only. Runtime files are registered through generated app assets and resolved
through the app-created `AssetRegistry`.

Active app `.nani` references that resolve media, Pixi backgrounds, video, or
character-pack assets must be covered by the owning app's VN entry
`assetRefs`. Detailed manifest, generator, validation, and character-pack rules
belong in `docs/architecture/asset-pipeline.md`.
