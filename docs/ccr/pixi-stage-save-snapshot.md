# Contract Change Request

## Requested Change

Add a public `PixiStageSnapshot` contract and require it in `SaveData` v2.

## Affected Packages

- `packages/contracts`
- `packages/pixi-presenter`
- `apps/game`
- `packages/media-save`

## Why Existing Contract Is Insufficient

Story UI can restore from `StoryRuntimeSnapshot`, but Pixi staging is derived
from transient RuntimeCommand fanout and render hints. Loading a save must not
replay that command stream, so background and portrait staging need a direct
terminal snapshot.

## Proposed Shape

- `PixiStageSnapshot` is a versioned semantic terminal state for Pixi VN 2D
  staging.
- v1 stores `revision`, optional `background`, and fixed `left` / `center` /
  `right` portrait slots.
- `SaveData` moves to version 2 and requires `pixiStage`.
- The current development save database may be bumped instead of migrating old
  v1 saves.

## Runtime Ownership

- Story continues to own `StoryRuntimeSnapshot`.
- App Pixi adapter code owns RuntimeCommand-to-`PixiStageSnapshot` projection.
- Pixi presenter owns renderer reconciliation from the snapshot.
- `PresenterTrace` remains internal debug state and is not a save contract.

## Compatibility And Migration

No historical v1 save compatibility is required for this development-stage
change. Vertical-slice storage should use a new DB name or version boundary.

## Fixtures And Tests

- Contract tests cover `PixiStageSnapshot` and `SaveData` v2.
- Pixi presenter tests cover reducer behavior and reconcile safety.
- App runtime/save tests cover story and Pixi snapshot restoration together.

## Rebase Impact

Branches creating or parsing `SaveData` must include `pixiStage` and update
version expectations to 2.
