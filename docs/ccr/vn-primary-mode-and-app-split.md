# CCR: VN Primary Mode And App Split

## Summary

Promote `vn` to a first-class `GameMode`, split the browser app surface into
`apps/game-a` and `apps/game-harness`, and add app-layer VN glue packages:

- `packages/app-vn-session`
- `packages/app-vn-dispatch`
- `packages/app-vn-shell`

## Contract Changes

- `GameModeSchema` adds `"vn"`.
- `ContentManifestSchema` adds `vnEntries`.
- `VnEntryDefSchema` defines stable VN entry ids, script paths, optional start
  labels, presentation profile, and manifest-level asset refs.
- `SaveableVnStateSchema` stores only `entryId`, `StoryRuntimeSnapshot`, and
  `PixiStageSnapshot`.
- `SaveDataSchema` adds optional `vn` while retaining existing `story` and
  `pixiStage` fields for current save/load surfaces.

Transient reveal state, voice gates, timers, Pixi task observations, media
handles, and render hints remain outside public contracts.

## App Boundary Changes

- `apps/game-a` is the VN-first framework app and uses VN app packages plus
  asset registry, flow machine, Pixi presenter, story packages, DOM UI, and
  minimal gameplay state helpers required by the shared `SaveData` shape.
- `apps/game-harness` is the integrated showcase game and baseline smoke/gate
  target. It keeps Navi, Trial, R3F, Pixi, media, save/load, settings, pause,
  debug readouts, and smoke controls.
- The old `@v-ronpa/game` package name and `apps/game` path are removed.
- `packages/app-vn-session` snapshots are session-local restore helpers.
  Public `SaveData.vn` remains `entryId`, `StoryRuntimeSnapshot`, and terminal
  `PixiStageSnapshot`; app save adapters must not persist `StoryPlayState`,
  timers, reveal state, voice gates, media handles, or Pixi task observations.

## Validation

- `validate:baseline` builds both `@v-ronpa/game-a` and
  `@v-ronpa/game-harness`.
- Playwright smoke has separate projects for `game-a` and `game-harness`.
- `validate:app-cleanup` rejects active references to old app and
  harness-showcase predecessor names outside archived docs and historical CCRs.
