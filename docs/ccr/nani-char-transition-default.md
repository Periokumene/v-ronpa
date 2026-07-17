# Contract Change Request

## Requested Change

Define a compiler-owned 120 ms transition default for canonical layered-character `@char` commands when `time` is omitted.

## Affected Packages

- `packages/nani-runtime-compiler`
- authored Game A `.nani` content and generated script revision metadata
- Nani command and active character-pipeline documentation

`packages/contracts`, parser IR shape, RuntimeCommand shape, Pixi snapshot shape, saves, manifests, character packs, and
dependencies are unchanged.

## Why Existing Contract Is Insufficient

Layered expression replacement is a high-frequency authoring operation, but the current compiler omits `durationMs` unless
every `@char` repeats `time`. The Pixi stage model then correctly interprets the missing normalized value as zero, so authors
must duplicate pacing on every eye, mouth, arm, and effect change. This is noisy and permits one scene to drift between
200 ms and 250 ms for the same operation.

The default must be resolved before RuntimeCommand dispatch. Adding it in the stage model or presenter would also alter
direct RuntimeCommand callers and would force renderer code to infer authoring semantics from actor history.

## Proposed Shape

- `@char Character.Expression` without `time` compiles with `params.durationMs = 120`.
- Explicit numeric `time` remains authoritative: `time:0` is instantaneous and `time:0.3` compiles to 300 ms.
- Runtime expressions remain authoritative and continue to compile as a millisecond expression.
- `wait` remains opt-in. `wait!` on a defaulted `@char` uses the existing 120 ms actor-transition wait task.
- Initial entrances and special pacing declare `time` explicitly; the compiler does not infer whether a character already
  exists.
- `@slide`, `@arrange`, `@hideChars`, direct RuntimeCommand input, the Pixi stage-model fallback, and the presenter do not
  receive a second default.
- No compatibility field, upgrade layer, persisted-data migration, or app-specific timing option is introduced.

## Fixtures And Tests

- Compiler tests cover omitted `time`, explicit zero, explicit numeric duration, runtime-expression duration, and a
  non-`@char` timing command that remains unset.
- Game A keeps its initial 300 ms entrance explicit and removes repeated timing from token replacements.
- Generated script metadata is regenerated; the expression preload plan is unchanged while `scriptRevision` follows the
  canonical compiled script.
- Existing Alice browser smoke and a manual dialogue walk verify the shorter default through the current Pixi crossfade.

## Rebase Impact

Branches authoring layered `@char` should remove repeated 120 ms timing and retain explicit values only for intentional
overrides. Lower-level RuntimeCommand and Pixi branches require no change.
