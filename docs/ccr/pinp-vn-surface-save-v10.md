# Contract Change Request: Pinp VN Surface And SaveData v10

> SaveData v10 was the original Pinp hard cut. The later
> [App-relative asset protocol v5 hard update](./app-relative-asset-protocol-v5.md)
> supersedes its asset field and serialization versions with `assetId`,
> SaveData v11, and App database v13. Pinp Surface semantics remain in force.

## Requested Change

Add the implemented `@pinp` command, the formal `pinp` VN UI Surface ID, a
serializable pinp UI checkpoint, and a hard-cut SaveData v10 schema.

## Affected Packages

- `packages/contracts`
- `packages/nani-parser`
- `packages/nani-runtime-compiler`
- `packages/story-engine`
- `packages/app-vn-dispatch`
- `packages/app-vn-runtime`
- `packages/app-vn-shell`
- `packages/ui-kit`
- `packages/media-save`
- `apps/game-a`
- `apps/game-harness`
- `scripts/fixtures/nani-semantic-golden.json`

## Why Existing Contract Is Insufficient

Toast is text-only and the current UI checkpoint stores only visibility for
dialog, command bar, toast layer, and cue. A persistent story image requires an
opaque texture asset reference, stable layout data, formal Surface lifecycle,
and save/restore semantics without leaking DOM or resolved URIs into saves.

## Proposed Shape

- Add implemented `@pinp` with an optional primary `assetId` and the parameters
  `pos`, `height`, `ratio`, `alt`, `effect`, `time`, and `visible`.
- Add `pinp` to `VN_UI_SURFACE_IDS`, but not to `RUNTIME_UI_GROUPS`.
- Add `VnPinpCheckpoint` containing `assetId`, `alt`, `positionPercent`,
  `heightPercent`, and `aspectRatio`.
- Add `pinp: VnPinpCheckpoint | null` to `VnUiCheckpoint`.
- Pinp originally changed `SaveData.version` from 9 to 10. The current combined
  contract is version 11 and App-owned IndexedDB namespace v13; no migration is
  provided, so the v10/v12 state remains isolated.
- Asset IDs use the shared App-relative AssetId contract. Parser IR records no
  asset kind; post-compile Nani binding declares an `image` requirement.

## Runtime Ownership

- Dispatch owns serializable pinp content, revision, and Surface transition state.
- Runtime resolves texture URIs for live presentation and restore, and records
  AssetResolver diagnostics.
- Shell exposes the formal Pinp slot and ui-kit supplies the default DOM Surface.
- Game A customizes only the slot renderer and CSS.

## Compatibility And Migration

This is an intentional hard cut. SaveData v9/v10 and the v11/v12 App databases
are not migrated. Restored current-version Pinp state resolves its `assetId`
again and resumes in a terminal visible state without replaying transition time.

## Fixtures And Tests

- Contract tests cover the command catalog, Surface IDs, checkpoint schema, and
  old-version rejection/current v11 acceptance.
- Parser/compiler tests cover opaque IDs, defaults, strict show/hide forms, and
  invalid parameter rejection.
- Dispatch/runtime tests cover transition cleanup, stable projection, restore
  hydration, diagnostics, and cross-script clearing.
- Shell/ui-kit/Game A tests and Playwright smoke cover DOM rendering and styling.

## Rebase Impact

Branches constructing `VnUiCheckpoint` or `SaveData` must add `pinp` and use
version 11. Branches implementing complete `GameInteractionShellSurfaces` maps
must provide or inherit the new Pinp slot.
