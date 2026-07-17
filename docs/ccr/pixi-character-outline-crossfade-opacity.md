# Contract Change Request

> Superseded in part by [`pixi-character-crossfade-compositing.md`](./pixi-character-crossfade-compositing.md). The
> per-composition coverage/outline rule remains current; branch combination and disabled-transition topology are replaced by
> isolated premultiplied mixing.

## Requested Change

Move layered-character transition and actor opacity after final-composition outline generation. Each active complete
composition owns its own Filter instance, and the Filter applies a final output opacity after combining the source color and
one-source-texel white shell.

This request supersedes only the Filter placement and crossfade-alpha sections of
[`pixi-character-preload-readiness.md`](./pixi-character-preload-readiness.md). Entry preload, stage readiness, synchronous
instantiation, strict plan misses, and transaction-scoped settlement remain current.

## Affected Packages

- `packages/pixi-presenter`
- Pixi rendering tests and Game A visual smoke

`packages/contracts`, `.nani` IR, generated preload metadata, saves, ContentManifest, AssetRegistry, character packs,
dependencies, and app host interfaces are unchanged.

## Why Existing Semantics Are Insufficient

The previous topology crossfaded outgoing and incoming composition alpha below one final Filter. The Filter's eight-neighbor
formula correctly treats input alpha as source coverage, but animation alpha is not coverage. For a uniformly faded source
with alpha `0.5`, the neighbor union is approximately `0.996`; the old shader consequently added approximately `0.498`
white alpha throughout the character interior. The result was a white or desaturated outgoing figure fading away even
though the earlier independent-white-frame race had been removed.

Once outgoing and incoming are flattened to one RGBA input, a shader cannot recover their original coverage and independent
animation weights. Thresholds, normalization, and best-effort mask reconstruction are therefore not valid fixes.

## Runtime Semantics

- Stable state contains one complete layer composition and one outline Filter instance.
- A token crossfade temporarily contains outgoing and incoming complete compositions, each with its own Filter instance.
- Both Filter instances share one `GlProgram` but own transform and opacity uniforms.
- The outline calculation receives full-coverage composition RGBA. Its premultiplied final color is multiplied by
  `uOpacity` only after the center color and white outer alpha have been combined.
- `uOpacity` is the product of actor alpha and the composition's transition weight. Pixi container alpha remains `1` on the
  outlined path so inherited group alpha cannot contaminate Filter input coverage.
- On settlement, the outgoing composition and its Filter are destroyed. Assets-owned source textures are never destroyed.
- Historical behavior when outline was disabled targeted ordinary root/composition alpha with no Filter. This bullet is
  superseded by the isolated whole-composition opacity passes in
  [`pixi-character-crossfade-compositing.md`](./pixi-character-crossfade-compositing.md).
- Rapid replacement, skip, synchronous settlement, clear, and destroy retain the existing transaction semantics.

No independently renderable silhouette, per-Sprite outline, source-sized RenderTexture, compatibility path, or runtime
fallback is introduced.

## Fixtures And Tests

- Presenter tests assert that Filter input containers remain alpha `1`, transition and actor opacity reach the Filter output
  uniform, stable state has one Filter, transition state has two Filter instances sharing one program, and outgoing cleanup
  destroys only its Filter.
- Shader-source assertions lock output multiplication after outline composition.
- Browser smoke captures transition checkpoints and rejects a white-only character interior while retaining the final
  one-source-pixel outline.

## Rebase Impact

Branches touching `CharacterPresentation` must not tween outlined composition `Container.alpha`. The historical prohibition
on every `final-character-root` Filter is superseded: the transition-only isolation Filter defined by
[`pixi-character-crossfade-compositing.md`](./pixi-character-crossfade-compositing.md) is required, while steady-state root
filters and outline reconstruction over flattened crossfade RGBA remain forbidden. Existing preload-plan and stage-readiness
wiring should be retained unchanged.
