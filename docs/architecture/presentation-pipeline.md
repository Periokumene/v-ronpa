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
@shake target:hero intensity:0.4 duration:280
@flash color:#ffffff duration:160
@focus target:witness duration:500
@cameraFocus character:felix framing:close duration:500
@trialKeyword id:kw-lie text:"the door was locked" evidence:evidence:keycard
```

The public contract is `PresentationCommand` and `PresentationPerform`; Pixi,
DOM, R3F, or a future presenter can interpret those commands.

Story scripts emit `StoryEffect` bridge records. A presentation effect wraps a
`PresentationCommand`; Trial, Navi, gameplay, and media effects keep their own
typed channel names so directors can consume them without coupling to parser
internals.

## Pixi In Scope

First round:

- single-layer placeholder portraits
- background tint/plates
- command log rendering
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
optimization; first baseline can use independent canvas layers as long as the
public `PresenterPort` is stable.

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

In other words, Trial may reuse the same 3D staging and presentation commands
as `vn3d`, but it is not just `vn3d` with a different camera. Trial requires a
`TrialDefinition`, `TrialRuntimeState`, and `trial-director` logic on top of
story presentation.
