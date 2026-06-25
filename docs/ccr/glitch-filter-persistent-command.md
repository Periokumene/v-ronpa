# Contract Change Request

## Requested Change

Add `@glitchFilter` as the persistent screen-filter counterpart to the
one-shot `@glitch` pulse command.

## Affected Packages

- `packages/contracts`
- `packages/nani-runtime-compiler`
- `packages/pixi-presenter`
- `apps/game`

## Why Existing Contract Is Insufficient

`@glitch` is now a transient Pixi render hint: it runs for one duration and then
cleans itself up without entering saveable stage state. Some scenes need a
continuing glitch atmosphere that survives across dialogue lines and save/load.
Reusing `@glitch` for that purpose would overload `time`, `wait`, and
`power:0` with two different lifecycles.

## Proposed Shape

Add `@glitchFilter` with these optional params:

- `power`
- `time`
- `easing`
- `wait`
- `blockJump`
- `burstJump`
- `pixelScatter`
- `colorNoise`
- `speed`
- `seed`

`@glitchFilter` writes to `PixiStageSnapshot.screenFilters.glitch`; `power:0`
removes that persistent filter. Runtime commands keep the same top-level shape.
`@glitch` remains a transient hint and never becomes save data.

## Fixtures And Tests

- Contract tests validate command catalog params and `screenFilters.glitch`.
- Compiler tests validate canonical `@glitchFilter` params and diagnostics.
- Pixi tests validate persistent state, wait tasks, root filter lifecycle, and
  coexistence with one-shot `@glitch`.
- Vertical-slice smoke adds persistent-only, persistent-plus-pulse, and
  persistent-off cleanup screenshots.

## Rebase Impact

Branches touching `@glitch`, root-level Pixi filters, or vertical-slice visual
fixtures must rebase and keep `@glitch` transient while using `@glitchFilter`
for saveable persistent glitch state.
