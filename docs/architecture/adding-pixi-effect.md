# Adding a Pixi Effect

This guide is the bounded path for adding or removing a Pixi presentation
effect. It is intentionally concrete: do not introduce a plugin host, dynamic
self-registration, a runtime feature flag, or a second Presenter lifecycle.

## Choose The Owner First

| Behavior | Owner | Durable form |
|---|---|---|
| Rain, snow, sunlight, or another scene-wide environment | Weather family | `snapshot.weather` |
| A screen filter or overlay that persists across dialogue lines | Persistent screen family | `snapshot.screenFilters` |
| A short pulse such as flash, shake, or one-shot glitch | Transient family | `PixiStageRenderHint` |
| A filter that must participate in actor composition | Actor system with a dedicated effect controller | actor snapshot or actor-family state |
| Trial keyword/subtitle presentation | Trial overlay | Trial hint; not an effect registration |

Do not turn `back`, `char`, `slide`, `inback`, `arrange`, or `hideChars` into
effects. They remain actor/scene responsibilities. If a proposed effect changes
another effect—for example wind influencing both rain and snow—add an explicit
weather-family composition rule before implementing it; a leaf controller must
not mutate another controller.

## The Four Public-To-Private Touchpoints

For a new public `.nani` command, change these boundaries in order:

1. `packages/contracts`: declare the command, execution owner, parameters,
   defaults, consumed-parameter metadata, and structured Chinese command and
   parameter documentation. Document defaults, accepted values, units, ranges,
   target/removal semantics, and runnable examples in the catalog metadata. Add
   a CCR when the public contract changes.
2. `packages/nani-runtime-compiler`: add one normalizer that emits resolved
   `RuntimeCommand` values. Do not put rendering behavior here.
3. `packages/pixi-stage-model`: add a pure reducer under `src/effects/` and one
   entry in `pixiCommandReducerRegistry`. Choose snapshot state for persistent
   effects and a hint for transient effects; emit wait descriptors here.
4. `packages/pixi-presenter`: declare membership in `internal/effects/registries.ts`,
   add the effect controller/renderer beside its family, and add one typed entry
   to that family's existing registry. The family registry is the sole source
   used for dispatch and lifecycle traversal.

An internal rendering improvement to an existing command starts at step 4. A
new visual driven by an existing snapshot/hint normally starts at step 3 or 4;
do not create a public command merely to expose a private implementation choice.

Hard removal uses the same four touchpoints in reverse. Do not leave aliases,
deprecated stubs, hidden no-ops, or orphaned reducers/controllers unless a CCR
explicitly requires compatibility.

The generated effect reference in [VN Command Catalog](../nani/command-catalog.md)
is the authoring authority for both existing and newly added effects. It is
rendered from `commandCatalog`, which is also used by diagnostics, completion,
and hover. Batch design notes and development `.nani` demonstrations are not
command documentation and must not become a second source of defaults or
validation rules.

## Presenter Registration By Family

### Weather

- Add the kind to `WEATHER_EFFECT_KINDS`.
- Add its renderer factory and live-parameter mapping in
  `effects/weather/system.ts`.
- Put Pixi resources, shader state, tick, resize, and destroy in a dedicated
  `effects/weather/<effect>.ts` renderer.
- Choose `weather-back` or `weather-front` in the family dispatcher. The leaf
  must not change zIndex or attach itself outside the supplied container.

### Persistent screen

- Add the key to `PERSISTENT_SCREEN_EFFECT_KEYS` in desired root-filter order.
- Add one controller entry to `PersistentScreenEffectSystem.registry`.
- The controller owns its filter/overlay, live transition, task, resize, clear,
  and destroy. Its `getFilter()` is the only value exposed to the family.
- Never assign `root.filters` directly; use `RootFilterStack` so transient and
  unrelated persistent filters survive cleanup.

### Transient

- Add the hint type to `TRANSIENT_EFFECT_HINT_TYPES`.
- Add one controller entry to `TransientEffectSystem.registry`.
- The controller owns every task handle, tween, temporary display object, and
  filter it creates. Completion, cancellation, clear, and destroy must all
  converge on the same cleanup.
