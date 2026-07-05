# Contract Change Request

## Requested Change

Hard-cut layered character metadata to use an explicit character-level anchor
and runtime texture dimensions.

## Affected Packages

- `packages/contracts`
- `packages/layered-character`
- `packages/pixi-presenter`
- `scripts/validate-assets.mjs`
- `apps/game-a`
- `apps/game-harness`

## Why Existing Contract Is Insufficient

The previous character-pack shape stored `renderSpace.defaultBounds` and per-layer
`texture.size` plus `sprite.rect`. The layer metadata also carried
`renderer.size`, another local-size value that the presenter did not consume. In
the current one-PNG-per-layer pipeline those dimensions duplicate the real PNG
dimensions, while `defaultBounds` was also being used as the actor anchor source.
That made a geometric bounds field carry positioning semantics and encouraged
asset authors to adjust bounds just to move a character.

## Proposed Shape

- `renderSpace.characterAnchor: [number, number]` is the only character-level
  positioning anchor. Its unit is the character-local coordinate system derived
  from each layer's `pixelsPerUnit`.
- `renderSpace.defaultBounds` is removed and no longer participates in rendering.
- Per-layer metadata removes `texture`, `sprite.rect`, and `renderer.size`;
  `layers.json` `src` remains the only texture path.
- Pixi uses the loaded texture's real dimensions for rendering and rejects
  loaded textures with invalid dimensions.
- Atlas sub-rect semantics are intentionally out of scope for this contract.

## Fixtures And Tests

- Contract tests cover the simplified schemas and reject old bounds/rect/texture
  fields through strict object validation.
- Layered resolver tests keep expression behavior and update bounds helpers to
  require caller-supplied texture dimensions.
- Pixi presenter tests cover explicit `characterAnchor`, runtime texture
  dimensions, and invalid-dimension diagnostics.
- `validate:assets` checks both Game A and harness character packs and validates
  PNG headers for layer textures.
