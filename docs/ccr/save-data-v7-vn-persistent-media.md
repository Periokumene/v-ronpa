# CCR: SaveData v7 VN Persistent Media

## Requested Change

Replace SaveData v6 with a hard-cut v7 contract that includes canonical VN
persistent-media intent. Active BGM groups and looping SFX must round-trip through
stable VN checkpoints and be materialized from the beginning after restore.

This CCR supersedes SaveData v6 and its media-exclusion policy in
`save-data-v6-stable-vn-checkpoint.md`, while retaining stable-checkpoint and
restore-identity rules. It also supersedes the media-persistence exclusion in
`non-pixi-runtime-command-baseline.md` and only the database namespace values in
`unified-media-save-slots-and-thumbnails.md`. No v6 migration, fallback parser,
conversion layer, or old database lookup is provided.

## Affected Packages

- `packages/contracts`
- `packages/nani-runtime-compiler`
- `packages/app-vn-dispatch`
- `packages/app-vn-runtime`
- `packages/media-save`
- `apps/game-a`
- `apps/game-harness`

## Contract Changes

- `SaveData.version` is `7`.
- `SaveableVnState.media` is required and contains:
  - `bgmByGroup[group] = { sourceRef, volume }`;
  - `loopingSfxByKey[key] = { sourceRef, volume, group? }`.
- Tracking keys, `sourceRef`, and explicit SFX `group` values are non-empty.
  `volume` is a finite number. Omitted play volumes are normalized in the pure
  reducer to BGM `0.7` and SFX `1` before checkpoint collection.
- BGM is always looped. The official Naninovel `@bgm loop` parameter remains
  declared for catalog parity and documentation but is not consumed by this
  runtime.
- One-shot SFX, voice, dialogue bleep, movie playback, live handles, playback
  cursors, fades, timers, and media ports are not saveable.

## Runtime Ownership

- `app-vn-dispatch` owns the canonical pure media state and restore effects.
- `app-vn-runtime` owns checkpoint collection, restore materialization, and
  runtime-exclusive AudioPort cleanup.
- Apps own SaveData composition. Game A and Harness both reset their runtime
  before sending the title-flow event.
- Game Flow remains mode/overlay policy only and never controls media directly.

## Hard Cut

- Game A uses `v-ronpa-game-a-saves-v9`.
- Harness uses `v-ronpa-harness-showcase-v9`.
- Old databases are neither read nor migrated.
- v6 payloads and v7 VN payloads without `media` are rejected.

## Acceptance

- Multiple BGM groups and looping SFX round-trip with their target volumes.
- Restore stops the previous runtime-owned port before replaying saved persistent
  media from the beginning without fade progress.
- Reset, restore, and unmount share complete AudioPort/VideoPort cleanup.
- Game A and Harness use the same lifecycle reset invariant.
- Contract, compiler, dispatch, runtime, app, and smoke regressions pass.

## Rebase Impact

Branches constructing `SaveData` or `SaveableVnState` must move to v7 and provide
canonical `media`. Branches calling `resetRuntime` must remove the old option
object. App storage fixtures and smoke cleanup must use the v9 database names.
No compatibility helper should be introduced while rebasing.
