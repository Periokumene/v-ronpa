# CCR: Remove Public UI Asset Bindings

## Summary

Remove the public UI asset binding concept from shared contracts. `ContentManifest`
moves to version 3, `ContentManifest.uiAssets` is removed, and the `UiAssetRef`
family is no longer exported. UI skin bindings remain app-local until a complete
shared renderer is introduced by a future CCR.

## Contract Changes

- `ContentManifest.version` is now `3`.
- `ContentManifest.uiAssets` is removed and old manifests carrying it are rejected
  by strict schema parsing.
- `UiAssetRole`, `UiAssetRef`, `InteractionStyleProfile`, and related rendering
  metadata are removed from public contracts.
- `RuntimeAsset`, `AssetRef`, `VnEntryDef.assetRefs`, evidence visuals, and
  collision proxies remain the public asset contract surface.

## Runtime Ownership

- `packages/asset-registry` validates only public manifest references:
  top-level asset refs, audio bleep refs, fonts, VN entry refs, map refs,
  evidence visuals, and collision proxy assets.
- Apps may keep UI texture ids in app-local configuration and resolve those ids
  through their app-created `AssetRegistry`.
- Shared `ui-kit` and `app-vn-shell` continue to expose controlled surfaces and
  slots, but they do not interpret UI asset roles or skin rendering metadata.
- Surface details such as nine-slice, tiling, CSS `border-image`, or DOM
  composition stay in app surface code.

## Why

The previous fields reserved skin concepts before a complete shared renderer
existed. That made `packages/contracts` imply support for UI role semantics and
frame rendering policy while actual rendering remained app-local. Removing the
public binding keeps the base contracts focused on content/runtime assets and
prevents unfinished skin abstractions from becoming public API.

## Compatibility And Migration

This is a breaking manifest change with no compatibility parser. Existing
manifests must move to version 3 and delete `uiAssets`. Any UI texture still
needed by an app should remain a `RuntimeAsset`; if it is part of a VN entry's
loading needs, declare it in `VnEntryDef.assetRefs`. Game A keeps its dialog frame
asset id in `gameAUiConfig` and resolves it through its local registry.

## Tests

- Contract tests parse v3 manifests, reject v2 manifests, and reject stale
  `uiAssets` declarations.
- Asset-registry tests validate supported manifest references without scanning UI
  asset bindings.
- Game A tests assert app-config dialog frame resolution and missing texture
  fallback behavior.
