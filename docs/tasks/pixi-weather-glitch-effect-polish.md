# Pixi Weather And Glitch Effect Polish

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/pixi-weather-glitch-effect-polish`

## Worktree Path

- Manual Git worktree suggestion: `.worktrees/pixi-weather-glitch-effect-polish`

## Status

- State: `Draft`
- Owner: `TBD`
- Created: `2026-06-24`
- Updated: `2026-06-24`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/pixi-weather-glitch-effect-polish.md`

## Worktree Environment

Run once after the worktree is created:

```bash
pnpm setup:worktree-env
```

This creates an ignored `.env.worktree` with a worktree-specific
`PORT/VITE_DEV_PORT`. Vite and Playwright both read this file so parallel
worktrees do not share the same dev server. Do not commit `.env.worktree`,
`.local-state/`, `test-results/`, or `playwright-report/`.

## Thread Startup Prompt

```text
你在 V-Ronpa 独立 worktree 中执行 docs/tasks/pixi-weather-glitch-effect-polish.md。
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/presentation-pipeline.md、docs/architecture/vn-runtime-dispatcher.md、docs/architecture/harness-gates.md、docs/ccr/pixi-presentation-task-lifecycle.md、docs/ccr/pixi-wait-parser-compiler-control-flow.md、以及本 task card。
先运行 pnpm setup:worktree-env；Vite/Playwright 会读取 .env.worktree 隔离端口，不要提交 .env.worktree、.local-state、test-results 或 playwright-report。
本线目标是打磨 Pixi rain / snow / glitch 等已接入表现效果。不要修改 story-engine 运行逻辑、story-play、runtimeWait、media/ui runtime 或非 Pixi taskcard 涉及的公共契约；CCR-backed command catalog 扩围可同步 contracts、nani-runtime-compiler 与下游 catalog pin test。
本线会与 docs/tasks/non-pixi-runtime-command-baseline.md 并行推进；Pixi 视觉、Pixi task、vertical-slice 视觉 smoke 由本线负责，非 Pixi runtime/media/UI 接入由另一线负责。
实现后运行 Required Gates，最终运行 BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-weather-glitch-effect-polish.md。
输出 changed files、测试结果、截图路径、残余风险。
```

## Goal

Polish the Pixi visual quality and task lifecycle for already-routed weather
and transient effects, with primary focus on:

- `rain`
- `snow`
- `glitch`

Secondary polish is allowed only where it directly affects those effects'
composition or cleanup:

- weather layer interaction with `sun`
- weather removal and consecutive wait cleanup
- bokeh/glitch composition boundary when the existing vertical-slice fixture
  disables bokeh before glitch

This task may change `@snow`, `@glitch`, and `@glitchFilter` command metadata
and compiler normalization only for the CCR-backed Shadertoy shader parameters
and persistent glitch filter command in
`docs/ccr/snow-shader-command-params.md` and
`docs/ccr/glitch-shader-command-params.md` and
`docs/ccr/glitch-filter-persistent-command.md`. It must not change `.nani`
parsing, `RuntimeCommand` top-level shape, StoryEngine state, `runtimeWait`,
media/UI command execution, or unrelated command catalog metadata.

## Current Architecture Summary

- Runtime commands are already compiled and routed to Pixi.
- `packages/pixi-presenter/src/stageSnapshot.ts` reduces `rain`, `snow`,
  `sun`, `glitch`, `bokeh`, `flash`, and `shake` into `PixiStageSnapshot`,
  render hints, wait tasks, and diagnostics.
- `packages/pixi-presenter/src/internal/systems.ts` owns actual Pixi systems:
  `WeatherSystem`, `TransientEffectSystem`, `FilterSystem`, `TweenSystem`, and
  task interaction.
- `packages/pixi-presenter/src/internal/fxAssets.ts` owns built-in effect
  textures such as `rain-streak` and `glitch-scanline`; snow is rendered by a
  shader overlay after this task's CCR-backed migration.
- Existing vertical-slice fixture already contains visual checkpoints for rain,
  snow, sun/blur, bokeh, glitch, rain+snow coexistence, and cleanup waits.
- Pixi wait is already expressed as `StoryPresentationWait.expectedTasks` and
  Pixi-local presentation tasks. This task may polish task timing correctness
  but must not redesign the contract.

## Target Architecture Summary

The target is visual and lifecycle polish inside the Pixi presenter:

