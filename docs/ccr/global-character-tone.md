# Global Character Tone

## Status

- State: `Active`

## Requested Change

Add the V-Ronpa `@charTone` presentation command, one optional script-scoped
`characterTone` record on `PixiStageSnapshot`, and the
`character-tone-transition` presentation task kind.

## Public Shape

```nani
@charTone rain
@charTone fog amount:1.25 time:0.4 wait!
@charTone amount:1.5
@charTone none time:0.3 wait!
```

The first preset set is `rain`, `fog`, `sunset`, `night`, `alert`, and
`fluorescent`. `amount` is a finite non-negative artistic multiplier with
default `1` and no maximum. `none` and `amount:0` remove the state. `time` and
`wait!` use the existing Pixi presentation timing contract. Easing is an
internal fixed renderer policy and is not a command parameter.

The command catalog declares `primaryParam: "preset"`. This is authoring
metadata, not an additional runtime field: editor completion and Hover resolve
`@charTone rain` and `@charTone preset:rain` through the same `preset`
definition and allowed-value list.

```ts
interface PixiCharacterToneSnapshot {
  preset: CharacterTonePresetId;
  amount: number;
  scopeScriptPath: string;
  transition: {
    durationMs: number;
    wait: boolean;
  };
}
```

`PixiStageSnapshot.characterTone` is optional. The stage remains version 5 and
SaveData remains version 8, so existing snapshots without the field remain
valid.

## Runtime Semantics

- One state applies to every current and future character composition.
- A named `@char Character` without an explicit `visible` value writes
  `visible:true`. `@hideChars` and `@char visible:false` continue to write the
  same snapshot field; this prevents a previously hidden actor from remaining
  invisibly registered when it is shown again for Tone acceptance.
- The state persists within one `.nani` script and clears immediately at a
  cross-script boundary. Local label jumps do not clear it.
- Stable snapshots store target values only. Transition progress and easing are
  never saved; restore reconciles the terminal target with `animate:false`.
- A timed command owns one `character-tone-transition` task regardless of the
  number of characters.
- Tone runs after layered-character composition and before the final
  outline/opacity Filter. Backgrounds, weather, outline color, and DOM UI are
  outside its filter target.

## Compatibility

- Existing actor `tint` remains unchanged and is not an alias.
- No save migration, database namespace change, manifest change, dependency,
  compatibility command, or runtime preset registration is introduced.
- Preset recipes and the OKLab shader remain private Pixi presenter details.

## Regression Evidence

- Contract/compiler tests cover command docs, normalization, preset validation,
  amount boundaries, and old/new snapshot parsing.
- VS Code logic and Extension Host tests cover both primary/named preset
  completion, primary Hover, exact invalid-preset diagnostics, and the named
  `@char` visibility default.
- Stage/runtime tests cover reducer semantics, script-scope convergence,
  chained navigation, wait tasks, and save/restore.
- Presenter tests cover filter ordering, transitions, interruption, alpha,
  outline preservation, and cleanup.
- Game A and Harness provide authored and browser-visible consumption.