- Shake-like effects obtain targets through `TransientActorTargetResolver`; they
  do not read ActorSystem records.

### Actor effect

- Keep a dedicated controller such as `effects/blur.ts` or
  `effects/characterToneController.ts`.
- Integrate it explicitly at the actor composition point in `systems.ts`.
- Do not create a generic actor-effect plugin interface. Actor release and
  character composition/crossfade behavior must remain visible in ActorSystem.

## Allowed Imports And State

Stage reducers may import contracts and pure Stage helpers only. They may not
import Pixi, DOM, React, Presenter, asset loaders, or renderer dependencies.

Presenter leaf effects may import:

- Pixi and effect-private third-party rendering dependencies declared by
  `pixi-presenter`;
- mechanical shared modules: viewport/options, layers supplied by the family,
  tweening, presentation tasks, `RootFilterStack`, actor target resolution, and
  family-local `types.ts`;
- a narrowly shared shader constructor when persistent and transient variants
  implement the same visual algorithm, as with `glitchShader.ts`.

Leaf effects may not import sibling effects, family dispatchers, ActorSystem
internals, runtime, compiler, DOM, or App code. Only a family dispatcher imports
its leaves. `pnpm validate:boundaries` checks this direction automatically.

Persistent state belongs in the terminal Stage snapshot. Tween progress,
transient hints, live Pixi objects, and active tasks are never saved. On
`animate:false`, a persistent controller must apply the target state immediately
and transient/Trial content must remain empty.

## Required Lifecycle Contract

Every effect implementation must account for:

- first creation and immediate `animate:false` restore;
- parameter update and interruption from the current live value;
- family-update detection so an unrelated Stage revision does not replay a
  transition retained in terminal state;
- timed and immediate removal/no-op behavior;
- wait task completion and stale-handle cancellation;
- viewport resize without restarting the effect;
- repeat-safe `clear()` for Presenter reuse;
- `destroy()` for filters, textures owned by the effect, display objects, and
  family-attached resources;
- isolation: removing the effect does not clear a sibling, Trial overlay, actor,
  or unrelated root filter.

If an effect captures filter input, the capture is Presenter-private. Prefer a
bounded or half-resolution pooled RenderTexture, request a new capture only at
the semantic event boundary or resize, and return every texture exactly once on
replacement, settle, clear, and destroy. Actor filter owners must edit only the
filter they own; assigning `container.filters` from scratch can silently remove
an actor-targeted transient.

The family owns macro order and layer placement. The leaf owns resources and
visual behavior. Top-level `createPixiPresenter` must continue to call only
Actor, Weather, Persistent screen, Transient, and Trial lifecycles.

## Test Placement And Completion Checklist

- Contracts/compiler tests: catalog metadata (including non-placeholder Chinese
  docs, defaults, ranges, enums, units, and examples), normalized command,
  invalid input, and exact diagnostics.
- Stage effect test beside `pixi-stage-model/src/effects/`: snapshot or hint,
  wait task, removal/no-op, clamp, and unsupported parameters.
- Presenter leaf test beside the controller: creation, live interpolation,
  interruption, resize, clear, destroy, and owned resource cleanup.
- Family test: registration completeness/order and at least one sibling-isolation
  case.
- Runtime/Harness test when save/restore, wait observation, or real WebGL output
  changes. Continuous animation needs a before/after frame-change assertion;
  screenshots remain review evidence rather than the only automated oracle.
- Every test or development `.nani` script that demonstrates a newly added
  effect must include an in-script Chinese explanation of the intended visual
  result and the key parameters being exercised.

Before handoff, run the narrow tests first, then:

```bash
pnpm typecheck
pnpm validate:contracts
pnpm validate:boundaries
pnpm validate:command-docs
pnpm test
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
```

High-end effect labs may additionally record a hardware-qualified frame profile.
Keep hard budgets behind an explicit environment switch so software WebGL and
uncontrolled CI hardware still run functional smoke without pretending to be
the declared benchmark machine.

No new top-level tick/reconcile/resize/clear call is expected for an effect that
fits an existing family. If one appears necessary, stop and review the ownership
decision before adding it.
