# VN Runtime Transaction And Dispatcher

VN runtime output is split in two app-layer steps:

- `createVnRuntimePresentationTransaction` projects each StoryEngine delta into
  runtime consumers such as Pixi stage snapshots, render hints, and gameplay
  effects.
- `VnRuntimeDispatcher` renders the already-materialized Story UI state and
  Pixi stage state. It does not filter or replay Story command logs for Pixi.

## Ownership

- StoryEngine owns script execution, backlog, choices, `presentationCommands`,
  and incremental `effects`.
- `presentationCommands` is the cumulative presentation command log.
- `effects` is the incremental side-effect stream.
- `createVnRuntimePresentationTransaction` owns app-level fanout from those two
  output sources.
- `VnRuntimeDispatcher` owns React rendering of the DOM dialog and Pixi layer
  from committed runtime state.
- `GameInteractionShell` owns VN toolbar actions and shell overlays such as
  backlog, settings, save, load, title, and pause menu.
- DOM UI owns dialogue text, choices, menus, settings, save/load screens, and
  other accessibility-sensitive surfaces.
- Pixi owns VN/trial 2D effects, backgrounds, portraits, filters, particles,
  and fast 2D overlays.
- R3F owns 3D staging, camera rigs, and spatial interaction.

## Route Table

`apps/game/src/vnOutputRoutes.ts` exports `VnOutputRouteTable`.

Route entries are fixed in this baseline and support one-to-many targets:

- `presentationCommands`: keyed by `PresentationCommand.type`.
- `effects`: keyed by `StoryEffect.type`.
- `wildcards`: keyed by `wildcardType`, with optional `routeKey` overrides.

The API accepts `profile: "vn2d" | "vn3d"` for future routing strategies, but
the current baseline intentionally uses the same fixed table for both.

## Default Targets

- `print` presentation commands route to `ui`.
- Pixi presentation commands route to `pixi`.
- R3F presentation commands route to `r3f`.
- `gameplay-event` routes to `gameplay`.
- `media-event` routes to `media`.
- `navi-event` routes to `navi`.
- `trial-event` routes to `trial`.
- `wildcard-event` routes through the wildcard table.
- `presentation` effects route to `debug` only.

`presentation` effects must not be re-executed by Pixi. The runtime transaction
is the only place that interprets newly emitted Pixi-routed presentation
commands; it reduces them into `PixiStageSnapshot` plus transient render hints.
React rendering and save/load use the snapshot, not the command log.

## Vertical Slice Migration

The vertical-slice harness now uses:

- `createVnRuntimePresentationTransaction` for Story delta fanout.
- `VnRuntimeDispatcher` for Pixi snapshot + VN dialog rendering.
- `PixiStageSnapshot` as the saveable terminal state for VN 2D staging.
- `InspectorLite` still reads `presentationCommands` as the presentation log.

Scenario code should not manually filter `presentationCommands` by renderer
after this baseline. Add or update `VnOutputRouteTable` routes and pass the
desired `profile` / `routeTable` into the runtime adapter instead.

VN toolbar actions are intentionally outside `VnRuntimeDispatcher`. BACK, LOG,
SKIP, AUTO, SAVE, LOAD, and SETTING are shell UI actions derived from
`InteractionCapabilitySnapshot`; they should enter the app through
`GameInteractionShell` and its overlay/page adapters. If a future `.nani`
command produces a runtime effect that changes a toolbar capability, route that
effect first, then let the shell capability policy expose the UI state.

## Future Branches

- The performance branch can add new Pixi presentation command handlers without
  changing the app fanout shape.
- The UI branch can add settings, backlog, save/load, auto/skip, and style
  surfaces behind `GameInteractionShell` and `ui-kit` display components.
- Branch-local experiments should use `@wildcard-<type> routeKey:<key>` and
  route by `wildcardType + routeKey`. Promote a wildcard to an explicit command
  only when it stabilizes.