- Rain should be visible, directional, layered, continuous, and not obscure
  actors.
- Snow should be visible, drifting, slower than rain, and clearly distinct from
  rain.
- Rain and snow should be able to coexist without either being deleted or hidden.
- Glitch should be immediately visible when the command emits a hint, with
  stronger scanline/noise/band/color separation at high power.
- Weather and glitch wait tasks should start, complete, and settle predictably.
- Cleanup commands such as `@rain power:0 wait!` and `@snow power:0 wait!`
  should remove visual layers and complete wait tasks without leaving inert
  children or stale filters.

## Parallel Non-Pixi Worktree Coordination

This task is designed to run in parallel with
`docs/tasks/non-pixi-runtime-command-baseline.md`. To minimize conflicts:

- Do not edit `packages/contracts/**` except the CCR-backed `@snow`,
  `@glitch`, and `@glitchFilter` catalog/snapshot fields for this task.
- Do not edit `packages/nani-runtime-compiler/**` except normalization for the
  CCR-backed `@snow`, `@glitch`, and `@glitchFilter` shader params.
- Do not edit `packages/story-engine/**` except the catalog pin expectation in
  `packages/story-engine/src/index.test.ts` when a CCR-backed implemented
  command is added.
- Do not edit `packages/story-play/**`.
- Do not edit `apps/game/src/vnRuntimeTransaction.ts`.
- Do not edit `apps/game/src/vnOutputRoutes.ts`.
- Do not edit `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.ts`
  unless a visual smoke harness cannot observe Pixi output without a narrowly
  scoped test-only hook. If this becomes necessary, stop and create an
  integration follow-up instead.
- Do not add `runtimeWait`, media runtime, UI runtime, or non-Pixi command
  behavior here.
- Do not change command catalog status or execution boundaries outside the
  CCR-backed `@snow`, `@glitch`, and `@glitchFilter` work.

## Boundary Decisions

### In Scope

- `WeatherSystem` visual quality for rain and snow.
- `TransientEffectSystem` visual quality for glitch.
- Pixi effect asset usage and deterministic procedural variation.
- Pixi wait task lifecycle for weather transitions and glitch.
- Unit tests for Pixi reducers and systems.
- Playwright smoke or screenshot evidence for visual Pixi checkpoints.
- Existing vertical-slice visual fixture text/checkpoint timing only if needed
  for stable visual evidence.

### Out Of Scope

- New Naninovel commands.
- `focus` implementation unless explicitly split into another Pixi task.
- Actor, background, character, slide, arrange, or portrait layout changes.
- Contract schema changes.
- SaveData changes.
- StoryEngine/runtimeWait changes.
- Media/UI adapter behavior.
- New third-party packages.
- New workspace packages.

### Command Scope

| Command | Scope |
|---|---|
| `rain` | Full visual polish, coexistence, removal, wait lifecycle. |
| `snow` | Full visual polish, coexistence, removal, wait lifecycle. |
| `glitch` | Full visual polish, high-power visibility, cleanup, wait lifecycle. |
| `sun` | Only weather layer compatibility and cleanup regression. |
| `bokeh` | Only regression boundary so disabled bokeh does not mask glitch. |
| `flash` / `shake` | Regression only; do not redesign. |
| `focus` | Out of scope unless a separate task updates this card. |

## Technical Selection

| Area | Decision |
|---|---|
| Rendering stack | Keep Pixi presenter and current Pixi/filter libraries. |
| Effect assets | Reuse built-in textures in `fxAssets.ts`; add generated/static assets only if committed under existing Pixi asset path and justified by visual tests. |
| Weather particles | Improve `WeatherSystem` particle count, scale, alpha, depth layers, tiling, speed, and wrapping within existing snapshot params. |
| Glitch | Replace `TransientEffectSystem.glitch` overlay sprites with the CCR-backed Shadertoy Morton shader filter, including duration and cleanup. Add `@glitchFilter` as the persistent screen-filter counterpart. |
| Wait tasks | Keep `StoryPresentationWaitTask` shape and existing task kinds. |
| Contracts | Only CCR-backed `@snow`, `@glitch`, and `@glitchFilter` shader/filter params. |
| Dependencies | No new dependencies. |
| App runtime | No runtimeWait/media/UI work. |

## Public Contract Changes

