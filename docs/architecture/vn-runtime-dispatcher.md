# VN Runtime Transaction And Dispatcher

VN runtime output is split across shared app-layer packages and render surfaces:

- `packages/app-vn-session` wraps parser/compiler/StoryEngine/story-play boot
  and stepping behind a shared headless session boundary.
- `StoryEngine` advances a compiled `RuntimeScript` and returns the current
  step's `emittedRuntimeCommands`.
- `createVnRuntimePresentationTransaction` fans those emitted runtime commands
  out to runtime consumers such as Pixi stage snapshots, render hints, and
  gameplay events.
- `packages/app-vn-dispatch` also owns pure reducers/helpers for dialog reveal,
  runtime UI surface presentation, playback gates, and dialogue audio planning.
  It does not own browser timers, React state, asset resolution, or media ports.
- `packages/app-vn-runtime` hosts the reusable VN runtime loop that app
  wrappers call. It derives transient dialog text reveal state from emitted
  `print` plus the current Story line, owns runtime UI state and the shared RAF
  visual clock for dialog reveal/UI transitions, AUTO/SKIP schedule hosting,
  voice auto-advance gates, live media handles, movie overlay playback, Pixi/UI
  presentation-wait completion, runtime-wait completion, and restore/reset
  cleanup. StoryEngine continues to own the complete visible line, backlog, and
  save snapshot.
- `VnRuntimeDispatcher` renders already-materialized Pixi stage state.
  `GameInteractionShell` renders DOM runtime UI surfaces such as dialog
  display, choice overlay, command bar, toast, input prompt, and movie overlay.
  Dialog text and choices come from committed Story/app runtime state, not from
  command stream replay.
- `GameInteractionShell` derives narrow ViewModels for dialog, choices,
  command bar, title, toast layer, input prompt, backlog, save/load, settings,
  and pause menu, then mounts Surface slots that receive only `{ model,
  actions }`. Apps may replace any slot independently; omitted slots fall back
  to the shared default preset. `RuntimeMovieOverlaySurface` and
  `GameOverlayHost` remain shell infrastructure, not app-replaceable Surface
  slots in this pass.

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
- `packages/app-vn-session` is the reusable headless wrapper around VN
  parser/compiler/StoryEngine/story-play boot and stepping. It owns choice,
  input, runtime-wait, presentation-wait, AUTO/SKIP toggles, and session-local
  restore snapshots, but not public save persistence or browser side effects.
- `packages/app-vn-runtime` is the reusable browser/runtime side-effect host
  for VN. It composes `app-vn-session`, `app-vn-dispatch`, `media-save`,
  app-created asset resolution, and React state into a shell-compatible runtime
  adapter. It is host-agnostic: it does not import or understand Navi, Trial,
  R3F, save slot policy, or app flow machines.
- `StoryRuntimeState` is saveable story state only. It must not store runtime
  command streams, presentation logs, or transient effects.
- `packages/app-vn-dispatch` owns shared headless fanout from emitted
  `RuntimeCommand` records: route selection, presentation transactions,
  media/UI reducers, dialog reveal pacing helpers, dialog playback gate
  selection, and dialogue audio planning. It defines the pure `UiRuntimeState`
  reducer shape, but `app-vn-runtime` is the live holder of that state.
- `VnRuntimeDispatcher` owns React rendering of the Pixi layer from committed
  runtime state and receives the app-created structural asset resolver for Pixi
  texture loads.
- `GameInteractionShell` owns React mounting for DOM runtime UI surfaces from
  committed app runtime state. Script-controlled `showUI` / `hideUI`
  presentation applies only to concrete runtime UI surfaces (`dialog`,
  `commandBar`, `toastLayer`), not shell overlays, debug readouts, lifecycle
  input/movie overlays, or Pixi.
- `GameInteractionShell` remains an orchestration layer: it updates flow
  context, handles ESC close/pause behavior, mounts the VN advance hit plane,
  gates choices, dispatches command actions, submits input prompts, dismisses
  toasts, and mounts Surface slots. It does not own story stepping policy,
  dialog reveal timers, AUTO/SKIP scheduling, voice gates, movie playback, Pixi
  waits, save persistence, or app flow policy.
