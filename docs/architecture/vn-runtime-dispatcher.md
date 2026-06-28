# VN Runtime Transaction And Dispatcher

VN runtime output is split in two app-layer steps:

- `StoryEngine` advances a compiled `RuntimeScript` and returns the current
  step's `emittedRuntimeCommands`.
- `createVnRuntimePresentationTransaction` fans those emitted runtime commands
  out to runtime consumers such as Pixi stage snapshots, render hints, and
  gameplay events.
- The vertical-slice app adapter also derives dialogue line audio from emitted
  `print.params.textId` and reveal state during story step commit; this is
  intentionally outside React render/effect replay.
- The vertical-slice app adapter derives transient dialog text reveal state
  from the emitted `print` plus the current Story line during the same commit.
  The reveal runtime owns grapheme pacing and lifecycle events only; StoryEngine
  continues to own the complete visible line, backlog, and save snapshot.
- `VnRuntimeDispatcher` renders already-materialized Pixi stage state.
  `GameInteractionShell` renders DOM runtime UI surfaces such as dialog,
  command bar, toast, input prompt, and movie overlay. Dialog text and choices
  come from committed Story/app runtime state, not from command stream replay.

## Ownership

- `nani-parser` owns `.nani` parsing and `CommandIR` / `TextIR` production.
- `nani-runtime-compiler` owns `ScenarioIR` to `RuntimeScript` compilation:
  command id normalization, catalog-aware ordered arg binding, alias
  resolution, stable params, source metadata, and compiler diagnostics.
  Implemented commands expose canonical runtime params only; raw script aliases
  stay in `sourceCommand`.
- `StoryEngine` owns script execution, variables, backlog, pending choices,
  instruction pointer, expression evaluation, end state, and per-step
  `emittedRuntimeCommands`.
- `story-play` owns StoryEngine playback control: manual/AUTO/SKIP mode,
  one-shot `autoNext`, schedule selection, pacing intent, and automation stop
  reasons. It does not own timers, React effects, Pixi, DOM, voice state, or
  save data.
- `StoryRuntimeState` is saveable story state only. It must not store runtime
  command streams, presentation logs, or transient effects.
- `createVnRuntimePresentationTransaction` owns app-level fanout from emitted
  `RuntimeCommand` records.
- `VnRuntimeDispatcher` owns React rendering of the Pixi layer from committed
  runtime state and receives the app-created structural asset resolver for Pixi
  texture loads.
- `GameInteractionShell` owns React mounting for DOM runtime UI surfaces from
  committed app runtime state. Script-controlled `showUI` / `hideUI` visibility
  applies only to concrete runtime UI surfaces, not shell overlays, debug
  readouts, or Pixi.
- Pixi `PresentationTask` snapshots flow from `pixi-presenter` to app debug UI
  through `onTasksChanged`. They are renderer-local lifecycle observations, not
  save data. When StoryEngine is stopped on an explicit Pixi `wait!`, the app
  matches the wait's `expectedTasks` against these snapshots to resume story
  flow on real Pixi completion.
- Settings are not routed through StoryEngine or RuntimeCommand output.
  `apps/game` derives VN dialog display props and story-play timing policy from
  the canonical settings snapshot, then passes those narrow values into runtime
  adapters and `GameInteractionShell` / `VnDialogSurface`.
- Dialog reveal uses the same app-derived display `textSpeed` as
  `VnDialogSurface`. It is not a settings schema extension and does not add a
  second saved pacing authority.
- Voice locale and volume are likewise app-derived settings. The app maps
  `zh-CN` / `zh-TW` to voice locale `zh`, currently permits `ja` / `en` as
  direct voice locales, and falls back other UI languages to `zh` until a voice
  locale is explicitly added. Voice volume is
  `muted ? 0 : masterVolume * voiceVolume`.
- DOM UI owns dialogue text, choices, menus, settings, save/load screens, and
  other accessibility-sensitive surfaces.
- Pixi owns VN/trial 2D effects, backgrounds, layered characters, filters,
  particles, and fast 2D overlays.
- R3F owns 3D staging, camera rigs, and spatial interaction.
- Media, Pixi, R3F, and UI/evidence image references all resolve through the
  app-created `AssetRegistry`. Low-level ports such as Howler and HTML video
  receive only already-resolved URLs.

## Route Table

`apps/game/src/vnOutputRoutes.ts` exports `VnOutputRouteTable`.

Route entries are fixed in this baseline and support one-to-many targets:

