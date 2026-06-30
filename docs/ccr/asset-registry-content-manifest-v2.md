# Contract Change Request

## Requested Change

Hard-cut `ContentManifest` to version 3 and make
`ContentManifest.runtimeAssets` the single runtime-loading authority. Add a pure
`@v-ronpa/asset-registry` package so apps can resolve declared asset ids and
inject structural resolvers into Pixi, R3F, media, and UI adapters.

## Affected Packages

- `packages/contracts`
- `packages/asset-registry`
- `packages/nani-runtime-compiler`
- `packages/pixi-presenter`
- `packages/r3f-adapter`
- `apps/game`

## Why Existing Contract Is Insufficient

Asset loading had drifted into multiple local conventions:

- media commands carried asset-like source refs but used a local resolver table
- Pixi portraits assembled public harness paths from `portrait:*`
- Pixi FX owned a package-local URL table outside the app manifest
- R3F map assets carried direct `uri` fields in `WorldMapDef.assetRefs`
- evidence asset ids existed but had no common resolution or validation gate

That made content review and missing-asset diagnostics inconsistent across
runtime surfaces.

## Proposed Shape

- `ContentManifest.version` is now `3`.
- `ContentManifest.runtimeAssets` declares every runtime-loadable asset.
- `AssetRef` is id-only: `{ id, kind, tags? }`.
- `WorldMapDef.assetRefs` and `RuntimeScript.assets` continue to declare
  dependencies but no longer contain URLs.
- UI skin asset bindings are outside the registry contract; apps may resolve
  app-local UI texture ids through their app-created registries.
- `CollisionProxy` may point at mesh-backed collision data through `assetId`.
- `RuntimeAsset.optimizedUri` remains the runtime file URL, but only manifest
  registration and generator output should author that URL.

## Runtime Ownership

- `packages/asset-registry` depends only on `packages/contracts`.
- Apps create registries from parsed content manifests.
- Renderer/media packages accept structural resolvers and emit diagnostics when
  resolution or loading fails.
- Missing assets keep visible fallback behavior and produce diagnostics; they
  must not silently fall back to guessed public paths.

## Compatibility And Migration

This is a breaking contract change. v1/v2 manifests and asset refs containing
`uri` are rejected by contract tests. Existing callers must migrate direct URLs
into `ContentManifest.runtimeAssets`, replace loader inputs with asset ids, and
move public UI binding metadata into app-local config when needed.

Rollback is straightforward but intentionally coarse: restore manifest v1 schema
support, reintroduce URL-bearing `AssetRef`, and remove the registry requirement
from adapters. No save-data migration is required because this change affects
content manifests and runtime loading, not `SaveData`.

## Fixtures And Tests

- Contract tests reject `uri` on `AssetRef`, `RuntimeScript.assets`, and
  `WorldMapDef.assetRefs`.
- Asset registry tests cover normal resolution for every runtime asset kind,
  duplicate ids, missing ids, kind mismatch, raw URI rejection, and unsupported
  manifest versions.
- Harness manifest tests parse the composed v3 manifest and validate references,
  including Pixi built-in FX assets.
- App/runtime adapter tests cover registry-backed media resolution and missing
  media diagnostics.
- `pnpm validate:assets` checks generated harness asset registration and source
  hardcoded path violations.