- In primary VN and Navi VN2D, `GameInteractionShell` also owns the transparent
  manual-advance hit plane. It is app-layer orchestration, not a shared input
  system. The hit plane exists only while story is active and not ended, with
  no pending choices, shell overlay, input prompt, or movie overlay. It may
  remain active while the dialog surface itself is hidden so script-authored
  `hideUI dialog` lines can still advance.
- Pixi `PresentationTask` snapshots flow from `pixi-presenter` to app debug UI
  through `onTasksChanged`. They are renderer-local lifecycle observations, not
  save data. When StoryEngine is stopped on an explicit Pixi `wait!`,
  `app-vn-runtime` matches the wait's `expectedTasks` against these snapshots to
  resume story flow on real Pixi completion.
- UI `presentationWait` uses the same StoryEngine wait slot with
  `channel: "ui"`, explicit `targets`, and `targetVisible`. `app-vn-runtime`
  advances UI transitions through its visual clock and releases the wait when all
  target surfaces reach their terminal presentation state. Manual continue or
  SKIP settles the target UI surfaces to the wait terminal state before resuming.
- Settings are not routed through StoryEngine or RuntimeCommand output.
  `packages/app-vn-shell` exposes the reusable settings adapter, and each app
  derives VN dialog display props and story-play timing policy from the
  canonical settings snapshot before passing those narrow values into runtime
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
  other accessibility-sensitive surfaces. The VN dialog display and choice
  selection are separate DOM surfaces: `VnDialogSurface` renders speaker/text
  only, while `VnChoiceOverlay` renders pending choices above the dialog.
- `ui-kit` provides reusable controlled DOM surfaces and primitives such as
  rich text rendering, command controls, overlay panels, and default
  presentation components. The VM-bound default preset lives at the
  `app-vn-shell` boundary so `ui-kit` does not depend on app shell ViewModel
  types or read full runtime/flow state.
- Pixi owns VN/trial 2D effects, backgrounds, layered characters, filters,
  particles, and fast 2D overlays.
- Pixi also owns layout-only relayout for objects inside its own host/canvas
  rectangle when that rectangle resizes. This relayout updates Pixi geometry and
  shader/filter dimensions against the current host size, but does not replay
  VN runtime commands, mutate `PixiStageSnapshot`, clear active wait tasks, or
  define app DOM layout. Dialog, command bar, choices, and shell overlays remain
  DOM surface responsibilities. A shared app/Pixi virtual viewport, if needed,
  must be introduced as an app-layer bridge rather than as a Pixi-only
  alternate layout policy.
- R3F owns 3D staging, camera rigs, and spatial interaction.
- Media, Pixi, R3F, and UI/evidence image references all resolve through the
  app-created `AssetRegistry`. `app-vn-runtime` resolves VN media ids before
  calling `AudioPort` or `VideoPort`; `VnRuntimeDispatcher` passes the same
  resolver to Pixi; and app glue such as the harness first-person bridge passes
  it to R3F. Low-level ports such as Howler and HTML video receive only
  already-resolved URLs.
- App-specific UI skins resolve texture ids through the same app-created
  `AssetRegistry` before passing URLs into custom Surface components. UI
  components must not hardcode app public paths; missing skin assets should
  surface diagnostics and use CSS fallback chrome rather than substituting a
  hidden default texture.

## Route Table

`packages/app-vn-dispatch/src/vnOutputRoutes.ts` exports `VnOutputRouteTable`.

Route entries are fixed in this baseline and support one-to-many explicit
targets:

- `commands`: keyed by normalized `RuntimeCommand.commandId`.
- `categories`: fallback targets keyed by `NaniCommandCategory`.

Routing order is explicit command route, command catalog `execution` / `status`
route, then category fallback. This lets catalog-promoted commands route even
when they are not listed in `commands`, while declared-only or unimplemented
compatibility commands stay in debug output.

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
- Implemented media-output commands route to `media`; known unimplemented or
  stubbed media commands route to `debug`; unknown media-category commands may
  still fall back to `media`.
- Flow/state control commands are consumed by StoryEngine and normally do not
  enter the emitted command stream.

Pixi-routed runtime commands are passed directly to `pixi-presenter`'s
RuntimeCommand reducer and reduced into `PixiStageSnapshot` plus transient
render hints before React rendering. Saves store the snapshot and
story/gameplay state, not runtime command streams or active Pixi
`PresentationTask` records.

