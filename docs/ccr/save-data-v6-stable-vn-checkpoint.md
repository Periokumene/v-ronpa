# CCR: SaveData v6 Stable VN Checkpoint

> SaveData v6 and its media-exclusion rule are superseded by
> `save-data-v7-vn-persistent-media.md`. Stable checkpoint rejection and restore
> identity rules are retained by v7.

## Requested Change

Replace the development-only v5 save boundary with a strict v6 checkpoint. A
save identifies its game and VN entry, verifies the canonical compiled-script
revision, stores only stable Story/Pixi/UI terminal state, and rejects every
runtime or presentation wait.

## Contract Changes

- `SaveData.version` is `6` and requires `gameId`.
- `SaveableVnState` requires `entryId`, `scriptRevision`, terminal
  `PixiStageSnapshot`, stable `SaveableStorySnapshot`, and terminal UI surface
  visibility.
- `VnEntryDef` requires the same generated `scriptRevision` used by saves.
- Live `StoryRuntimeSnapshot` may contain waits; `SaveableStorySnapshot` may not.

## Compatibility

There is no v5 migration or fallback. Apps use new database namespaces and
reject unknown game ids, entries, revisions, and older payload versions.

## Acceptance

- Stable line and choice checkpoints round-trip.
- Runtime/UI/Pixi waits are rejected at collection time.
- Wrong game, entry, or script revision is rejected before runtime restore.
- Terminal UI visibility restores without transition progress or media state.
