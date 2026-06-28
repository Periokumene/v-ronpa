# Presentation Pipeline

## Responsibilities

- DOM/Radix/CSS Modules: dialog text, choices, menus, inventory, inspector, and
  accessibility-sensitive interactions.
- Pixi: VN backgrounds, single-layer portraits, filters, particles, transitions,
  camera-like 2D moves, debate text overlays, and truth-break effects.
- R3F: 3D map exploration, trial round table, 3D camera focus, interaction
  hotspots, and future GLB scene content.

Runtime visual and media assets do not belong to presenter packages. They are
declared in `ContentManifest.runtimeAssets`, resolved by an app-created
`AssetRegistry`, and passed into presenters through structural resolver props.
Pixi and R3F may load a URL only after the resolver returns it.

## Command Model

Scripts use preset commands rather than renderer-specific instructions:

```nani
@char idAndAppearance:hero.portrait:hero:neutral pos:50,0
@shake actorId:hero power:0.4 time:0.28
@flash color:#ffffff duration:160
@focus target:witness duration:500
@camera zoom:0.5 time:0.5
@trialKeyword id:kw-lie text:"the door was locked" speaker:character:felix
@gameplay grant-evidence id:evidence:keycard
```

The public script-to-runtime command bridge is `RuntimeCommand`. It is produced
by `nani-runtime-compiler` from parser IR before StoryEngine execution.
RuntimeCommand params use canonical runtime names; for example Naninovel
timing params are normalized to `durationMs` before Pixi consumption while
project-specific `flash` still accepts `duration`. `.nani` scene positions keep
Naninovel's `0..100` scene-percent syntax; `pixi-presenter` normalizes those
values to `0..1` only when reducing commands into `PixiStageSnapshot`.

`.nani` command declarations live in `commandCatalog`. Naninovel official
commands and V-Ronpa project commands must be explicit catalog entries. The
catalog also declares each command's execution boundary, so compiler and app
dispatch can distinguish StoryEngine control flow, Pixi presentation, gameplay
events, and declared-only compatibility commands.

App fanout is handled by `createVnRuntimePresentationTransaction` and
`VnOutputRouteTable`. Route tables classify normalized
`RuntimeCommand.commandId` entries first, then command categories as fallback.

StoryEngine state stores story semantics only: script path, instruction pointer,
variables, backlog, pending choices, and end state. It returns the current
step's emitted runtime commands as an incremental stream. For Pixi, emitted
commands such as `back`, `char`, `shake`, `flash`, `focus`, and
`trialkeyword` are reduced into `PixiStageSnapshot` plus transient render hints
before React rendering. Saves store the snapshot and story/gameplay state, not
the runtime command stream or presenter trace.

Asset ids inside these commands are semantic ids. For example,
`@back bg:harness` and `@char ... portrait:felix:neutral` write ids into the Pixi
snapshot; Pixi then asks the injected resolver for `background` or `portrait`
URLs. Scripts and reducers must not derive `/harness/...` paths from those ids.

Expression params such as `duration:{flashDuration}` are preserved by the
compiler, evaluated by StoryEngine against story variables, and should be
resolved before app adapters consume emitted runtime commands.
If a routed Pixi command reaches the reducer with missing or unsupported
Pixi-consumable params, the reducer returns a diagnostic no-op instead of
writing placeholder background, portrait, or keyword ids.

`story-play` sits above StoryEngine for playback control only. It decides when
manual, AUTO, SKIP, or one-shot `autoNext` should request the next StoryEngine
step and emits a pacing intent such as normal or skip. App adapters host the
actual browser timer and map skip pacing to presentation choices such as
disabled Pixi animation; renderer packages do not own AUTO/SKIP scheduling.
Voice-aware AUTO is also app adapter policy: after the `story-play` text minimum
timer fires, AUTO/`autoNext` may wait for the current `AudioHandle.finished`
result. Natural `ended` waits a fixed 500ms post-voice delay before advance;
`failed` releases any pending AUTO/`autoNext` advance without that delay; and
`stopped` only clears stale gates. This gate must not move into StoryEngine,
`story-play`, Pixi, or DOM rendering.

