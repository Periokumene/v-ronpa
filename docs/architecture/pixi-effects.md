# Pixi Effects Architecture

Pixi effects retain one directional four-layer pipeline:

```text
contracts declaration -> compiler normalizer -> pixi-stage-model reducer
                                             -> snapshot / hint / wait
                                             -> private pixi-presenter family
```

The Stage Model is pure. It may read `RuntimeCommand` and produce terminal
`PixiStageSnapshot`, transient render hints, wait descriptors, and diagnostics;
it must not import Pixi, DOM, React, or Presenter code. The Presenter consumes
only materialized snapshots and hints and never interprets script commands.

## Registration

`pixiCommandReducerRegistry` is the single Stage dispatch table. At module load
it is compared in both directions with every contracts entry whose status is
`implemented` and execution owner is `pixi-presentation`. A missing reducer or
an orphaned reducer is a startup error. Effect reducers live under
`packages/pixi-stage-model/src/effects`; actor and scene reducers may remain
family code but register through the same table.

The Presenter has fixed, family-specific registries:

| Family | Entries | Macro ownership |
|---|---|---|
| Weather | `rain`, `snow`, `sun` | back/front weather layers, lifecycle traversal |
| Persistent screen | `bokeh`, `waterVeil`, `pulse`, `staticFilter`, `glitch`, `vignette` | fixed root-filter order and isolated removal |
| Transient | `flash`, `shake`, `glitch`, `impact`, `afterimage`, `shutter`, `flicker` | hint dispatch and transient filter/overlay cleanup |
| Actor effect | blur, tone, `signalMask`, actor-targeted Afterimage | explicit composition/filter-stack ownership |
| Trial overlay | Trial keyword/subtitle | zIndex 31; independent of effect cleanup |

These are static tables, not a generic plugin host. Registration is deliberately
local and compile-time visible. Adding an effect changes its public declaration
and normalizer when public, one Stage reducer registration, one Presenter family
registration, and tests/docs. It does not add another top-level Presenter
tick/reconcile/resize/clear call.

For the concrete change checklist, decision rules, and allowed imports, see
[Adding a Pixi effect](adding-pixi-effect.md).

The private implementation map is intentionally concrete:

| Scope | Owner |
|---|---|
| Actor composition | `systems.ts`, `characters.ts`, `effects/actorFilters.ts`, and independent blur, tone, and signal-mask leaves |
| Weather family | `effects/weather/system.ts`, with separate rain/snow/sun renderers |
| Persistent screen | `effects/persistentScreen.ts` and its fixed controller registry |
| Transient family | `effects/transient/system.ts` and per-family finite controllers |
| Shared glitch mechanics | `effects/glitchShader.ts`; it contains no persistent or transient lifecycle |
| Trial | `effects/trialOverlay.ts`; it is not registered as an effect |

The bokeh controller owns root blur and overlay together, so both consume one
live transition and one presentation task and are removed atomically.

## Lifecycle And Isolation

Each effect owns its live values, transition, task handles, Pixi resources, and
cleanup. Effect leaf modules must not import one another or inspect/clear
another effect's records. A family dispatcher may import its registered leaves
only to construct them and forward lifecycle calls. Shared code is limited to
mechanical capabilities such as viewport, layers, tweening, presentation tasks,
root-filter stacking, actor target resolution, and shared shader construction
within the glitch family. `validate:boundaries` enforces these import rules and
prevents the Presenter entry or Actor system from bypassing family boundaries.

`clear()` cancels owned work and leaves the Presenter reusable. `destroy()` is
idempotent in practice, clears owned work, detaches family layers, and destroys
resources. Restore uses `animate:false`: tweens and non-hold tasks settle,
transient/Trial content is cleared, and persistent snapshot state is applied at
its terminal value. Hints, tween progress, and presentation tasks are never
restored from save data.

Weather back/front zIndex, persistent filter order, and transient/Trial zIndex
are family policy. Individual effects cannot change these macro relationships.
Cross-effect behavior such as future wind affecting rain and snow requires an
explicit family composition policy rather than private state mutation.

The current root-filter order is:

```text
bokeh -> waterVeil -> pulse -> staticFilter -> glitch -> vignette -> transient filters
```

Actor filters are a composed stack: a controller may add or remove only its own
filter. Reconciliation must preserve actor-local transient filters and other
controller-owned filters. Persistent controllers must also avoid replaying the
transition stored in an unchanged terminal snapshot when an unrelated Stage
family advances the global revision.

The fixed actor processing order is:

```text
character-internal tone/outline -> SignalMask -> Blur -> actor-local transient
```

SignalMask is attached once to the actor's outer composited container. Expression
crossfade carriers do not own copies, so outgoing and incoming expression layers
share one continuous full-character effect.

Every persistent controller uses the same lifecycle contract: typed terminal
comparison, strict no-op reconciliation, live-value interruption, timed removal
that survives unrelated revisions, reversal when re-enabled during removal,
immediate `animate:false` restore, and idempotent owned-resource cleanup. Pure
waiting is not synthesized from an identical terminal command.

## Authoring Documentation

`packages/contracts` command and parameter `docs` metadata is the single
authoring-documentation authority. The generated effect reference in
[VN Command Catalog](../nani/command-catalog.md) renders every implemented Pixi
effect—existing and newly added—with the same description, examples, required
parameters, defaults, ranges, enums, units, and runtime notes. Editor completion
and hover consume the same metadata.

Development `.nani` scripts are executable smoke and visual demonstrations, not
an alternative specification. Batch design records belong in `docs/archive` and
cannot define live command syntax, defaults, validation, lifecycle, or filter
order.

## Dependencies And Risk Removal

Contracts, compiler, Stage Model, and runtime remain renderer-independent.
Future private renderer dependencies may be declared only by
`pixi-presenter` and imported by the owning effect. There is no runtime effect
feature flag: risk is removed by deleting script calls or by deleting the four
explicit declaration/normalizer/reducer/family registration touchpoints.

## Automated Test Ownership

| Layer | Required evidence |
|---|---|
| Contracts/compiler | declaration and metadata, normalizer output, unknown-command rejection |
| Stage Model | registry invariant, snapshot/hint/wait/diagnostic behavior and no-op/removal paths |
| Presenter effect | creation, live interpolation, replacement, task completion, resize, clear, destroy |
| Presenter family | complete/unique registration, filter/layer order, cross-effect isolation |
| Runtime/shell | task observations and restore with no hint/tween/phantom wait |
| Harness/Playwright | terminal snapshot readout, active motion, cleanup, and screenshot evidence |

Pixel-difference smoke assertions prove that continuous animation is running;
region-level assertions additionally protect effect scope and source visibility.
Shader-strategy tests protect effect-specific processing invariants without
making shader source a public contract. These checks are not visual-style
baselines; retained screenshots remain human review evidence.
