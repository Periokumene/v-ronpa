# VN Runtime Transaction And Dispatcher

VN runtime output is split in two app-layer steps:

- `StoryEngine` advances a compiled `RuntimeScript` and returns the current
  step's `emittedRuntimeCommands`.
- `createVnRuntimePresentationTransaction` fans those emitted runtime commands
  out to runtime consumers such as Pixi stage snapshots, render hints, and
  gameplay events.
- `VnRuntimeDispatcher` renders already-materialized Story UI state and Pixi
  stage state. Dialog text and choices come from Story state, not from command
  stream replay.

## Ownership

- `nani-parser` owns `.nani` parsing and `CommandIR` / `TextIR` production.
- `nani-runtime-compiler` owns `ScenarioIR` to `RuntimeScript` compilation:
  command id normalization, alias resolution, stable params, source metadata,
  and compiler diagnostics. Implemented commands expose canonical runtime params
  only; raw script aliases stay in `sourceCommand`.
- `StoryEngine` owns script execution, variables, backlog, pending choices,
  instruction pointer, expression evaluation, end state, and per-step
  `emittedRuntimeCommands`.
- `story-play` owns StoryEngine playback control: manual/AUTO/SKIP mode,
  one-shot `autoNext`, schedule selection, pacing intent, and automation stop
  reasons. It does not own timers, React effects, Pixi, DOM, or save data.
- `StoryRuntimeState` is saveable story state only. It must not store runtime
  command streams, presentation logs, or transient effects.
- `createVnRuntimePresentationTransaction` owns app-level fanout from emitted
  `RuntimeCommand` records.
- `VnRuntimeDispatcher` owns React rendering of the DOM dialog and Pixi layer
  from committed runtime state.
- DOM UI owns dialogue text, choices, menus, settings, save/load screens, and
  other accessibility-sensitive surfaces.
- Pixi owns VN/trial 2D effects, backgrounds, portraits, filters, particles,
  and fast 2D overlays.
- R3F owns 3D staging, camera rigs, and spatial interaction.

## Route Table

`apps/game/src/vnOutputRoutes.ts` exports `VnOutputRouteTable`.

Route entries are fixed in this baseline and support one-to-many targets:

- `commands`: keyed by normalized `RuntimeCommand.commandId`.
- `categories`: fallback targets keyed by `NaniCommandCategory`.
- `wildcards`: keyed by `RuntimeCommand.params.wildcardType`, with optional
  `routeKey` overrides.

The API accepts `profile: "vn2d" | "vn3d"` for future routing strategies, but
the current baseline intentionally uses the same fixed table for both.

## Default Targets

- `print` routes to `debug` only. DOM dialog text comes from
  `StoryRuntimeState.backlog`.
- `back`, `charenter`, `shake`, `flash`, `focus`, and `trialkeyword` route to
  `pixi`.
- `gameplay` routes to `gameplay`.
- Media-category commands route to `media` when emitted.
- Flow/state control commands are consumed by StoryEngine and normally do not
  enter the emitted command stream.
- Wildcard commands route through the wildcard table.

Pixi-routed runtime commands are interpreted at the app adapter boundary and
reduced into `PixiStageSnapshot` plus transient render hints before React
rendering. Saves store the snapshot and story/gameplay state, not runtime
command streams.

RuntimeCommand durations use `params.duration`. The Pixi adapter maps that value
to the existing PresentationCommand `durationMs` field. App adapters expect
StoryEngine-resolved params; if an expression reaches this layer, the adapter
skips the output and reports a transaction diagnostic instead of falling back.

## Vertical Slice Migration

The vertical-slice harness uses:

- `parseScenario` followed by `compileRuntimeScript`.
- `StoryEngine` stepping over `RuntimeScript`.
- `story-play` selection of AUTO/SKIP/manual playback schedule and pacing.
- `createVnRuntimePresentationTransaction` for emitted command fanout.
- `VnRuntimeDispatcher` for Pixi snapshot + VN dialog rendering.
- `PixiStageSnapshot` as the saveable terminal state for VN 2D staging.
- `InspectorLite` debug counters derived from the latest emitted command batch,
  not from a cumulative presentation log.

Scenario code should not manually filter runtime commands by renderer. Add or
update `VnOutputRouteTable` routes and pass the desired `profile` / `routeTable`
into the runtime adapter instead.

VN toolbar actions are intentionally outside `VnRuntimeDispatcher`. LOG, SKIP,
AUTO, SAVE, LOAD, and SETTING are shell UI actions derived from
`InteractionCapabilitySnapshot`; they should enter the app through
`GameInteractionShell` and its overlay/page adapters. AUTO/SKIP actions are
routed from those adapters into the runtime adapter, which hosts web timers and
delegates playback rules to `story-play`.

## Future Branches

- The performance branch can add new Pixi runtime command handlers without
  changing StoryEngine state shape.
- The UI branch can add settings, backlog, save/load, auto/skip, and style
  surfaces behind `GameInteractionShell` and `ui-kit` display components.
- Branch-local experiments should use `@wildcard-<type> routeKey:<key>` and
  route by `wildcardType + routeKey`. Promote a wildcard to an explicit command
  only when it stabilizes.
