# Contract Change Request

## Requested Change

Replace the public `@rain` command and saved Pixi rain snapshot with
`rainCommandParams`. Rain now accepts `power`, `wind`, `hue`, `tint`, plus the
presentation envelope `time`, `easing`, and `wait`.

## Affected Packages

- `packages/contracts`
- `packages/nani-runtime-compiler`
- `packages/pixi-presenter`
- `packages/media-save`
- `apps/game`

## Why Existing Contract Is Insufficient

The old rain contract exposed generic particle fields such as `xSpeed`,
`ySpeed`, `pos`, `position`, `rotation`, and `scale`. The new Pixi
implementation is shader-driven and derives renderer settings from a small
saveable command layer. Persisting old particle controls or derived shader
settings would make the public snapshot ambiguous and harder to evolve.

## Proposed Shape

`@rain` declares:

- `power:decimal`
- `wind:decimal`
- `hue:decimal`
- `tint:decimal`
- `time:decimal`
- `easing:string`
- `wait:boolean`

`PixiStageSnapshot.version` moves to `4`; `SaveData.version` moves to `3`.
`weather.rain` now stores:

```ts
{
  kind: "rain",
  commandParams: { power, wind, hue, tint },
  transition
}
```

`rainSettings`, shader uniforms, and interpolated render settings are runtime
implementation details and are not serialized. Old `SaveData.version=2` and
old `PixiStageSnapshot.version=3` payloads are intentionally rejected instead
of migrated.

## Fixtures And Tests

- Contract tests validate the rain catalog, per-kind weather snapshot schema,
  version bumps, and old version rejection.
- Runtime compiler tests validate canonical `@rain` params and old rain param
  diagnostics.
- Pixi presenter tests validate command param normalization, zero-power
  cleanup, shader settings resolution, and rain/snow coexistence.
- Vertical-slice fixture uses the new `@rain` command params.

## Rebase Impact

Branches touching `@rain`, Pixi weather snapshots, save/load, or weather
rendering must rebase and replace old rain particle fields with
`rainCommandParams`. Branches with local save fixtures must update to
`SaveData.version=3` and `PixiStageSnapshot.version=4`.
