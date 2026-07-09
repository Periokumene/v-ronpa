# Contract Change Request

> Superseded note: App storage-boundary details in this CCR are superseded by
> `docs/ccr/unified-media-save-slots-and-thumbnails.md`. The v5 `SaveData`
> authority remains valid.

## Requested Change

Move public saves to `SaveData.version = 5` and make `SaveData.vn` the only
public authority for VN story and Pixi VN stage state.

## Affected Packages

- `packages/contracts`
- `packages/media-save`
- `apps/game-a`
- `apps/game-harness`

## Why Existing Contract Is Insufficient

The previous save shape allowed VN state in two places: legacy top-level
`story` / `pixiStage` and the newer nested `vn.story` / `vn.pixiStage`. That
created two potential authorities for the same runtime state and forced app
restore code to keep fallback paths.

Save/load now needs one strict public boundary before adding more slot policy,
record envelopes, and future visual previews.

## Proposed Shape

- `SaveDataSchema` moves to `version: 5` and is strict.
- `SaveData.mode` is limited to saveable playable modes: `vn`, `navi`, and
  `trial`.
- `SaveData` always contains required nullable `vn`, `navi`, and `trial`
  sections plus inventory, evidence, and character state.
- Mode invariants require the active mode section to be non-null:
  `vn` saves require `vn`, `navi` saves require `navi`, and `trial` saves
  require `trial`.
- Extra non-null sections are allowed so integrated harness saves can keep VN
  and Navi context while Trial is active.
- Top-level `story` and `pixiStage` are removed. VN story and Pixi VN stage
  state may only appear as `vn.story` and `vn.pixiStage`.
- `StoryRuntimeSnapshot.backlog` is truncated to the newest 20 entries through
  a shared save helper. The live runtime object is not mutated and
  `story.text.current` is preserved.
- `SaveSlotSummary` text derivation is shared through the contracts layer and
  reads only `SaveData.vn?.story`, preferring `story.text.current` over the
  newest backlog entry.

## Compatibility And Migration

This is a breaking development-stage save change. No old save compatibility,
migration, fallback, or local conversion is provided.

Old `SaveData.version < 5`, top-level `story`, top-level `pixiStage`, and
missing required nullable sections are rejected by public parsing. Game A uses a
new localStorage key prefix and the harness uses a new Dexie database boundary
so old development data is isolated rather than read.

## App Storage Boundaries

> Historical record only. The current save-slot storage boundary is
> `docs/ccr/unified-media-save-slots-and-thumbnails.md`: Game A and the harness
> both use `media-save` storage/policy through the shared shell controller, and
> Game A no longer owns a localStorage save envelope.

- `apps/game-a` owns an app-local localStorage record envelope around v5
  `SaveData`. The slot record is the source of truth; its index is only a
  cache. Preview metadata is reserved in the app-local envelope and currently
  writes `{ kind: "none" }`.
- `apps/game-harness` continues to use `packages/media-save` and Dexie without
  the Game A record envelope.
- `packages/media-save` remains a shared save port and delegates summary
  derivation to the contracts helper. It does not add thumbnail fields in this
  change.

## Fixtures And Tests

- Contract tests cover valid v5 VN/Navi/Trial saves, strict rejection of old or
  legacy shapes, mode-section invariants, and backlog truncation.
- `media-save` tests cover v5-only parsing and summary derivation from
  `vn.story`.
- Game A tests cover the app-local record envelope, independent slot records,
  invalid record rejection, and backlog truncation.
- Harness tests cover v5 save construction for Navi/Trial and v5-only restore
  wiring.

## Rebase Impact

Branches constructing `SaveData` by hand must update fixtures to v5, add the
required nullable sections, and move VN story/Pixi state under `vn`. Branches
with save restore code must remove top-level story/Pixi fallbacks instead of
adding compatibility layers.
