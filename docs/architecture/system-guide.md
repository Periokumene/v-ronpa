# V-Ronpa System Guide

## Intent

This project starts with a contract and harness baseline. The goal is not to
ship production gameplay in the first milestone; it is to make every future
worktree branch depend on stable public contracts, shared fixtures, and clear
verification gates.

## Layering

```text
AGENTS.md
  -> durable repo rules and commands

docs/architecture/*
  -> system design, package ownership, gates, worktree flow

docs/templates/*
  -> reusable templates, not assigned work

docs/tasks/*
  -> concrete active or pending worktree task cards only

docs/archive/completed-tasks/*
  -> completed task records kept out of the active task queue

packages/contracts
  -> public schemas and semantic contracts

packages/asset-registry
  -> pure ContentManifest runtime asset lookup and diagnostics

adapters and apps
  -> rendering, persistence, media, and harness surfaces
```

## Runtime Boundaries

- `GameFlowMachine` owns shell flow state: `loading`, `title`, playable modes,
  overlay stack, and interaction capability policy.
- `GameInteractionShell` in `packages/app-vn-shell` wires app adapters to
  title, overlay, VN toolbar, save/load, backlog, settings, and pause menu
  surfaces. It derives narrow ViewModels, mounts Surface slots that receive
  `{ model, actions }`, and falls back per slot to the default preset when an
  app does not provide a custom Surface. App adapters provide overlay ViewModel
  inputs and app-specific actions; they do not render selected overlay Surface
  slots. It is app-layer orchestration, not a gameplay director, and must not
  absorb Story/reveal/AUTO/SKIP/voice/Pixi wait responsibilities from
  `app-vn-runtime` or `story-play`.
- `navi-director` owns Navi substates: `walk`, `interacting`, `vn2d-overlay`,
  `inventory`, and `event`.
- `trial-director` owns Trial segment flow, presentation profile selection,
  timeout handling, evidence submission outcomes, and segment transitions.
- `nani-runtime-compiler` owns `.nani` IR to `RuntimeScript` compilation,
  command normalization, canonical runtime params, expression preservation, and
  compiler diagnostics.
- `app-vn-session` owns headless VN entry boot from resolved source text:
  `parseScenario`, `compileRuntimeScript`, StoryEngine state, story-play state,
  choice/input/runtime-wait/presentation-wait helpers, and session-local
  restore snapshots. `app-vn-runtime` consumes its emitted `RuntimeCommand`
  batches and delegates fanout to `app-vn-dispatch`. Session never owns asset
  resolution, React effects, Pixi/R3F/DOM rendering, Howler/media handles,
  reveal/voice gates, browser timers, or save persistence.
- `app-vn-runtime` owns the reusable app-hosted VN runtime loop. It composes
  `app-vn-session` and `app-vn-dispatch`, resolves media through the
  app-created `AssetRegistry`, calls `media-save` `AudioPort` / `VideoPort`,
  manages dialog reveal timers, AUTO/SKIP scheduling, voice gates, movie
  overlay playback, Pixi `wait!` observation, runtime waits, restore cleanup,
  and shell-compatible runtime state. It must not understand Navi or Trial
  state.
- `StoryEngine` owns script semantics, variables, backlog, choices,
  expression evaluation, serializable Story snapshots, and per-step
  `emittedRuntimeCommands`.
- `story-play` owns VN story playback control over StoryEngine: AUTO/SKIP mode,
  one-shot `autoNext` scheduling, pacing intent, and automation stop reasons.
  It is a pure playback state machine; browser timers and VN runtime commits
  stay in `app-vn-runtime`.
- `app-vn-dispatch` owns headless VN RuntimeCommand fanout: the route table,
  presentation transaction, Pixi/media/UI reducers, dialog reveal pacing,
  dialog playback gate, and dialogue audio planner. `app-vn-runtime` owns VN
  timers, ports, asset resolution, live media handles, and React commits around
  those pure plans; app wrappers provide registry/settings/ports/config.
- App packages such as `apps/game-a` and `apps/game-harness` may wrap
  `app-vn-runtime` for entry selection, app flow, save policy, Navi/Trial glue,
  custom Surface skins, asset role resolution, and debug readouts. They must
  not reimplement the VN story loop or keep parallel browser
  timer/media/voice/reveal authorities.
- `gameplay` owns domain reducers for exploration, inventory, evidence
  ownership, character state, and pure trial rule judgments.
- `media-save` owns the shared Dexie IndexedDB save port, split slot/payload/
  preview storage, v5 save parsing, save-slot summary normalization through the
  contracts helper, quick/manual slot policy helpers, thumbnail capture
  defaults, Howler audio playback, `AudioHandle.finished` lifecycle reporting,
  HTMLVideo playback, and future WebAudio rhythm adapter notes. `app-vn-shell`
  owns the shared save-slot controller; app save adapters provide collect/
  restore/preview-capture/flow glue only.
