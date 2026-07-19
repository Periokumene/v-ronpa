# Runtime Asset Pipeline

Each app owns a declarative `asset.config.mjs`. Its ordered `scripts` list is the
only production catalog-membership authority. Generation scans public assets,
compiles and links every configured `.nani`, emits `sourcesByPath`, stable
semantic SHA-256 revisions, per-script asset refs and character plans, and
records selected runtime providers. Unknown endpoints, labels, duplicate paths,
and unsupported endpoint forms fail generation.
`nani-runtime-compiler` owns the canonical semantic byte serialization. It
includes script path, labels, commands, and command semantics while excluding
source text and source locations. Asset generation hashes those bytes with
Node SHA-256; browser inspection hashes the same bytes with Web Crypto. Golden
tests require byte-for-byte and digest parity, so generated metadata, source
updates, materialization, save identity, and caches cannot invent separate
revision rules.

Every config also declares one `entry` locator (`id`, `initialScriptPath`, and
optional `startLabel`). Named `testCatalogs` each own an independent entry
locator and ordered script list. Generation emits entry locators, ordered
catalogs, source indexes, metadata, and preload plans for production and for
each test catalog. Product manifests import only the product exports, while
dedicated test-mode entry modules select a named test catalog. There is no per-entry
`testOnly` marker. The production bundle scan rejects test script paths and
therefore also guards this tree-shaking boundary.

`RuntimeAssetFragment` is the only provider protocol. A `runtime-assets-*`
package may contribute stable IDs, runtime assets, optional fonts, and source
identity. It must not create a manifest, registry, resolver, loader, or alternate
validator. It may depend only on contracts and asset-registry.

`runtime-assets-pixi` is the first provider. Apps select `providers: ["pixi"]`;
generated modules expose its fragment. `composeContentManifest()` combines
generated assets, provider fragments, and explicit UI/preload/optional refs.
Every duplicate ID fails; nothing silently overrides another source. The result
is parsed by `ContentManifestSchema` and creates exactly one AssetRegistry.

Future `runtime-assets-r3f`-style packages must reuse this protocol, composition,
diagnostics, conformance test, and boundary gate.

`pnpm generate:assets` updates generated modules. `pnpm validate:assets` checks
generated freshness, files, fonts, character packs, provider refs, final
manifests, and final registries.

## Layered character production and promotion

The canonical character path is:

```text
.clip
  -> CSP archive and temporary PSD conversion
  -> authoring-tree validation
  -> cropped leaf composition
  -> immutable character-pack run and QA
  -> reviewed whole-directory promotion
  -> generate/validate assets
  -> ContentManifest and AssetRegistry + generated entry preload plan
  -> Pixi stage readiness (fetch, decode, GPU upload)
  -> synchronous @char expression
  -> persistent final-character Filter
```

The CSP workspace and run outputs remain tool-owned. Promotion is deliberately manual. The accepted character directory
must be mirrored exactly into the app target, deleting target files that are absent from the run; merging with `cp -R` is
forbidden because it preserves stale pack content. After promotion, run `pnpm generate:assets` and
`pnpm validate:assets`. There is no promotion compatibility layer, conversion step, or alternate character registry.

`pnpm validate:assets` and the CSP pack validator both call the layered-character source-pixel resolver. For every metadata
layer it derives `unitsPerPixel = abs(localTransform.scale.x) / pixelsPerUnit`, requires square non-zero pixels, and
requires one pack-wide value within relative error `1e-6`. Alice currently resolves to `1`; Ema resolves to `0.006`.
Density is not duplicated in `character.json`.

## Catalog-scoped layered-character preparation

The pure layered-character model derives one `VnPixiCharacterPreparationPlan` from each compiled RuntimeScript; asset
generation and the Game A DEV content decorator call the same layered-character projection. It collects explicit
`@char` character IDs, the default expression `""`, expression changes from `@char` and `@slide`, and applies wildcard
expressions to every explicit character in the script. IDs and expressions are deduplicated and stably sorted. The plan is
stored only in generated script metadata beside `scriptRevision` and `assetRefs`; it is not copied into ContentManifest,
hand-written app configuration, `.nani`, or a character pack.

One app-owned story definition pairs the entry, runtime catalog, and plans by
script path. A verified DEV source candidate replaces one catalog record and its
derived plan as one value. The canonical Pixi host mounts while the
title or Navi surface is still active. Presenter mount loads and validates only referenced layers, deduplicates shared pack,
metadata, and Texture work, and calls `renderer.prepare.upload()` for every unique successful Texture. Its stage handle
becomes ready only after those uploads settle. Story-session changes do not remount this presenter or discard its WebGL
context. Later scripts call the same presenter's idempotent
`prepareCharacters(plan)`; changing a catalog record or plan never remounts the
canvas. Prepared and in-flight expressions, textures, and GPU uploads are
deduplicated.

