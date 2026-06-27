# Contract Change Request

## Requested Change

Replace portrait-based Pixi character presentation with Naninovel-style layered
characters backed by character-pack assets and expression-based actor snapshots.

## Affected Packages

- `packages/contracts`
- `packages/layered-character`
- `packages/nani-parser`
- `packages/nani-runtime-compiler`
- `packages/pixi-presenter`
- `apps/game`
- `packages/media-save`

## Why Existing Contract Is Insufficient

The previous Pixi actor contract stored character appearances as single portrait
asset ids and exposed legacy fixed portrait slots. That cannot represent
Naninovel layered character expressions such as `Pensive1,ArmR3`, group/layer
operations, or metadata-driven sprite composition.

## Proposed Shape

- `PixiStageSnapshot` moves to version `3`.
- Character actors store `appearanceExpression` as the saveable semantic state.
- `slots`, `portraitId`, and legacy `background` compatibility fields are
  removed.
- `RuntimeAssetKind` gains `character-pack`; `RuntimeAssetFormat` gains `json`.
- Layered character public schemas cover `character.json`, `layers.json`,
  `compositions.json`, and per-layer metadata.
- Layer refs in `layers.json` are pack-relative paths; absolute URLs and parent
  directory escapes are invalid.
- Pixi resolves character-pack entry JSON through the app-injected asset
  resolver, then loads only active layer metadata and textures selected by the
  pure `packages/layered-character` resolver.
- `@char Ema.Pensive1,ArmR3 pos:50` compiles to target `Ema`, expression
  `Pensive1,ArmR3`, and normalized scene position handling downstream.

## Fixtures And Tests

- Contract tests cover v3 snapshots and character-pack manifest assets.
- Runtime compiler tests cover Naninovel layered `@char` syntax.
- Layered resolver tests cover default composition, token/atom expansion,
  conflict resolution, recursion diagnostics, and strict failures.
- Pixi presenter tests cover layered character asset loading and atomic content
  replacement, including inactive metadata not being required for overridden
  layers.
- App harness smoke covers a real Ema character pack.

## Rebase Impact

Branches constructing `PixiStageSnapshot` must use v3 actor tables. Branches
referencing portrait runtime assets, portrait slots, or `portrait:*` char
fixtures must move to character-pack assets and layered expressions.
