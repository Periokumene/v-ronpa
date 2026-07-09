# Contract Change Request

> Superseded note: storage-boundary examples in this CCR are historical. Current
> Game A and harness save-slot storage is defined by
> `docs/ccr/unified-media-save-slots-and-thumbnails.md`.

## Requested Change

Add a public `@inback` `.nani` command and a saveable Pixi inner background
snapshot layer.

## Affected Packages

- `packages/contracts`
- `packages/nani-parser`
- `packages/nani-runtime-compiler`
- `packages/app-vn-dispatch`
- `packages/pixi-presenter`
- `packages/app-vn-shell`
- `packages/app-vn-runtime`
- `packages/media-save`
- `apps/game-a`
- `apps/game-harness`

## Why Existing Contract Is Insufficient

`@back` owns the full-stage background. Frame-style background presentation
needs a second Pixi-owned background surface between the main background and
VN weather/character layers. CSS host resizing would affect the whole Pixi
canvas, including characters and weather, so the frame must be represented in
Pixi stage state and rendered inside the presenter.

## Proposed Shape

- `commandCatalog` adds `inback` with `execution: "pixi-presentation"`.
- `@inback` v1 supports `appearance`, primary background id,
  `effect` / `via`, `time`, `easing`, `wait`, and `visible`.
- `PixiStageSnapshot.version` moves to `5`.
- `PixiStageSnapshot.innerBackgroundsById` stores saveable inner background
  actors. v1 command authoring writes the reserved `InnerBackground` actor only.
- `packages/contracts` exports `PIXI_MAIN_BACKGROUND_ID` and
  `PIXI_INNER_BACKGROUND_ID` so compiler, presenter, shell, and tests do not
  each hardcode reserved actor ids.
- `SaveData.version` moves to `4` because saves embed the v5 Pixi snapshot.
- Pixi renders inner backgrounds on `innerBackLayer` at `zIndex = 2`, between
  main backgrounds and back weather.

## Compatibility And Migration

No development save migration is required. Game A localStorage and the harness
Dexie database use new storage boundaries so old v3/v4 development saves are
not mixed with the v4/v5 schema pair. Old `PixiStageSnapshot.version = 4` and
`SaveData.version = 3` payloads are intentionally rejected by public schemas.

## Fixtures And Tests

- Contract tests cover `@inback`, v5 Pixi snapshots, and v4 save data.
- Parser/compiler tests cover `@inback` background asset collection and command
  normalization.
- App dispatch tests cover automatic Pixi routing through command execution.
- Pixi presenter tests cover reducer state, inner layer rendering, frame rect
  sizing, and fallback diagnostics.
- Game A and harness fixtures exercise the command in real VN runtime wiring,
  with harness smoke coverage as the public integration check.

## Rebase Impact

Branches constructing `PixiStageSnapshot` or `SaveData` by hand must update
their fixtures to v5/v4 and include `innerBackgroundsById` when asserting full
object equality. Branches adding Pixi commands should avoid treating `@inback`
as a `@back` alias; it is a separate Pixi command with its own snapshot field.
