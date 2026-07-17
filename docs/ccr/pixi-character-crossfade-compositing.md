# Contract Change Request

## Requested Change

Define layered-character token crossfade as isolated premultiplied-RGBA interpolation rather than ordinary source-over
composition of two partially opaque siblings.

This request supersedes only the branch-combination and disabled-transition topology in
[`pixi-character-outline-crossfade-opacity.md`](./pixi-character-outline-crossfade-opacity.md). Full-coverage per-composition
outline generation, final-output opacity, preload readiness, synchronous instantiation, strict plan misses, and
transaction-scoped settlement remain current.

## Affected Packages

- `packages/pixi-presenter`
- Pixi rendering tests and Game A visual smoke

`packages/contracts`, `.nani` IR, generated metadata, app interfaces, saves, ContentManifest, AssetRegistry, character packs,
dependencies, and source textures are unchanged.

## Why Existing Semantics Are Insufficient

Outgoing and incoming complete compositions currently emit premultiplied results weighted `1-t` and `t`, but later siblings
are still combined with ordinary source-over. For a shared opaque pixel this yields:

```text
alpha = t + (1-t)(1-t) = 1-t(1-t)
```

The midpoint alpha is `0.75`, even when Texture identity, layer metadata, and world transforms are exact. Changed eyes,
mouths, arms, and silhouettes create different edge coverage, making the global opacity dip appear as a positional wobble.
Changing anchors, easing, or metadata cannot repair the blend equation.

## Runtime Semantics

- Stable enabled state remains one complete composition with one outline Filter and no root isolation pass.
- During a token transition, outgoing and incoming each remain independent final RGBA outputs. Their final Filter opacity is
  `actorAlpha × (1-t)` and `actorAlpha × t`.
- The persistent `final-character-root` temporarily attaches one passthrough Filter. Pixi therefore renders its children into
  a transparent, pooled screen-bounds target before returning one result to the actor scene.
- The outgoing final Filter uses premultiplied `normal`; the incoming final Filter uses premultiplied `add`. Inside the
  transparent isolation target this produces exact `(1-t) × outgoing + t × incoming`. The isolation Filter itself returns
  the result with `normal`, so character color is never added directly to the background.
- Isolation padding is the maximum active branch padding, preserving the one-source-texel shell at transition bounds.
- The isolation Filter is allocated lazily, reused by rapid and later transitions, detached in stable state, and destroyed
  with the presentation. Pixi owns and pools transient screen-bounds filter targets; the character path does not create a
  source-sized RenderTexture.
- When outline is disabled, transition branches receive lightweight final-opacity Filters so each multi-Sprite composition
  is flattened before weighting. A stable disabled composition at opacity `1` has no Filter; actor fades retain the opacity
  Filter only while it is needed.
- Settlement resets the incoming branch to `normal`, detaches isolation, destroys outgoing branch resources, and preserves
  Assets-owned Texture ownership.

Direct `add` against the stage, ordinary source-over crossfade, per-layer opacity mixing, source-sized RenderTexture,
layer-diff transitions, compatibility paths, and best-effort fallback are not valid implementations.

## Fixtures And Tests

- Presenter tests assert root isolation topology, branch blend modes, exact five-point alpha behavior, shared Texture/world
  matrix alignment, disabled-outline finalization, isolation reuse, settlement, and one-time destruction.
- Existing preload, invalid-pack, source-texel transform, skip, rapid replacement, and texture-ownership regressions remain.
- Game A smoke verifies preparation, diagnostics, stable colored interior samples, final outlines, and multilayer endpoints.

## Rebase Impact

Branches touching `CharacterPresentation` must retain per-composition final coverage Filters and must not restore ordinary
source-over between weighted branches. A root Filter is valid only as the transition-time isolation boundary described here;
it must be detached in steady state and must not perform outline reconstruction over flattened crossfade alpha.
