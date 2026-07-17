# Contract Change Request

> The preload/readiness contract below remains current. Filter placement is superseded by
> [`pixi-character-outline-crossfade-opacity.md`](./pixi-character-outline-crossfade-opacity.md), and branch combination is
> superseded by [`pixi-character-crossfade-compositing.md`](./pixi-character-crossfade-compositing.md). The new root Filter is
> only a transition isolation boundary; reconstructing an outline from flattened crossfade RGBA remains forbidden.

## Requested Change

Replace runtime layered-character loading and the independently renderable eight-copy silhouette with an entry-scoped
preload contract, a stable Pixi stage readiness handle, synchronous character instantiation, and a final-color outline
filter pipeline.

This request supersedes the rendering and lifecycle sections of
[`pixi-character-outline-enablement.md`](./pixi-character-outline-enablement.md). The explicit
`characterOutlineEnabled` switch and the shared source-pixel resolver remain current.

## Affected Packages

- `packages/layered-character`
- `packages/pixi-presenter`
- `packages/app-vn-shell`
- `apps/game-a`
- `apps/game-harness`
- generated app script metadata from `scripts/generate-assets.mjs`

`packages/contracts`, `.nani` IR, save data, ContentManifest, AssetRegistry, and character-pack JSON are unchanged.

## Why Existing Contract Is Insufficient

An `@char time` command previously started its presentation task before pack metadata and textures were ready. Loading time
therefore consumed the declared transition time. On commit, the renderer replaced two independent branches: a white
silhouette branch and the color branch. A browser/GPU frame could expose only the white branch. Story-session remounts also
discarded any upload performed before VN entry.

The old async callback guarded only a content generation number. It did not establish a resource boundary and could still
target a removed actor container. Correctness requires the VN entry, not an individual render call, to own preparation.

## Proposed Shape

- `LayeredCharacterPreloadPlan` is a stable list of `{ characterId, appearanceExpressions }` entries.
- Generated script metadata stores its preload plan beside `scriptRevision` and `assetRefs`.
- `PixiPresenterOptions.characterPreloadPlan`, `PixiLayerProps.characterPreloadPlan`, and
  `VnPixiPresenterHostProps.characterPreloadPlan` are required; an app that needs no characters passes `[]`.
- `PixiStageHandle` replaces `PixiStageCaptureHandle` and exposes `ready: Promise<void>` plus `captureThumbnail()`.
- `onStageHandleChanged` replaces `onCaptureHandleChanged` without aliases.
- `PixiLayer` exposes `data-pixi-character-preparation="preparing|ready"`.

Game A launch definitions pair one runtime entry with exactly its generated plan. Both current apps explicitly keep
`characterOutlineEnabled: true`; disabling Harness later changes only its app-owned boolean.

## Runtime Semantics

Presenter mount resolves every planned expression, deduplicates pack/metadata/Texture work, and uploads unique textures
through the active renderer before the stage handle becomes ready. Explicit failures are diagnosed and cached as strict
empty results. Runtime requests outside the plan emit `asset-unprepared-character-expression`, render empty synchronously,
and perform no load or retry.

Each actor owns one persistent final-character root. Stable rendering contains one complete layer composition. A visible
token change contains outgoing and incoming compositions only for the declared crossfade, then releases outgoing. The
transition task starts after both first-frame opacity values are installed. A new token settles the previous transition to
its target before beginning the next one.

Each active complete composition owns a WebGL Filter that samples the center and eight transformed source-texel neighbors at
full source coverage. Actor and transition opacity multiply the completed Filter output, never its input. No white branch can
render independently. The Filter is omitted when the explicit app switch is false, while preload and transition scheduling
remain identical. The superseding CCR is authoritative for these compositing details.

The canonical host remains mounted across `storySession` changes so the readiness barrier and GPU context stay authoritative.
New game and restore wait at the app boundary while the user remains on the title or Navi surface.

## Fixtures And Tests

- Generator tests cover default, duplicate, branch, slide, and wildcard expressions with stable ordering.
- Presenter tests cover exact preparation, deduplication/upload, plan misses, strict empty failure, persistent filter,
  two-composition crossfade, transition start order, texel transforms, and destruction without texture ownership transfer.
- App tests cover paired launch definitions and readiness-gated new-game/load paths.
- Browser smoke delays character PNG responses and samples token transition frames for a non-white interior.

## Rebase Impact

Every presenter or canonical Pixi host call site must pass a plan and adopt the renamed stage handle. There is no alias,
default, persisted-data migration, character-pack conversion, or runtime fallback. Branches that retained the eight-copy
outline or story-session presenter remount must delete those paths rather than adapting them.
