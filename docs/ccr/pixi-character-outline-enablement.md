# Contract Change Request

## Requested Change

Make final-character white outline enablement an explicit required boolean across the Pixi presenter and canonical VN Pixi
host boundary, and add a shared layered-character source-pixel resolver used by runtime and asset validators.

## Affected Packages

- `packages/layered-character`
- `packages/pixi-presenter`
- `packages/app-vn-shell`
- `apps/game-a`
- `apps/game-harness`

`packages/contracts`, `.nani` IR, save data, ContentManifest, AssetRegistry, and character-pack JSON shapes are unchanged.

## Why Existing Contract Is Insufficient

The renderer previously had no pack-wide source-pixel measurement and drew each active layer directly into actor content.
That cannot express a strict one-original-texel outline around the alpha of the final multi-Sprite character. An optional or
defaulted app switch would also allow new hosts to drift silently between outlined and unoutlined behavior.

## Proposed Shape

- `PixiPresenterOptions.characterOutlineEnabled: boolean`
- `PixiLayerProps.characterOutlineEnabled: boolean`
- `VnPixiPresenterHostProps.characterOutlineEnabled: boolean`
- `resolveLayeredCharacterSourcePixelScale(layers)` returns a discriminated success/failure result.
- `PixiLayer` exposes `data-pixi-character-outline="enabled|disabled"` for runtime inspection.

There is no default, alias, compatibility field, or upgrade converter. Both current apps pass `true`. To adopt a Game-A-only
policy later, Harness changes its single explicit value to `false`.

## Runtime And Validation Semantics

The source-pixel resolver uses `abs(localTransform.scale.x) / pixelsPerUnit`, requires matching positive X/Y density and a
pack-wide relative tolerance of `1e-6`. Project asset validation and the CSP pack validator reject invalid non-empty packs.
Runtime emits `asset-invalid-character-source-pixel-scale` and renders empty rather than silently dropping the outline.
Legitimately empty resolved expressions remain empty without a diagnostic.

The outline consists of eight complete shared-texture composition copies under one white silhouette filter, followed by the
base composition. Per-layer filters and source-sized render textures are outside this contract.

## Fixtures And Tests

- Layered-character tests cover Alice/Ema, sign, zero, square-pixel, mixed-density, and tolerance cases.
- Pixi tests cover enabled/disabled structure, shared textures, atomic replacement, transform scaling, invalid-pack failure,
  and filter/texture lifecycle.
- Asset and CSP tests cover shipped packs, generated one-unit metadata, and invalid fixtures.
- Playwright checks both app-owned switches, diagnostics, and final visual output.

## Rebase Impact

Any branch constructing `PixiPresenterOptions`, `PixiLayer`, or `VnPixiPresenterHost` must choose an explicit boolean when
rebased. No persisted data or generated content migration is required.
