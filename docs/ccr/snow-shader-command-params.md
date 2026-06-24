# Contract Change Request

## Requested Change

Expose Snow shader control parameters on `@snow` so scripts can tune the
Shadertoy-derived Pixi snow effect without relying on renderer-only constants.

## Affected Packages

- `packages/contracts`
- `packages/nani-runtime-compiler`
- `packages/pixi-presenter`
- `apps/game`

## Why Existing Contract Is Insufficient

The current `@snow` catalog entry only exposes generic particle controls. The
new Pixi implementation replaces the old snow tiling sprites with a full-screen
shader based on the `Mdt3Df` Shadertoy snow algorithm. That shader needs
script-visible controls for wind, fall speed, density, flake scale, sway, fog,
noise, and deterministic seed so the vertical-slice fixture and future scripts
can tune the effect intentionally.

## Proposed Shape

`@snow` adds these optional decimal parameters:

- `xSpeed`
- `ySpeed`
- `density`
- `flakeScale`
- `sway`
- `fog`
- `noise`
- `seed`

`PixiWeatherSnapshot` adds matching optional fields. Existing `power`, `time`,
`wait`, `pos`, `position`, `rotation`, and `scale` remain compatible. Runtime
commands keep the same top-level shape; only `params` gains these canonical
fields when supplied.

## Fixtures And Tests

- Contract tests validate the `@snow` catalog entry and new weather snapshot
  fields.
- Runtime compiler tests validate canonical `@snow` params.
- Pixi presenter tests validate snow reducer state, wait task descriptors,
  shader overlay creation, shader uniform ticking, coexistence, and cleanup.
- Vertical-slice fixture uses the new `@snow` params for visual smoke evidence.

## Rebase Impact

Branches touching `@snow`, weather command normalization, Pixi weather systems,
or vertical-slice fixtures must rebase and consume the new canonical snow
params. Non-Pixi runtime command branches should not redefine these fields.