Expected only for `@snow`, `@glitch`, and `@glitchFilter`, backed by
`docs/ccr/snow-shader-command-params.md` and
`docs/ccr/glitch-shader-command-params.md` and
`docs/ccr/glitch-filter-persistent-command.md`.

Allowed public contract changes:

- `@snow` catalog params: `xSpeed`, `ySpeed`, `density`, `flakeScale`, `sway`,
  `fog`, `noise`, `seed`.
- `PixiWeatherSnapshot` optional fields with the same names.
- `@glitch` catalog params: `blockJump`, `burstJump`, `pixelScatter`,
  `colorNoise`, `speed`, `seed`.
- `@glitchFilter` catalog params: `power`, `time`, `easing`, `wait`,
  `blockJump`, `burstJump`, `pixelScatter`, `colorNoise`, `speed`, `seed`.
- `PixiStageSnapshot.screenFilters.glitch` persistent filter params with the
  same shader control names plus transition metadata.

Forbidden public contract changes:

- `RuntimeCommand` shape.
- `StoryRuntimeSnapshot`.
- `StoryPresentationWait`.
- `StoryPresentationWaitTask`.
- `PixiStageSnapshot` top-level schema.
- `PixiWeatherSnapshot` changes outside the `@snow` shader fields above.
- `commandCatalog` changes outside the `@snow`, `@glitch`, and
  `@glitchFilter` params above.
- `NaniCommandExecutionSchema`.
- `.nani` parser IR.

If any public shape change becomes necessary, stop and create a CCR instead of
widening this task.

## Module Internal Changes

### packages/pixi-presenter

Allowed files:

- `packages/pixi-presenter/src/stageSnapshot.ts`
- `packages/pixi-presenter/src/index.ts`
- `packages/pixi-presenter/src/index.test.ts`
- `packages/pixi-presenter/src/internal/systems.ts`
- `packages/pixi-presenter/src/internal/systemsTasks.test.ts`
- `packages/pixi-presenter/src/internal/presentationTasks.ts`
- `packages/pixi-presenter/src/internal/presentationTasks.test.ts`
- `packages/pixi-presenter/src/internal/fxAssets.ts`
- `packages/pixi-presenter/src/internal/assets/fx/snowflake-atlas.png`
- `packages/pixi-presenter/src/internal/effects.ts`
- `packages/pixi-presenter/src/internal/effects.test.ts`
- `packages/pixi-presenter/src/internal/presenterTrace.ts`
- `packages/pixi-presenter/src/internal/presenterTrace.test.ts`

Required work:

- Improve rain and snow particle visibility without overpowering actors.
- Make rain and snow coexist predictably.
- Ensure `power:0` removal tears down visual children and task records.
- Improve glitch overlay visibility and cleanup.
- Keep wait tasks compatible with existing `weather-transition` and `glitch`
  task kinds.
- Add or update package tests for reducer output, system task lifecycle, and
  cleanup behavior.

### apps/game vertical-slice visual evidence

Allowed files only if package tests are insufficient for visual proof:

- `apps/game/src/harness/fixtures/verticalSlice.ts`
- `tests/smoke/vertical-slice.spec.ts`
- `tests/smoke/vn-auto-skip.spec.ts`

Allowed work:

- Adjust visual checkpoint text or screenshot assertions for rain/snow/glitch
  evidence.
- Add focused screenshots for existing weather/glitch checkpoints.
- Do not change story flow semantics, command routes, runtime adapter behavior,
  save/load behavior, or non-Pixi UI behavior.

### docs

Allowed files:

- `docs/tasks/pixi-weather-glitch-effect-polish.md`
- `docs/archive/completed-tasks/pixi-weather-glitch-effect-polish.md` when
  archived.

Optional documentation updates:

- `docs/architecture/presentation-pipeline.md` only if final reviewer requests
  a short note about visual effect polish. Avoid this by default to reduce
  conflict with non-Pixi work.

## Allowed Paths