Pixi keeps a separate presentation clock inside `pixi-presenter`. Actor
transitions, transient effects, and screen/weather fades may run after the app
has synchronously committed the latest StoryEngine step. These active visual
lifecycles are tracked as Pixi-local `PresentationTask` snapshots and can be
reported to app debug UI through `onTasksChanged`.

For explicit Pixi `wait!`, StoryEngine stops with `presentationWait` and the app
matches that wait against the transaction's `expectedTasks`. Pixi task
completion is the primary resume source. A duration-based fallback exists only
to diagnose and settle stuck tasks. Manual continue during a wait performs
Complete On Continue: the app commits the terminal Pixi snapshot with animation
disabled, clears the wait through `PRESENTATION_COMPLETE`, and immediately
resumes to the next text, choice, end, or wait stop. Pixi task snapshots remain
unsaved renderer lifecycle data and must not be treated as durable story state.

Save/load persists the terminal `PixiStageSnapshot` only. Active
`PresentationTask` records, tween progress, transient render hints, and overlay
objects are not saved. Restoring or resetting renders the terminal snapshot with
animation disabled and clears the presenter task list.

`trial-keyword` is a visual anchor for overlays and subtitles. It may carry
debug metadata, but it is not the rule source for which evidence breaks which
statement. Debate rules, accepted evidence, and next-segment transitions live in
`TrialDefinition`.

## Pixi In Scope

First round:

- single-layer placeholder portraits loaded through `AssetResolver`
- manifest-backed background textures with visible fallback plates
- snapshot-driven VN stage rendering
- simple debate keyword overlay
- screenshot-friendly canvas state

Later:

- layered portraits
- expression state
- sprite sheets
- Spine or Live2D adapter
- custom filters and particle presets

## Mixing Pixi And R3F

Pixi is planned as an overlay presenter for VN and trial effects. R3F remains
the 3D world presenter. Shared WebGL context integration is a future
optimization; first baseline can use independent canvas layers as long as
presenter adapters render from committed runtime snapshots. Pixi reducers
consume routed RuntimeCommands directly and may produce Pixi-local render hints,
but StoryEngine does not emit presenter-specific logs.

R3F model refs are the same asset-id contract: `WorldMapDef.assetRefs` contains
id-only `AssetRef` entries, and the R3F adapter resolves the selected `glb` id
before probing or calling `useGLTF`.

## VN3D Versus Trial

`vn2d` and `vn3d` are not global modes. They are presentation profiles used
inside Navi or Trial flows.

`vn2d` is an overlay-heavy presentation profile: DOM owns text and choices,
Pixi owns foreground visual effects, and the 3D scene can remain passive in the
background.

`vn3d` is a 3D staged presentation profile: R3F owns the stage, camera focus,
character standees, and spatial composition; Pixi/DOM still provide subtitles,
effects, and interaction overlays.

`trial` is a gameplay mode that can contain VN-like discussion chapters and
3D camera staging, but it also owns trial-specific structure: discussion versus
debate segments, available truth bullets, breakable keywords, timeout/miss
outcomes, evidence submission branches, and special minigame transitions.

In other words, Trial may reuse the same staged `RuntimeCommand` visual cues
as `vn3d`, but it is not just `vn3d` with a different camera. Trial requires a
`TrialDefinition`, `TrialRuntimeState`, and `trial-director` logic on top of
story presentation.

The accepted vertical-slice harness enters Trial from an in-scene Navi
interactable using `start-trial`. The same scenario remains active; the app
switches from Navi staging to the Trial stage based on `GameMode` and the
current `TrialRuntimeState`.

See `docs/architecture/vn-runtime-dispatcher.md` for the app-layer route table.

## Evidence Ownership Boundary

Evidence display data is declared in the content manifest as `EvidenceDef`.
Evidence ownership is stored in `EvidenceState.ownedEvidenceIds`. Inventory
items remain limited to gifts and tools.

Evidence and UI visuals use texture asset ids (`thumbnailAssetId`,
`iconAssetId`, `UiAssetRef.assetId`). They are validated against
`ContentManifest.runtimeAssets` even when a current harness surface does not
render every image.

`.nani` can grant evidence through a typed gameplay event, but evidence
submission is not a script command. Submit actions originate from Trial UI,
flow through `trial-director`, and are resolved against `TrialDefinition`.