- `commands`: keyed by normalized `RuntimeCommand.commandId`.
- `categories`: fallback targets keyed by `NaniCommandCategory`.

The API accepts `profile: "vn2d" | "vn3d"` for future routing strategies, but
the current baseline intentionally uses the same fixed table for both.

## Default Targets

- `print` routes to `debug` only. DOM dialog text comes from
  `StoryRuntimeState.text.current`, with legacy backlog fallback where needed.
- `back`, `char`, `shake`, `flash`, `focus`, and `trialkeyword` route to
  `pixi`.
- `charenter` routes to `debug` only as a migration stub; new scripts should
  use official `char`.
- `gameplay` routes to `gameplay`.
- Media-category commands route to `media` when emitted.
- Flow/state control commands are consumed by StoryEngine and normally do not
  enter the emitted command stream.

Pixi-routed runtime commands are passed directly to `pixi-presenter`'s
RuntimeCommand reducer and reduced into `PixiStageSnapshot` plus transient
render hints before React rendering. Saves store the snapshot and
story/gameplay state, not runtime command streams or active Pixi
`PresentationTask` records.

Pixi presentation timing uses canonical `params.durationMs`; compiler input may
still accept Naninovel `time` seconds and V-Ronpa compatibility `duration`.
The public command stream remains `RuntimeCommand`. App adapters expect
StoryEngine-resolved params; if an expression reaches this layer, the adapter
skips the output and reports a transaction diagnostic instead of falling back.
Pixi reducers also return diagnostic no-op output for commands with missing or
unsupported Pixi-consumable params rather than writing placeholder stage ids.

Media source refs, Pixi appearances, R3F model refs, and UI/evidence texture
refs are asset ids, not paths. The vertical-slice runtime adapter resolves
media ids before calling `AudioPort` or `VideoPort`; `VnRuntimeDispatcher`
passes the same resolver to Pixi; and the first-person bridge passes it to the
R3F stage. Missing asset resolution is surfaced as runtime diagnostics and
visible fallback behavior, not guessed public URLs.

Dialogue line audio is a media derivation, not StoryEngine behavior. The app
uses one dialogue audio planner for each committed `print`: a resolvable
`voice:<locale>:<textId>` asset wins and suppresses bleep, even when voice
volume is zero; otherwise reveal bleep may fallback through
`ContentManifest.audio.dialogueBleep`.

```text
print.params.textId
  -> app story step commit voice availability check
  -> stop-voice boundary for the new print
  -> if voice asset resolves: AudioPort.playVoice()
  -> else if reveal is active: dialogue bleep lookup/play
```

Story current text, backlog, and save snapshots keep only visible dialogue
text. Load restore, backlog rendering, React rerender, and SKIP pacing must not
replay derived voice.

Dialogue reveal bleep is independent from script-authored SFX and only acts as
the unvoiced reveal fallback:

```text
print speaker from nani xxx:
  -> app dialogue audio planner after voice availability check
  -> ContentManifest.audio.dialogueBleep exact speaker lookup
  -> AssetRegistry.resolve({ kind: "bleep" })
  -> AudioPort.playDialogueBleep()
  -> reveal finish / clear / skip / reset / trial entry stops the handle
```

The bleep handle is not stored in looping SFX handles, is not stopped by
script-level `@stopSfx`, and never installs or releases the voice auto-advance
gate. A planned `textId` with no matching voice asset is treated as an unvoiced
line and may fallback to bleep without a missing-voice warning; a voice asset
kind mismatch is warned and still falls back. Missing bleep assets or playback
failures produce runtime diagnostics and must not block StoryEngine advancement.

AUTO and one-shot `autoNext` still use `story-play` only for the text minimum
stay time. When that app-hosted timer reaches zero, the runtime adapter checks
the current voice gate: if a voice handle was successfully started and remains
audible, AUTO waits for `AudioHandle.finished` to resolve with `ended`, then
waits the app policy delay of 500ms before requesting the next StoryEngine step.
If the handle resolves with `failed`, the gate releases any already pending
AUTO/`autoNext` request immediately and future automation requests are not
blocked. If the handle resolves with `stopped`, the gate only clears itself so
manual input, SKIP, choices, or a new print boundary cannot release stale
automation. Missing assets, muted or zero-volume voice, and SKIP pacing never
install a voice wait.

Every emitted `print` is a voice boundary. A print without `textId` stops the
previous active voice but does not install a new gate. Manual advance and choice,
load, reset, overlay close, story end, and trial entry clear any pending gate;
manual advance only stops voice when the current Story state can actually
advance or complete its wait.