- `docs/tasks/pixi-weather-glitch-effect-polish.md`
- `docs/ccr/snow-shader-command-params.md`
- `docs/ccr/glitch-shader-command-params.md`
- `docs/ccr/glitch-filter-persistent-command.md`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/index.test.ts`
- `packages/nani-runtime-compiler/src/index.ts`
- `packages/nani-runtime-compiler/src/index.test.ts`
- `packages/story-engine/src/index.test.ts`
- `packages/pixi-presenter/src/stageSnapshot.ts`
- `packages/pixi-presenter/src/index.ts`
- `packages/pixi-presenter/src/index.test.ts`
- `packages/pixi-presenter/src/internal/systems.ts`
- `packages/pixi-presenter/src/internal/systemsTasks.test.ts`
- `packages/pixi-presenter/src/internal/presentationTasks.ts`
- `packages/pixi-presenter/src/internal/presentationTasks.test.ts`
- `packages/pixi-presenter/src/internal/fxAssets.ts`
- `packages/pixi-presenter/src/internal/assets/fx/snowflake-atlas.png`
- `packages/pixi-presenter/src/internal/effects.ts`
- `packages/pixi-presenter/src/internal/effects.test.ts`
- `packages/pixi-presenter/src/internal/presenterTrace.ts`
- `packages/pixi-presenter/src/internal/presenterTrace.test.ts`
- `apps/game/src/harness/fixtures/verticalSlice.ts`
- `tests/smoke/vertical-slice.spec.ts`
- `tests/smoke/vn-auto-skip.spec.ts`

## Forbidden Paths

- `packages/nani-parser/**`
- `packages/story-engine/src/index.ts`
- `packages/story-play/**`
- `packages/media-save/**`
- `packages/ui-kit/**`
- `apps/game/src/vnRuntimeTransaction.ts`
- `apps/game/src/vnOutputRoutes.ts`
- `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.ts`
- `apps/game/src/mediaRuntime.ts`
- `apps/game/src/uiRuntime.ts`
- `docs/tasks/non-pixi-runtime-command-baseline.md`
- `docs/ccr/non-pixi-runtime-command-baseline.md`
- `package.json`
- `pnpm-lock.yaml`

## Implementation Matrix

| Capability | Required behavior |
|---|---|
| Rain visibility | Rain lines are visible over backgrounds, directional, continuous, and not actor-obscuring. |
| Snow visibility | Snow flakes are slower, drifting, distinguishable from rain, and not actor-obscuring. |
| Coexistence | Rain and snow can both render when both snapshots exist. |
| Weather removal | `power:0` removes the target weather without deleting other weather kinds. |
| Weather wait | `wait!` weather transitions create and complete `weather-transition` tasks. |
| Glitch visibility | High-power glitch produces visible scanlines/bands/color split immediately. |
| Glitch cleanup | Glitch overlay and filters are removed after duration or forced settle. |
| Consecutive cleanup | Back-to-back weather cleanup waits complete without stale tasks. |
| Bokeh boundary | Disabled bokeh does not mask or weaken following glitch evidence. |

## Implementation Path

### Phase 1: Baseline inspection

- Run existing Pixi presenter tests.
- Capture current vertical-slice weather/glitch screenshots if smoke is used.
- Identify whether failures are reducer-level, system-level, or visual-only.

### Phase 2: Weather polish

- Tune `WeatherSystem` particle population, scale, alpha, wrapping, and layer
  placement for rain and snow.
- Ensure rain/snow/sun records are keyed and reconciled independently.
- Add tests for coexistence and independent removal.

### Phase 3: Glitch shader migration

- Replace `TransientEffectSystem.glitch` overlay sprites with the CCR-backed
  Shadertoy Morton/hash shader filter.
- Strengthen high-power address shuffle and random color replacement.
- Ensure overlay cleanup and task completion are deterministic.

### Phase 4: Wait lifecycle regression

- Verify weather remove hints create/complete tasks.
- Verify glitch wait tasks settle.
- Verify consecutive cleanup waits do not leave active tasks.

### Phase 5: Visual evidence

- Add or update smoke screenshots only if package tests cannot prove the visual
  quality target.
- Keep smoke changes focused on existing vertical-slice weather/glitch
  checkpoints.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Rain reducer state remains stable | `packages/pixi-presenter/src/index.test.ts` |
| Snow reducer state remains stable | `packages/pixi-presenter/src/index.test.ts` |
| Rain/snow coexist | Pixi presenter unit/system test |
| Independent weather removal | Pixi presenter unit/system test |
| Weather wait tasks complete | `systemsTasks.test.ts` or `presentationTasks.test.ts` |
| Glitch hint is emitted | Pixi presenter reducer test |
| Glitch system starts and cleans up task | `systemsTasks.test.ts` |
| High-power glitch visual is visible | Smoke screenshot or deterministic system assertion |
| Vertical-slice weather/glitch checkpoints remain usable | Playwright smoke only if changed |

## Regression Requirements

Required regression cases:

- Normal path: `@rain power:1` creates visible rain state and weather task when
  `wait!` is present.
- Normal path: `@snow power:1` creates visible snow state and weather task when
  `wait!` is present.
- Coexistence path: rain and snow can exist simultaneously.
- Boundary path: `@rain power:0` removes rain without removing snow.
- Boundary path: `@snow power:0` removes snow without removing rain.
- Boundary path: inactive weather removal creates no wait task.
- Boundary path: high-power glitch emits and completes a glitch task.
- Persistent path: `@glitchFilter` writes saveable screen filter state and
  one-shot `@glitch` remains transient.
- Cleanup path: one-shot and persistent glitch cleanup remove only their own
  root filters and preserve unrelated bokeh/weather filters.
- Contract path: public schema/catalog/compiler changes are limited to the
  CCR-backed `@snow`, `@glitch`, and `@glitchFilter` shader params.

Test placement:

- Pixi reducer tests: `packages/pixi-presenter/src/index.test.ts`
- Pixi system/task tests: `packages/pixi-presenter/src/internal/*.test.ts`
- Smoke tests: `tests/smoke/vertical-slice.spec.ts` only when visual evidence
  cannot be represented by package tests.

## Dependency Changes

None.

Do not edit:

- `package.json`
- `pnpm-lock.yaml`

If a new Pixi plugin, texture package, or visual asset pipeline is required,
stop and create a follow-up task. Do not add dependencies in this task.

## CCR Triggers

CCR is expected only for the Shadertoy snow/glitch shader command params and
the persistent `@glitchFilter` screen-filter command named above.

Create a CCR instead of widening this task if implementation needs:

- public contract changes outside the CCR-backed shader/filter params,
- `RuntimeCommand` shape changes,
- new weather/glitch command params outside the CCR-backed shader/filter params,
- new `StoryPresentationWaitTask` kind,
- `PixiStageSnapshot` schema changes,
- StoryEngine runtime changes or compiler changes outside the CCR-backed
  normalization paths,
- app runtime transaction changes.

## Required Gates

Local iteration gates:

```bash
pnpm setup:worktree-env
pnpm vitest run packages/pixi-presenter/src/index.test.ts
pnpm vitest run packages/pixi-presenter/src/internal/systemsTasks.test.ts
pnpm vitest run packages/pixi-presenter/src/internal/presentationTasks.test.ts
pnpm typecheck
pnpm validate:boundaries
```

If smoke screenshots are changed:

```bash
pnpm test:smoke
```

Merge gate:

```bash
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-weather-glitch-effect-polish.md
```

## Programmatic Acceptance

The implementation is programmatically acceptable when:

- Pixi presenter tests cover rain, snow, coexistence, removal, glitch, and wait
  tasks.
- Public contract/compiler changes are limited to the CCR-backed `@snow`,
  `@glitch`, and `@glitchFilter` shader/filter params.
- No dependency files are changed.
- Typecheck passes.
- Boundary validation passes.
- Merge gate passes with this task card.
- If smoke screenshots are changed, the smoke gate passes and screenshot paths
  are reported.

## Manual Acceptance

The reviewer should inspect that:

- Rain is visibly directional and continuous.
- Snow is visibly distinct from rain.
- Rain and snow coexist without burying actors.
- Glitch is visible immediately and materially stronger at high power.
- Cleanup commands remove weather/glitch visuals.
- Pixi wait task semantics stayed compatible with existing StoryEngine
  `presentationWait`.
- The diff stays out of non-Pixi runtime baseline files.

## Review Packet

- Changed files summary.
- Test and gate output.
- Regression coverage summary.
- Screenshot paths for rain/snow/glitch if smoke was used.
- Confirmation that no contracts, compiler, StoryEngine, story-play,
  `runtimeWait`, media runtime, or UI runtime files changed.
- Residual risks and follow-up task suggestions.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting this branch should only revert Pixi presenter visual/system changes
and optional visual smoke updates.

No save migration, runtime command shape migration, or media/UI cleanup should
be required.

## Done When

- Target Pixi effect polish stays within the command scope.
- Required regression tests pass.
- Smoke evidence is updated only if needed.
- No public contracts or non-Pixi runtime files are changed.
- Existing Pixi wait task semantics remain compatible.
- Summary includes changed files, verification, screenshots if applicable, and
  residual risks.
