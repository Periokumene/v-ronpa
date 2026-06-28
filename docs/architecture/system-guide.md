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
- `GameInteractionShell` in `apps/game` wires app adapters to title, overlay,
  VN toolbar, save/load, backlog, settings, and pause menu surfaces. It is app
  orchestration, not a gameplay director.
- `navi-director` owns Navi substates: `walk`, `interacting`, `vn2d-overlay`,
  `inventory`, and `event`.
- `trial-director` owns Trial segment flow, presentation profile selection,
  timeout handling, evidence submission outcomes, and segment transitions.
- `nani-runtime-compiler` owns `.nani` IR to `RuntimeScript` compilation,
  command normalization, canonical runtime params, expression preservation, and
  compiler diagnostics.
- `StoryEngine` owns script semantics, variables, backlog, choices,
  expression evaluation, serializable Story snapshots, and per-step
  `emittedRuntimeCommands`.
- `story-play` owns VN story playback control over StoryEngine: AUTO/SKIP mode,
  one-shot `autoNext` scheduling, pacing intent, and automation stop reasons.
  It is a pure playback state machine; browser timers and renderer commits stay
  in app adapters.
- `gameplay` owns domain reducers for exploration, inventory, evidence
  ownership, character state, and pure trial rule judgments.
- `media-save` owns Dexie IndexedDB save storage, Howler audio playback,
  `AudioHandle.finished` lifecycle reporting, HTMLVideo playback, and future
  WebAudio rhythm adapter notes.
- `contracts` owns RuntimeCommand and saveable runtime contracts; renderer-local
  hint and trace shapes stay in presenter packages.
- `asset-registry` owns id-to-runtime-asset lookup for parsed
  `ContentManifest` data. It depends only on `contracts`, validates manifests
  at runtime, diagnoses duplicate, missing, mismatched, or raw asset
  references, and does not load Pixi, Three, Howler, DOM, or files.
- `r3f-adapter` owns 3D scene presentation only.
- `pixi-presenter` owns 2D canvas/WebGL presentation only, including internal
  presenter traces used for adapter tests and inspection.
- `ui-kit` owns DOM overlays, text-heavy surfaces, controls, and Inspector Lite.
  Settings UI components stay pure and controlled; app adapters own settings
  state, persistence, and runtime derivation.

## Mode Model

The game has two primary playable modes:

- `navi`: first-person 3D exploration. Walk, interactables, inventory,
  character-state changes, event triggers, and foreground VN2D overlays are
  substates of Navi, not separate global modes.
- `trial`: 3D class-trial staging. Discussion, debate, evidence-submit, and
  future minigames are Trial segments. `vn2d`, `vn3d`, `debate3d`, and
  `minigame` are presentation profiles selected by the current Trial segment.

This prevents `VN2D` and `VN3D` from being treated as equivalent top-level game
modes. VN2D is an overlay-heavy presentation path; VN3D requires 3D camera
focus, staged character standees, Pixi/DOM overlays, and may participate in
Trial-specific input locks.

The title screen and pause/settings/save/load/backlog screens are shell or
overlay flow, not additional playable modes. They coordinate through
`GameInteractionContext`, `InteractionCapabilitySnapshot`, and `InputLockState`
so Navi and Trial can keep their director-owned runtime state independent from
DOM UI composition.

Settings are app-owned user preferences, not save data and not media-save
payloads. `packages/contracts` declares the versioned `SettingsSnapshot`;
`apps/game` owns the canonical settings adapter and localStorage persistence;
`ui-kit` renders controlled controls only. Runtime consumers receive narrow
derived values such as `StoryPlayTimingPolicy` and VN dialog display props
instead of the full settings snapshot.
Voice runtime settings follow the same pattern: the app derives locale and
volume from settings and passes only those narrow values to the runtime adapter.

See also:

- `docs/architecture/input-and-camera.md`
- `docs/architecture/asset-pipeline.md`

## Script To Presentation

`.nani` scripts compile to parser IR, then `nani-runtime-compiler` turns that IR
into `RuntimeScript`. StoryEngine consumes `RuntimeScript`, updates story state,
and emits the current step's non-control `RuntimeCommand` records.
RuntimeCommand params use canonical runtime names only; raw script aliases stay
in `sourceCommand`. Expressions are resolved by StoryEngine before emitted
commands reach app adapters.

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
  -> StoryEngine story state + emittedRuntimeCommands
  -> story-play playback state + pacing schedule
  -> VN runtime transaction + route table
  -> routed RuntimeCommand consumption
  -> app commit derives voice:<locale>:<textId> from emitted print textId
  -> AUTO/autoNext voice gate handles AudioHandle.finished ended/stopped/failed
  -> app-created AssetRegistry resolves media/Pixi/R3F/UI asset ids
  -> PixiStageSnapshot / PixiStageRenderHint / Pixi wait tasks / gameplay events / AudioPort voice playback
  -> VnRuntimeDispatcher renders DOM dialog and Pixi snapshot
```

Dialogue lines may include one `|#textId|` marker. The marker is parser
metadata, not visible text, and the current implementation uses it only for
auto voice lookup. Full localization, managed text files, and explicit voice
commands remain future tasks.

AUTO voice waiting is app policy, not script semantics. `story-play` computes
the minimum text stay time, while the app adapter waits for a successfully
started voice handle to report its terminal lifecycle. Natural `ended` adds
500ms before advancing; `failed` releases any pending AUTO/`autoNext` advance
without the post-voice delay; and explicit `stopped` only clears stale gates.
Manual advance and SKIP do not wait for voice; missing, muted, zero-volume, or
failed voice playback does not block automation.

For Pixi presentation commands, `wait!` is opt-in. StoryEngine creates a
presentation wait, app transaction code attaches Pixi expected task descriptors,
and Pixi task completion resumes the story. Manual continue during a wait
settles Pixi to the terminal snapshot before resuming; saved data still stores
only the terminal `PixiStageSnapshot`.

See also:

- `docs/nani/command-catalog.md`
- `docs/architecture/vn-runtime-dispatcher.md`

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
the app runtime adapter creates `TrialRuntimeState` and enters `GameMode`
`trial`. Trial entry must not be hidden inside `start-script` labels or separate
query-param scenarios.

## First-Round Thin Slices

- Parse labels, comments, commands, text, inline commands, choices, and jumps.
- Validate fixtures with Zod.
- Run a headless story reducer snapshot.
- Resolve trial keyword outcomes with evidence without putting segment flow in
  gameplay helpers.
- Render harness scenes for Navi walk/VN2D/inventory and Trial VN3D/debate.
- Capture Playwright smoke screenshots for visual evidence.
- Validate Trial graph references before subsystem fanout.
- Validate save data through a versioned migrator boundary.

## Non-Goals

- No production character art pipeline yet.
- No real GLB environments yet.
- No Langium implementation yet.
- No full rhythm/WebAudio gameplay yet.
- No complete visual novel editor yet.
