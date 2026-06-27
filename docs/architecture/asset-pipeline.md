# Content Asset Pipeline

## Intent

Runtime-loading assets are declared once in `ContentManifest.runtimeAssets`.
Scripts, maps, UI config, evidence, and renderer adapters may reference asset
ids, but must not carry raw file URLs or public paths.

`packages/asset-registry` is the pure lookup layer. Apps create an
`AssetRegistry` from a parsed `ContentManifest` and inject the structural
resolver into Pixi, R3F, media, and UI adapters.

The registry validates the manifest with the contracts schema before indexing.
Unsupported manifest versions, invalid manifests, duplicate runtime asset ids,
missing ids, kind mismatches, and raw URI-like refs are reported as
`AssetRegistryDiagnostic` entries. Registry diagnostics are runtime visibility
signals; the registry still does not fetch, preload, transform, or inspect
files.

## Runtime Assets

`RuntimeAsset` is the shipping asset shape:

- `id`: stable content id such as `bg:harness`, `Ema`, or
  `video:validation-intro`.
- `kind`: runtime family, including `character-pack`, `background`, `bgm`,
  `sfx`, `voice`, `video`, `glb`, `texture`, and `fx`.
- `sourceUri`: optional authoring source for traceability.
- `optimizedUri`: app-loadable file emitted by the asset pipeline.
- `format`: `json`, `glb`, `gltf`, `webp`, `png`, `ogg`, `mp4`, and related runtime
  formats.
- `compression`, `lods`, `textureBudget`, and `collisionProxyIds`: production
  metadata used by future build and review gates.

Only the registry reads `optimizedUri` for app runtime resolution. Renderer
packages receive a resolver and load the returned URL; they do not assemble
paths.

## Asset References

`AssetRef` is id-only: `{ id, kind, tags? }`. It appears in dependency lists
such as `RuntimeScript.assets` and `WorldMapDef.assetRefs`. These lists declare
what content a script or map needs, not where the file lives.

UI and evidence resources follow the same rule:

- `UiAssetRef.assetId` points to a `RuntimeAsset` of kind `texture`.
- `EvidenceVisual.iconAssetId` and `thumbnailAssetId` point to texture runtime
  assets.
- `CollisionProxy.assetId`, when used for mesh-backed collision data, points to
  a declared runtime asset. The current harness keeps collision as simple
  bounds and does not add mesh collision files.

## Generator And Validation

Harness assets use a convention-plus-override generator:

- `pnpm generate:assets` scans `apps/game/public/harness/**` and writes
  `apps/game/src/harness/generatedAssets.ts`.
- `pnpm validate:assets` dry-runs the generator, checks generated files exist,
  checks manifest references resolve through `AssetRegistry`, and rejects
  hardcoded runtime asset paths in source.

Generated asset files and the Pixi built-in FX manifest are allowed to contain
runtime URLs because they are asset registration sources. Runtime adapters,
scripts, and renderer systems must use asset ids and injected resolvers.

## App Composition

`apps/game/src/harness/contentManifest.ts` composes the vertical-slice manifest:

- generated harness assets from `harnessRuntimeAssets`
- Pixi built-in FX assets from `builtInPixiFxRuntimeAssets`
- maps, items, evidence, trials, and input fixtures

The vertical-slice app creates one `AssetRegistry` from this manifest and passes
it through adapter props:

- media commands resolve `bgm`, `sfx`, `voice`, and `video` ids before calling
  Howler or the HTML video port.
- Pixi resolves backgrounds, character-pack entry JSON, and FX ids before
  loading textures.
- Character-pack runtime assets point only to `character.json`. Pixi resolves
  that entry, loads sibling `layers.json` and `compositions.json`, then uses the
  pure layered-character resolver to determine the current active layers before
  fetching per-layer metadata and PNGs. Layer paths inside `layers.json` must be
  pack-relative paths; absolute URLs and parent-directory escapes are contract
  failures. Unused layer metadata is not a required dependency for the current
  render.
- R3F resolves `WorldMapDef.assetRefs` model ids before probing or loading
  glTF assets.
- UI/evidence image references are validated even when the current harness does
  not render every thumbnail.

Missing assets must produce diagnostics and keep the existing visible fallback.
They must not crash the app and must not fail silently.

## Collision Proxies

`CollisionProxy` covers `box`, `sphere`, `capsule`, `convex-mesh`, `trimesh`,
and `navmesh`. A `WorldMapDef` declares which proxies define walkable or
interactable space.

Navi first-person movement must be collision-ready before production maps are
added. Harness placeholders can still use simple geometry, but map definitions
must keep proxy references.