- `contracts` owns RuntimeCommand and saveable runtime contracts, including
  strict `SaveData` v5. VN story and VN Pixi stage state are only valid under
  `SaveData.vn`; renderer-local hint and trace shapes stay in presenter
  packages.
- `asset-registry` owns id-to-runtime-asset lookup for parsed
  `ContentManifest` data. It depends only on `contracts`, validates manifests
  at runtime, diagnoses duplicate, missing, mismatched, or raw asset
  references, and does not load Pixi, Three, Howler, DOM, or files.
- `r3f-adapter` owns 3D scene presentation only.
- `pixi-presenter` owns 2D canvas/WebGL presentation only, including internal
  presenter traces used for adapter tests and inspection. It also owns
  layout-only relayout for Pixi display objects when the Pixi host/canvas
  changes size; resize relayout updates canvas-internal geometry, masks, sprite
  cover-fit, filter areas, and shader resolution without replaying runtime
  commands or clearing active presentation tasks.
- `ui-kit` owns DOM overlays, text-heavy surfaces, controls, and Inspector Lite.
  Settings UI components stay pure and controlled; app adapters own settings
  state, persistence, and runtime derivation. Reusable `ui-kit` components do
  not read full runtime/flow objects, app paths, or `AssetRegistry`; VM-bound
  shell defaults are composed at the `app-vn-shell` boundary.

## Mode Model

The game has three primary playable modes:

- `vn`: visual novel story playback. It owns StoryEngine session state,
  story-play AUTO/SKIP intent, VN entry selection, and VN2D/VN3D presentation
  profile selection through app-layer VN packages.
- `navi`: first-person 3D exploration. Walk, interactables, inventory,
  character-state changes, event triggers, and foreground VN2D overlays are
  substates of Navi, not separate global modes.
- `trial`: 3D class-trial staging. Discussion, debate, evidence-submit, and
  future minigames are Trial segments. `vn2d`, `vn3d`, `debate3d`, and
  `minigame` are presentation profiles selected by the current Trial segment.

This prevents `VN2D` and `VN3D` from becoming parallel top-level game modes.
They are presentation profiles under VN, or overlay/profile paths used by Navi
and Trial when those modes temporarily host story presentation. VN2D is an
overlay-heavy presentation path; VN3D requires 3D camera focus, staged
character standees, Pixi/DOM overlays, and may participate in Trial-specific
input locks.

The title screen and pause/settings/save/load/backlog screens are shell or
overlay flow, not additional playable modes. They coordinate through
`GameInteractionContext`, `InteractionCapabilitySnapshot`, and `InputLockState`
so Navi and Trial can keep their director-owned runtime state independent from
DOM UI composition.

Settings are app-owned user preferences, not save data and not media-save
payloads. `packages/contracts` declares the versioned `SettingsSnapshot`;
`packages/app-vn-shell` exports the reusable settings adapter and browser
storage boundary; apps mount it and remain responsible for app-specific runtime
data. `ui-kit` renders controlled controls only. Runtime consumers receive
narrow derived values such as `StoryPlayTimingPolicy`, VN dialog display props,
and dialog reveal text speed instead of the full settings snapshot.
Voice runtime settings follow the same pattern: the app derives locale and
volume from settings and passes only those narrow values to the runtime adapter.

See also:

- `docs/architecture/input-and-camera.md`
- `docs/architecture/asset-pipeline.md`
- `docs/architecture/app-vn-integration.md`

## Script To Presentation

`.nani` scripts compile to parser IR, then `nani-runtime-compiler` turns that IR
into `RuntimeScript`. StoryEngine consumes `RuntimeScript`, updates story state,
and emits the current step's non-control `RuntimeCommand` records.
RuntimeCommand params use canonical runtime names only; raw script aliases stay
in `sourceCommand`. Expressions are resolved by StoryEngine before emitted
commands reach `app-vn-dispatch` planning and `app-vn-runtime` commit.

Command declarations live in the contracts `commandCatalog`. The catalog stores
Naninovel canonical names, lowercase runtime ids, categories, parameter specs,
children support, implementation status, command source, and execution
boundary. The compiler derives validation, primary/param binding, and
normalization from it.

Story scripts can emit gameplay runtime commands, for example
`@gameplay grant-evidence id:evidence:keycard`. These events can update
saveable gameplay state, but they do not submit evidence during Trial. Evidence
submission remains a Trial UI action routed through `trial-director`.