Pixi presentation timing uses canonical `params.durationMs`; compiler input may
still accept Naninovel `time` seconds and V-Ronpa compatibility `duration`.
The public command stream remains `RuntimeCommand`. `app-vn-runtime` expects
StoryEngine-resolved params before dispatch planning; if an expression reaches
this layer, the transaction skips the output and reports a diagnostic instead of
falling back. Pixi reducers also return diagnostic no-op output for commands
with missing or unsupported Pixi-consumable params rather than writing
placeholder stage ids.

Media source refs, Pixi appearances, R3F model refs, and UI/evidence texture
refs are asset ids, not paths. Missing asset resolution is surfaced as runtime
diagnostics and visible fallback behavior, not guessed public URLs.

Dialogue line audio is a media derivation, not StoryEngine behavior.
`app-vn-runtime` uses the `app-vn-dispatch` dialogue audio planner for each
committed `print`: a resolvable `voice:<locale>:<textId>` asset wins and
suppresses bleep, even when voice volume is zero; otherwise reveal bleep may
fallback through `ContentManifest.audio.dialogueBleep`.

```text
print.params.textId
  -> app-vn-runtime story step commit voice availability check
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
stay time. When that `app-vn-runtime` timer reaches zero, the runtime checks the
current voice gate: if a voice handle was successfully started and remains
audible, AUTO waits for `AudioHandle.finished` to resolve with `ended`, then
waits the runtime policy delay of 500ms before requesting the next StoryEngine
step.
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

Dialog text reveal is `app-vn-runtime` hosted transient presentation state driven by
`app-vn-dispatch` reveal helpers:

```text
emitted print + selectCurrentStoryLine()
  -> app-vn-runtime dialogRevealRuntime state
  -> visible text slice for GameInteractionShell
  -> VnDialogSurface text prop
```

The full line remains in `StoryRuntimeState.text.current`, backlog, save data,
and load summaries. `VnDialogSurface` does not own timers, reveal state,
choices, keyboard handlers, or manual advance controls; it only renders the text
it receives. Manual advance comes from the shell hit plane. While reveal is
active, manual advance completes the current line and returns; the following
advance is the one that enters StoryEngine. AUTO and one-shot `autoNext` use one
line budget from the print commit time: elapsed reveal time counts toward that
budget, but `app-vn-runtime` will not request the voice gate or StoryEngine
advance until reveal is complete. SKIP completes the active reveal immediately
and then continues on the skip schedule. A `print` committed while the dialog
surface is hidden stores a complete reveal state and does not gate advance.
Load, restore, reset, overlay close, and trial entry clear reveal state so
restored lines do not replay typewriter effects.
Reveal overlay state is scoped to the `print` step that created it; if a later
StoryEngine step changes the current line without emitting a new `print`, the
runtime clears the overlay so text mutations such as `@append` are not hidden
behind stale partial text.
Reveal lifecycle events (`reveal-start`, `reveal-tick`, `reveal-finish`) remain
`app-vn-runtime` presentation signals produced by shared reveal helpers.
Dialogue bleep uses reveal start/finish as a loop boundary only; completing or
instantly revealing a line does not synthesize catch-up `reveal-tick` events, so
bleep playback does not burst during manual completion, SKIP, or restore-like
paths.

Pixi presentation wait release is task-driven.
`createVnRuntimePresentationTransaction` returns Pixi wait descriptors,
`app-vn-runtime` stores them on
`StoryRuntimeState.presentationWait.expectedTasks`, and `onTasksChanged`
completion triggers `PRESENTATION_COMPLETE` followed by immediate StoryEngine
resume. `app-vn-runtime` timers are fallback diagnostics only, not the primary
Pixi wait release mechanism. UI presentation wait release is transition-driven:
`app-vn-runtime` advances `UiRuntimeState.surfaces` on the shared visual clock
and resumes when each target reaches the requested terminal visibility. Manual
advance during a wait settles the relevant Pixi or UI presentation to terminal
state and then resumes story flow.

## App Integration Boundary

App-specific VN composition is outside `VnRuntimeDispatcher` and outside the
shared runtime transaction. Game A and harness wiring for flow, save/load,
settings, overlay adapters, UI skin slots, debug entry points, and app-created
asset registries lives in `docs/architecture/app-vn-integration.md`.

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
