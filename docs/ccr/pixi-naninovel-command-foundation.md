# Contract Change Request

## Requested Change

Promote Pixi VN staging to `PixiStageSnapshot` v2 and add wait-aware
presentation stops for Naninovel-style Pixi commands.

## Affected Packages

- `packages/contracts`
- `packages/nani-runtime-compiler`
- `packages/story-engine`
- `packages/pixi-presenter`
- `apps/game`

## Why Existing Contract Is Insufficient

The v1 Pixi snapshot stores only one background and fixed portrait slots. That
cannot represent Naninovel actor commands such as `char`, `back`, `arrange`,
`slide`, `blur`, weather, screen filters, actor ordering, or waitable
presentation effects. StoryEngine also currently advances across Pixi animation
commands, so `wait:true` cannot be honored.

## Proposed Shape

- `PixiStageSnapshot` moves to version `2`.
- v2 stores `backgroundsById`, `charactersById`, `actorOrder`, `weather`,
  `screenFilters`, and `revision`.
- Actor snapshots store appearance, pose, visibility, transforms, tint, alpha,
  z, filters, look, and transition metadata. Slide transitions may carry
  normalized `from` and `to` positions; the terminal actor position remains the
  authoritative saved state.
- `.nani` actor/effect scene positions retain Naninovel's `0..100` scene
  percent syntax at the command boundary and are normalized to `0..1` in the
  Pixi snapshot reducer.
- Legacy `background` and `slots` fields remain temporarily as app/harness
  readout compatibility fields; Pixi rendering should read actor tables.
- `StoryRuntimeSnapshot` may include `presentationWait` with command id,
  duration, and optional target.
- Story execution may stop with a presentation wait result when an implemented
  presentation command has `wait:true`.
- `charenter` is no longer the preferred runtime surface. Official `char`
  should be used for Naninovel-compatible character presentation. `flash`
  remains a V-Ronpa effect command.

## Fixtures And Tests

- Contract tests cover snapshot v2 and optional presentation wait state.
- Compiler tests cover official actor/effect/weather command normalization.
- StoryEngine tests cover `wait:true` presentation stops and resume.
- Pixi presenter tests cover actor resolver, reducer output, and systems.
- App transaction and save/restore tests cover terminal Pixi state restoration.

## Rebase Impact

Branches constructing `PixiStageSnapshot` must include v2 actor tables or call
`createInitialPixiStageSnapshot`. Branches using `charenter` fixtures should
rewrite them to official `char` commands unless intentionally testing migration
diagnostics.
