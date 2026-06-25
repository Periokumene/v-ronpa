# Contract Change Request

## Requested Change

Expose Glitch shader control parameters on `@glitch` so scripts can tune the
Shadertoy Morton/hash Pixi glitch effect without relying on renderer-only
constants.

## Affected Packages

- `packages/contracts`
- `packages/nani-runtime-compiler`
- `packages/pixi-presenter`
- `apps/game`

## Why Existing Contract Is Insufficient

The current `@glitch` catalog entry only exposes `power`, `time`, and `wait`.
The new Pixi implementation replaces the old transient scanline/noise sprites
with a full-stage shader based on a Shadertoy Morton address-shuffle algorithm.
That shader needs script-visible controls for medium block jumps, large burst
jumps, pixel scatter, random color replacement, playback speed, and deterministic
seed so the vertical-slice fixture and future scripts can tune the effect
intentionally.

## Proposed Shape

`@glitch` adds these optional decimal parameters:

- `blockJump`
- `burstJump`
- `pixelScatter`
- `colorNoise`
- `speed`
- `seed`

Existing `power`, `time`, and `wait` remain compatible. Runtime commands keep
the same top-level shape; only `params` gains these canonical fields when
supplied. Glitch remains a transient render hint and does not become persistent
save data.

## Fixtures And Tests

- Contract tests validate the `@glitch` catalog entry.
- Runtime compiler tests validate canonical `@glitch` params.
- Pixi presenter tests validate glitch hint params, wait task descriptors,
  shader filter creation, uniform ticking, cleanup, and root filter stack
  composition.
- Vertical-slice fixture uses the new `@glitch` params for multi-tier visual
  smoke evidence.

## Rebase Impact

Branches touching `@glitch`, Pixi transient effects, or vertical-slice fixtures
must rebase and consume the new canonical glitch params. Non-Pixi runtime command
branches should not redefine these fields.
