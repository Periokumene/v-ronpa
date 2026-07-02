# Contract Change Request

## Title

Pixi stateful effect parameter transitions

## Status

- State: `Active`

## Why Existing Contract Is Insufficient

Stateful Pixi effect commands already declare `time`, but runtime behavior was
uneven. Some effects used `time` only for container opacity or wait task
lifecycle while their shader/filter parameters jumped immediately to the target
values. Scripts such as `@rain power:1 time:0.5` therefore could not rely on
`time` meaning a real parameter transition.

## Requested Runtime Semantics

- For stateful Pixi presentation effects, `time` drives live interpolation from
  the current rendered values to the target snapshot values.
- Covered commands are `rain`, `snow`, `sun`, `glitchFilter`, `bokeh`, and
  actor/stage `blur`.
- Continuous numeric parameters interpolate through the existing Pixi ticker and
  `TweenSystem`; discrete parameters such as `seed` and bokeh layout switch at
  transition start.
- `power:0 time:x` fades live power to zero before the renderer removes the
  effect record.

## Compatibility

No `.nani` grammar, `RuntimeCommand`, command catalog, or
`PixiStageSnapshot` schema change is required. The reducer continues to produce
terminal target snapshots; Pixi presenter owns transient live interpolation.
Transient one-shot effects such as `flash`, `glitch`, and `shake` keep their
existing duration semantics and are not part of this request.

## Regression Evidence

- Pixi presenter system tests cover rain live shader interpolation, interrupted
  rain transitions, snow shader controls, persistent glitch filter controls,
  bokeh overlay/root blur transitions, actor blur transitions, and fade-to-zero
  cleanup.
- Reducer tests preserve existing target snapshot and wait-task behavior while
  documenting bokeh removal hints for timed cleanup.