Dialog text reveal is app-local transient presentation state:

```text
emitted print + selectCurrentStoryLine()
  -> app dialogRevealRuntime
  -> visible text slice for GameInteractionShell
  -> VnDialogSurface text prop
```

The full line remains in `StoryRuntimeState.text.current`, backlog, save data,
and load summaries. `VnDialogSurface` does not own timers or reveal state; it
only renders the text it receives and forwards advance input. Manual advance
while reveal is active completes the current line and returns; the following
advance is the one that enters StoryEngine. AUTO and one-shot `autoNext` use one
line budget from the print commit time: elapsed reveal time counts toward that
budget, but the adapter will not request the voice gate or StoryEngine advance
until reveal is complete. SKIP completes the active reveal immediately and then
continues on the skip schedule. A `print` committed while the dialog surface is
hidden stores a complete reveal state and does not gate advance. Load, restore,
reset, overlay close, and trial entry clear reveal state so restored lines do
not replay typewriter effects.
Reveal overlay state is scoped to the `print` step that created it; if a later
StoryEngine step changes the current line without emitting a new `print`, the
adapter clears the overlay so text mutations such as `@append` are not hidden
behind stale partial text.
Reveal lifecycle events (`reveal-start`, `reveal-tick`, `reveal-finish`) remain
app-local presentation signals. Dialogue bleep uses reveal start/finish as a
loop boundary only; completing or instantly revealing a line does not synthesize
catch-up `reveal-tick` events, so bleep playback does not burst during manual
completion, SKIP, or restore-like paths.

Presentation wait release is task-driven. `createVnRuntimePresentationTransaction`
returns Pixi wait descriptors, the runtime adapter stores them on
`StoryRuntimeState.presentationWait.expectedTasks`, and `onTasksChanged`
completion triggers `PRESENTATION_COMPLETE` followed by immediate StoryEngine
resume. App timers are fallback diagnostics only, not the primary wait release
mechanism. Manual advance during the wait settles Pixi to the terminal snapshot
and then resumes story flow.

## Vertical Slice Migration

The vertical-slice harness uses:

- `parseScenario` followed by `compileRuntimeScript`.
- `StoryEngine` stepping over `RuntimeScript`.
- `story-play` selection of AUTO/SKIP/manual playback schedule and pacing.
- `createVnRuntimePresentationTransaction` for emitted command fanout.
- `harnessContentManifest` plus `AssetRegistry` for all media, Pixi, R3F, and
  UI/evidence asset ids.
- `VnRuntimeDispatcher` for Pixi snapshot rendering.
- `GameInteractionShell` for VN dialog, command bar, toast, input prompt, movie
  overlay, and durable shell overlay mounting.
- `PixiStageSnapshot` as the saveable terminal state for VN 2D staging.
- `InspectorLite` debug counters derived from the latest emitted command batch,
  not from a cumulative presentation log.

Scenario code should not manually filter runtime commands by renderer. Add or
update `VnOutputRouteTable` routes and pass the desired `profile` / `routeTable`
into the runtime adapter instead.

VN dialog and toolbar actions are intentionally outside `VnRuntimeDispatcher`.
LOG, SKIP, AUTO, SAVE, LOAD, and SETTING are shell UI actions derived from
`InteractionCapabilitySnapshot`; they should enter the app through
`GameInteractionShell` and its overlay/page adapters. AUTO/SKIP actions are
routed from those adapters into the runtime adapter, which hosts web timers and
delegates playback rules to `story-play`. The Pixi active task debug list must
not be used to enable or disable these controls.

Settings overlay edits update app-owned canonical settings immediately and are
debounced to localStorage by the app adapter. The overlay does not own draft
state, does not render dialogue previews, and does not subscribe to runtime
state. Text rendering remains in `VnDialogSurface`; settings can only affect it
through display props.

## Future Branches

- The performance branch can add new Pixi runtime command handlers without
  changing StoryEngine state shape.
- Future UI branches can extend backlog, save/load, auto/skip, and style
  surfaces behind `GameInteractionShell` and `ui-kit` display components.
  Settings extensions should keep the same app-owned canonical state and narrow
  runtime-consumer pattern.
- Branch-local experiments must add explicit V-Ronpa command declarations before
  they can enter `RuntimeCommand` dispatch. Unknown `@` commands are compiler
  errors, not app-routed extension points.