Game A opening currently prepares 16 layers (about 0.09 MiB compressed and 1.18 MiB decoded). Harness showcase prepares 15
layers (about 2.51 MiB compressed and 29.37 MiB decoded). Preparing the full Ema pack would decode about 111.79 MiB and is
forbidden as a shared policy.

`app-vn-shell` owns `usePixiVnScriptPreparation()`, the shared adapter used by
new-game, cross-script navigation, Devtools Preview, and restore. It waits on the
stage handle, selects the target script plan, and adds expressions still visible in the saved Pixi
snapshot. Preparation returns a Result; failure leaves Story/Pixi/UI/media and
the instruction pointer unchanged, while harmless resource-cache work may remain. Runtime
requests outside the plan emit `asset-unprepared-character-expression`, switch synchronously to empty, and never initiate a
background load, retry, compatibility lookup, or best-effort unoutlined fallback.

## Pixi final-character outline and token transitions

Outline enablement is a required app-owned boolean passed through the canonical VN Pixi host. Game A and Harness currently
pass `true` explicitly. A future Game-A-only policy changes only the Harness value to `false`; shared code has no default.

Each actor owns one persistent `final-character-root`. Stable rendering contains one ordinary layer composition. A visible
expression change temporarily holds only outgoing and incoming compositions beneath that root and crossfades them for the
effective `@char` duration: 120 ms when `time` is omitted, or the explicitly declared value. The presentation task is
created only after both compositions and their first-frame alphas exist. The
root attaches one transition-only isolation Filter before the clock starts. A rapid replacement settles the previous
transition to its target before starting the next one. Initial appearance and hide/show use the same presentation-owned
opacity channel rather than attenuating the outline Filter input.

For an enabled actor, every active complete composition owns one WebGL Filter. The Filter sees the composition at full
coverage, samples the center plus eight neighbor positions, and produces the colored character and white shell atomically.
Neighbor alpha is the source-over union `1 - Π(1-aᵢ)` and white outer alpha is
`neighborAlpha × (1-centerAlpha)`. Only after that calculation does the shader multiply the premultiplied result by
`uOpacity`. `uOpacity` combines actor alpha with the outgoing/incoming transition weight, so animation opacity can never be
misread as texture coverage and cannot create a white interior fade.

Weighted final compositions are not combined with ordinary source-over. That operation would reduce two perfectly aligned
opaque branches to alpha `1-t(1-t)`, or `0.75` at the transition midpoint, and produce the observed semi-transparent pulse.
Instead, the outgoing Filter writes with premultiplied `normal` and the incoming Filter writes with premultiplied `add`
inside the root's transparent isolation target. The isolated result is therefore exactly
`(1-t) × outgoing + t × incoming`, then returns to the actor scene with `normal`. Direct additive blending against the
background is forbidden.

The source step is `unitsPerPixel × stageScale`; each composition's global linear transform converts its X/Y vectors to
Filter input UVs. This preserves one original sprite texel through viewport resize, actor scale, and rotation. Padding is
derived from the transformed diagonal extent plus one antialias pixel. Filter instances keep their own transform and opacity
uniforms while sharing one `GlProgram`.

Steady-state enabled structure is `L + 1 filter`; token transitions are at most `2L + 2 final filters + 1 isolation filter`
for the declared transition only. The isolation Filter is lazily reused per actor, detached outside transitions, and
destroyed with the presentation; its filter target is pooled and limited to character screen bounds. The outgoing Filter is
destroyed when the transition settles, without destroying Assets-owned textures. The disabled path uses the same
prepared-resource, opacity scheduler, and isolated crossfade. It temporarily attaches lightweight whole-composition opacity
Filters so internal layers are finalized before weighting, and returns to a filter-free stable state when actor opacity is
`1`.

The following alternatives are intentionally forbidden:

- per-Sprite outline filters, which expose white seams between body, face, arms, and other overlapping layers;
- eight shifted full-character copies or an independently renderable white silhouette branch;
- one Filter over already crossfaded RGBA, because flattened alpha cannot distinguish source coverage from outgoing/incoming
  animation opacity and therefore fills a fading character interior with white;
- ordinary source-over between weighted complete compositions, because shared opaque coverage falls to `0.75` at midpoint;
- direct additive branch blending against the actor scene, because it also adds character color to the background;
- source-sized `RenderTexture.create` or `generateTexture`, which makes large packs such as Ema exceed the intended memory
  envelope;
- invalid-pack fallback to an unoutlined character. Invalid non-empty packs emit
  `asset-invalid-character-source-pixel-scale` and render the existing empty-character state.

Actor alpha is applied by each final composition Filter after outline generation; blur, bokeh, and screen effects continue
to wrap the isolated completed actor. Neither the outline nor transition isolation Filter is added to the viewport-wide
actor filter stack. Each composition destroys its Filter, while cached source textures remain Assets-owned. The
implementation supplies GLSL for the existing WebGL path only; WebGPU migration must be coordinated with the other Pixi
effects rather than adding an outline-only renderer fork.
