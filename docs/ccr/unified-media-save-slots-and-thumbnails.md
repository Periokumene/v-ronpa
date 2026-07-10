# Contract Change Request

> Superseded note: The v7 database namespace values in this CCR are superseded
> by `save-data-v7-vn-persistent-media.md`. Shared slot/storage ownership,
> transaction, summary, preview, and policy decisions remain active.

## Requested Change

Make `packages/media-save` the single save-slot infrastructure authority for
Game A and the harness, including slot envelopes, Dexie split storage, quick
slot policy helpers, structured operation results, and thumbnail preview
storage.

This CCR supersedes the app-local storage portions of
`save-data-v5-vn-state-authority.md` and `quick-save-load-slot-policy.md`.

## Affected Packages

- `packages/media-save`
- `packages/app-vn-shell`
- `packages/ui-kit`
- `packages/pixi-presenter`
- `apps/game-a`
- `apps/game-harness`

## Proposed Shape

- `media-save` owns the save port contract.
- Dexie storage is split into `slots`, `payloads`, and `previews`.
- `slots` stores only summary/index data; `listSummaries()` must not read
  payloads or preview blobs.
- `payloads` stores `SaveData`.
- `previews` stores thumbnail `Blob` plus metadata.
- `loadPreviews(slotIds)` lazily loads only requested slot previews.
- `save`, `load`, `delete`, `list`, `listSummaries`, and `loadPreviews` return
  structured `{ ok, value/error }` results.
- `save` and `delete` update slot, payload, and preview tables in one
  transaction.
- `createFortyPlusQuickSaveSlotPolicy(namespace)` provides the shared
  forty-manual-plus-quick id policy for apps.
- `SAVE_SLOT_THUMBNAIL_CAPTURE_OPTIONS` provides the shared first-provider
  thumbnail capture dimensions, mime, and quality.
- `SaveData` and `SaveSlotSummary` remain thumbnail-free.
- Shell save/load view models carry `slotPreviewsById`, `busy`,
  `activeOperation`, and `lastError`.
- `app-vn-shell` provides the shared React save-slot controller that serializes
  operations, refreshes summaries, and lazy-loads current-page previews through
  `media-save`.
- App layers provide only runtime collection, restore behavior, flow routing,
  and skin-specific rendering.

## Compatibility And Migration

This is a hard development-stage storage upgrade.

- Game A uses `v-ronpa-game-a-saves-v7`.
- Harness uses `v-ronpa-harness-showcase-v7`.
- Game A does not read old localStorage save records or indexes.
- Harness does not read the previous Dexie v6 database.
- No migration, compatibility adapter, or conversion layer is provided.

## Thumbnail Policy

The first thumbnail provider captures the VN/Pixi scene only. It writes
`320x180` WebP at quality `0.8` as a Blob with image metadata. R3F/Trial full
scene composition is reserved for a later provider extension.

## Boundary Notes

`apps/game-a` may depend on `@v-ronpa/media-save` for save ports and policy
helpers. It still must not import Dexie, Howler, Pixi, R3F, Navi, or Trial
runtime packages directly.

## Tests

- `media-save` covers structured results, summary-only behavior by contract,
  preview lazy loading, preview cleanup, invalid write errors, and shared slot
  policy helpers.
- Game A covers VN-only save collection and shared slot policy.
- Harness covers Navi/Trial save collection and shared slot policy.
- Shell/UI tests cover new save/load view model defaults and preview-capable
  surfaces.
- Smoke tests clear the new IndexedDB databases and verify manual/quick
  save-load flows plus rendered thumbnail elements.
