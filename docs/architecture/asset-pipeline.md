# Runtime Asset Pipeline

Each app owns a declarative `asset.config.mjs`. Generation scans its public
assets, compiles configured `.nani` entries, emits stable semantic SHA-256 script
revisions, derives script asset refs, and records selected runtime providers.

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
  -> ContentManifest and AssetRegistry
  -> @char expression
  -> Pixi CharacterSystem
```

The CSP workspace and run outputs remain tool-owned. Promotion is deliberately manual. The accepted character directory
must be mirrored exactly into the app target, deleting target files that are absent from the run; merging with `cp -R` is
forbidden because it preserves stale pack content. After promotion, run `pnpm generate:assets` and
`pnpm validate:assets`. There is no promotion compatibility layer, conversion step, or alternate character registry.

`pnpm validate:assets` and the CSP pack validator both call the layered-character source-pixel resolver. For every metadata
layer it derives `unitsPerPixel = abs(localTransform.scale.x) / pixelsPerUnit`, requires square non-zero pixels, and
requires one pack-wide value within relative error `1e-6`. Alice currently resolves to `1`; Ema resolves to `0.006`.
Density is not duplicated in `character.json`.

## Pixi final-character outline

Outline enablement is a required app-owned boolean passed through the canonical VN Pixi host. Game A and Harness currently
pass `true` explicitly. A future Game-A-only policy changes only the Harness value to `false`; shared code has no default.

For an enabled actor, `CharacterSystem` creates the active layer composition once as a construction recipe. It instantiates
that same recipe at the eight neighboring source-pixel offsets, places all eight copies in one outline group, converts the
group's final alpha to opaque white with one `ColorMatrixFilter`, and draws the original composition above it. Viewport and
actor transforms apply outside this structure, so the offset remains one original sprite texel after browser scaling.

The following alternatives are intentionally forbidden:

- per-Sprite outline filters, which expose white seams between body, face, arms, and other overlapping layers;
- source-sized `RenderTexture.create` or `generateTexture`, which makes large packs such as Ema exceed the intended memory
  envelope;
- invalid-pack fallback to an unoutlined character. Invalid non-empty packs emit
  `asset-invalid-character-source-pixel-scale` and render the existing empty-character state.

Actor alpha, transition, blur, bokeh, and screen effects continue to wrap the completed outlined actor. The outline filter
is not added to the viewport-wide actor filter stack, and cached source textures remain Asset-owned.
