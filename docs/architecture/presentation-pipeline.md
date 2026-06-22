# Presentation Pipeline

## Responsibilities

- DOM/Radix/CSS Modules: dialog text, choices, menus, inventory, inspector, and
  accessibility-sensitive interactions.
- Pixi: VN backgrounds, single-layer portraits, filters, particles, transitions,
  camera-like 2D moves, debate text overlays, and truth-break effects.
- R3F: 3D map exploration, trial round table, 3D camera focus, interaction
  hotspots, and future GLB scene content.

## Command Model

Scripts use preset commands rather than renderer-specific instructions:

```nani
@charEnter hero slot:center effect:fadeIn
@shake actorId:hero intensity:0.4 duration:280
@flash color:#ffffff duration:160
@focus target:witness duration:500
@camera zoom:0.5 time:0.5
@trialKeyword id:kw-lie text:"the door was locked" speaker:character:felix
@gameplay grant-evidence id:evidence:keycard
```

The public script-to-runtime command bridge is `RuntimeCommand`. It is produced
by `nani-runtime-compiler` from parser IR before StoryEngine execution.
RuntimeCommand params use canonical runtime names; for example `shake`,
`flash`, and `focus` use `duration`. Pixi render hints may use renderer-local
`durationMs` internally, but routed Pixi consumption starts from
`RuntimeCommand`.

`.nani` command declarations live in `commandCatalog`. Naninovel official
commands and V-Ronpa project commands must be explicit catalog entries.

App fanout is handled by `createVnRuntimePresentationTransaction` and
`VnOutputRouteTable`. Route tables classify normalized
`RuntimeCommand.commandId` entries first, then command categories as fallback.

StoryEngine state stores story semantics only: script path, instruction pointer,
variables, backlog, pending choices, and end state. It returns the current
step's emitted runtime commands as an incremental stream. For Pixi, emitted
commands such as `back`, `charenter`, `shake`, `flash`, `focus`, and
`trialkeyword` are reduced into `PixiStageSnapshot` plus transient render hints
before React rendering. Saves store the snapshot and story/gameplay state, not
the runtime command stream or presenter trace.

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

`trial-keyword` is a visual anchor for overlays and subtitles. It may carry
debug metadata, but it is not the rule source for which evidence breaks which
statement. Debate rules, accepted evidence, and next-segment transitions live in
`TrialDefinition`.

## Pixi In Scope

First round:

- single-layer placeholder portraits
- background tint/plates
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

`.nani` can grant evidence through a typed gameplay event, but evidence
submission is not a script command. Submit actions originate from Trial UI,
flow through `trial-director`, and are resolved against `TrialDefinition`.
