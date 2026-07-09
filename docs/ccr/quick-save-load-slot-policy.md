# Contract Change Request

## Requested Change

Add shared interaction actions for quick save and quick load while keeping save
slot policy app-owned.

## Affected Packages

- `packages/contracts`
- `packages/app-vn-shell`
- `packages/ui-kit`
- `apps/game-a`
- `apps/game-harness`

## Why Existing Contract Is Insufficient

The command bar needs to expose Q.Save and Q.Load as shared VN shell actions.
The previous `GameUiAction` contract only named ordinary save/load overlays, so
apps could not route quick save/load through the same shell command surface
without inventing local action names.

## Proposed Shape

- `GameUiActionSchema` adds `quick-save` and `quick-load`.
- `InteractionCapabilitySnapshot` is unchanged. Q.Save uses `canSave`; Q.Load
  uses `canLoad`.
- App shell view models may narrow command availability for app-local state,
  such as disabling Q.Load when the app quick slot is empty.
- Manual save slot count and quick slot ids remain app policy. Game A and the
  harness use forty manual slots plus one independent hidden quick slot.
- `SaveData.version` remains `5`; quick saves persist the same restore payload
  as ordinary saves.

## Compatibility And Migration

This is a hard development-stage storage upgrade. Apps use new storage
boundaries and do not read, convert, or delete old development save data.

## Fixtures And Tests

- Contract tests cover the new shared actions and verify no quick capability
  fields are added.
- Shell tests cover command order, labels, test ids, base capability reuse, and
  app-level availability narrowing.
- App tests cover forty manual slots, hidden quick slots, immediate Q.Load, and
  empty quick slot disabling/no-op behavior.

## Rebase Impact

Branches that build command bar models or switch on `GameUiAction` should handle
`quick-save` and `quick-load`. Branches changing app save slot policy must keep
that policy in app adapters rather than moving it into `packages/contracts` or
`packages/media-save`.