```text
.nani source
  -> nani-parser AST/IR
  -> nani-runtime-compiler RuntimeScript / RuntimeCommand
  -> app-vn-session boot/step wrapper
  -> StoryEngine story state + emittedRuntimeCommands
  -> story-play playback state + pacing schedule
  -> app-vn-dispatch VN runtime transaction + route table
  -> app-vn-runtime routed RuntimeCommand consumption
  -> app-vn-runtime uses app-vn-dispatch planners for dialogue audio/reveal gates
  -> app-vn-runtime AUTO/autoNext voice gate handles AudioHandle.finished ended/stopped/failed
  -> app-created AssetRegistry resolves media/Pixi/R3F/UI asset ids and app-owned UI asset roles
  -> PixiStageSnapshot / PixiStageRenderHint / Pixi wait tasks / gameplay events / AudioPort voice or bleep playback
  -> VnRuntimeDispatcher renders the Pixi snapshot
  -> GameInteractionShell creates ViewModels and renders DOM Surface slots
```

Dialogue lines may include one `|#textId|` marker. The marker is parser
metadata, not visible text. `app-vn-runtime` uses it with app-derived voice
settings as dialogue audio identity: a resolvable `voice:<locale>:<textId>`
asset wins and suppresses dialogue bleep, while a missing planned voice asset
can fall back to configured reveal bleep. Full localization, managed text
files, and explicit voice commands remain future tasks.

AUTO voice waiting is `app-vn-runtime` policy, not script semantics.
`story-play` computes the minimum text stay time, while `app-vn-runtime` waits
for a successfully started voice handle to report its terminal lifecycle.
Natural `ended` adds 500ms before advancing; `failed` releases any pending
AUTO/`autoNext` advance without the post-voice delay; and explicit `stopped`
only clears stale gates. Manual advance and SKIP do not wait for voice; missing,
muted, zero-volume, or failed voice playback does not block automation. Dialogue
bleep never installs or releases the AUTO voice gate.

For Pixi presentation commands, `wait!` is opt-in. StoryEngine creates a
presentation wait, `app-vn-dispatch` transaction code returns Pixi wait
descriptors, and `app-vn-runtime` stores/observes them until Pixi task
completion resumes the story. Manual continue during a wait settles Pixi to the
terminal snapshot before resuming; saved data still stores only the terminal
`PixiStageSnapshot`.

See also:

- `docs/nani/command-catalog.md`
- `docs/architecture/vn-runtime-dispatcher.md`
- `docs/architecture/app-vn-integration.md`

## Evidence And Trial Rules

Evidence is not an inventory item. Gifts and tools live in `ItemDef` and
`InventoryState.items`; case evidence lives in `EvidenceDef` and
`EvidenceState.ownedEvidenceIds`.

`TrialDefinition` owns the rule graph: debate truth bullets, breakable
keywords, accepted evidence, timeout/miss/correct branches, evidence-submit
branches, and minigame transitions. `.nani` scripts provide the narrative and
visual timing for those segments, while TrialDirector applies graph transitions
after Gameplay returns pure rule judgments.

Exploration enters Trial through the director-owned `InteractableDef.action`
variant `start-trial`. Navi remains authoritative for focus and confirmation;
harness/app flow glue creates `TrialRuntimeState` and enters `GameMode`
`trial`. Trial entry must not be hidden inside `start-script` labels or
separate query-param scenarios.

## Integrated Harness Showcase Baseline

`apps/game-harness` is the accepted integrated harness-showcase baseline. It
boots the showcase from `/` and composes shared VN runtime, Navi, Trial, Pixi,
R3F, media, save/load, settings, pause/menu, debug readouts, and smoke controls
in one game-shaped harness. The harness adapter is intentionally a thin app
glue layer: VN reveal/audio/movie/wait/restore behavior lives in
`packages/app-vn-runtime`; Navi/Trial/R3F app glue, showcase fixtures, and
debug readouts remain in the harness app while shared director/runtime/presenter
behavior remains in packages.

The harness-owned integration fixtures live in `contentManifest`,
`generatedAssets`, `inputActions`, `showcase/*`,
`scenarios/harness-showcase`, and `useFirstPersonExplorationBridge`. They are
not independent registry entries, subsystem slices, or a legacy slice scenario
set.

The baseline validates parser/compiler behavior, StoryEngine snapshots,
story-play pacing, gameplay outcomes, Navi and Trial director flow, Pixi/R3F
presentation, runtime asset resolution, save data migration boundaries, and
Playwright smoke evidence against the integrated harness and `game-a` VN path.

## Non-Goals

- No production character art pipeline yet.
- No real GLB environments yet.
- No Langium implementation yet.
- No full rhythm/WebAudio gameplay yet.
- No complete visual novel editor yet.
