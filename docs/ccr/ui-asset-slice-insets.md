# CCR: UI Asset Slice Insets

## Summary

Add optional `sliceInsets` metadata to `UiAssetRef` so app-owned UI surfaces can
use manifest-registered frame textures as nine-slice assets without embedding
renderer or filesystem details in UI code.

## Contract Changes

- `UiAssetRef` gains optional `sliceInsets`.
- The field stores numeric `{ top, right, bottom, left }` inset values.
- `sliceInsets` is valid only when `slice` is `"nine-slice"`.
- Existing `UiAssetRef` values remain valid because the field is optional.

## Runtime Ownership

- `packages/contracts` declares the metadata shape.
- Apps and UI surfaces may interpret the metadata while resolving texture ids
  through an app-created `AssetRegistry`.
- `UiAssetRef` still carries only asset ids; direct URLs, React components,
  Pixi objects, and renderer instances remain outside contracts.

## Tests

- Contract tests cover parsing `sliceInsets` on a nine-slice UI asset and
  rejecting it on non-nine-slice assets.
- Asset-registry reference validation continues to validate only the referenced
  texture asset id.
