# Non-Pixi Runtime Command Baseline

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/non-pixi-runtime-command-baseline`

## Worktree Path

- Manual Git worktree suggestion: `.worktrees/non-pixi-runtime-command-baseline`

## Status

- State: `Archived`
- Owner: `TBD`
- Created: `2026-06-24`
- Updated: `2026-06-27`
- Completed Commit: `128bb13`
- Archive Target: `docs/archive/completed-tasks/non-pixi-runtime-command-baseline.md`

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
你在 V-Ronpa 独立 worktree 中执行 docs/tasks/non-pixi-runtime-command-baseline.md。
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/vn-runtime-dispatcher.md、docs/architecture/contracts.md、docs/architecture/harness-gates.md、docs/nani/command-catalog.md、docs/nani/syntax-feature-report.md、以及本 task card。
先运行 pnpm setup:worktree-env；Vite/Playwright 会读取 .env.worktree 隔离端口，不要提交 .env.worktree、.local-state、test-results 或 playwright-report。
本线目标是完成第一批非 Pixi Naninovel 命令的最小可验证 runtime baseline。严格遵守 Boundary Decisions，不要扩大到 block flow、async tracks、generic actor/printer parity、media save persistence、新依赖或新 workspace package。
本线会与 Pixi 命令效果优化 task 并行推进；不要修改 packages/pixi-presenter、Pixi command reducer、Pixi visual behavior、vertical-slice smoke/harness 截图流，app 侧只能做 media/ui/runtimeWait 的 additive 接入。
实现后运行 Required Gates，最终运行 BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/non-pixi-runtime-command-baseline.md。
输出 changed files、测试结果、确认未改 smoke 截图、残余风险。
```

## Goal

Deliver a constrained non-Pixi runtime command baseline for the fixed first
batch of commands:

`print`, `append`, `resetText`, `clearBacklog`, `format`, `showPrinter`,
`showUI`, `hideUI`, `toast`, `wait`, `input`, `bgm`, `stopBgm`, `sfx`,
`sfxFast`, `stopSfx`, `movie`, `choice`, `clearChoice`, `set`, `goto`.

`stopVoice` remains declared-only in this task. It must not be promoted until a
future task also implements `voice` playback and tracked voice handles.

The implementation must preserve the existing Pixi presentation pipeline while
adding the smallest necessary StoryEngine, compiler, media, and UI runtime
support for these commands.

## Prepared Harness Media Assets

This task may use pre-seeded harness media fixtures for media command
validation. These assets are validation fixtures, not production content and
not resolver placeholder fallbacks.

| Asset id | Kind | Validation role |
|---|---|---|
| `bgm:validation-main` | `bgm` | Default BGM group playback |
| `bgm:validation-alt` | `bgm` | Same-group BGM replacement |
| `bgm:validation-layer` | `bgm` | Second BGM group coexistence |
| `bgm:validation-extra` | `bgm` | Reserved BGM resolver coverage |
| `sfx:rain-inside-car-loop` | `sfx` | Looping SFX tracking |
| `sfx:shock-fadeout` | `sfx` | One-shot or `sfxFast` playback |
| `sfx:knock-door` | `sfx` | One-shot SFX playback |
| `video:validation-intro` | `video` | Blocking movie playback |

Asset intake rules:

- Keep validation media under `apps/game/public/harness/media/{bgm,sfx,video}/`.
- Do not commit source-system junk files such as `.DS_Store`.
- Do not add new media formats for this task; use the prepared `.ogg` audio and
  `.mp4` video assets.
- Do not hard-code runtime file URIs in compiler, StoryEngine, or pure
  `mediaRuntime`; expose the ids through `ContentManifest.runtimeAssets` and
  the app-created resolver boundary.
- Future production assets must go through the project asset pipeline instead
  of reusing the harness validation folder.

## Harness Showcase Branch Plan

The vertical-slice `.nani` harness has two explicit branches:

- Branch 1: `#MainInteractionFlow`, the main interaction validation branch for
  this task card.
- Branch 2: `#PixiCommandShowcase`, the existing Pixi visual command
  validation branch.

Branch policy:

- Keep `#PixiCommandShowcase` focused on existing Pixi command visual
  validation.
- Use `#MainInteractionFlow` for this task card's future non-Pixi showcase
  commands after the corresponding runtime behavior and tests exist.
- The preparation edit may only rename/reword the old fast-exit branch into the
  main interaction branch and keep it as a short route/end path.
- Do not add the full showcase command sequence to `.nani` before the compiler,
  StoryEngine, media/UI runtimes, and adapter coverage are implemented.
- When the formal showcase is added, wire the prepared media ids through
  canonical `ContentManifest.runtimeAssets` declarations and update any
  choice-text smoke expectations in the same follow-up, not as an isolated
  pre-seed edit.

## Current Architecture Summary

- `packages/nani-parser` is command-agnostic and preserves raw command shape.
- `packages/contracts` owns `commandCatalog`, command metadata, runtime command
  schemas, story snapshots, save schemas, and public app contracts.
- `packages/nani-runtime-compiler` binds parsed command args to catalog
  definitions and normalizes command params into `RuntimeCommand`.
- `packages/story-engine` owns story state, variables, backlog, choices,
  `presentationWait`, and emitted `RuntimeCommand` records.
- `packages/story-play` owns manual/auto/skip pacing on top of StoryEngine
  stops.
- `apps/game/src/vnOutputRoutes.ts` already has route targets for `media`,
  `ui`, `app`, `pixi`, and `gameplay`.
- `apps/game/src/vnRuntimeTransaction.ts` currently consumes only Pixi and
  gameplay routes.
- `packages/pixi-presenter` already owns Pixi presentation reductions and
  `StoryPresentationWait.expectedTasks`.
- `packages/media-save` already contains Dexie save ports plus Howler
  `AudioPort` and HTML video `VideoPort` primitives.
- `GameInteractionShell` and `useOverlayPageAdapters` already centralize shell
  overlays such as backlog, settings, save/load, and pause.

## Target Architecture Summary

This task introduces only three public architecture additions:

1. Narrow StoryEngine `runtimeWait` for non-Pixi story blocking.
2. Minimal `StoryTextState` for current printer/text state.
3. Command execution boundaries for media and UI output.

The task does not introduce a second Pixi wait system, a generic async task
manager, a new scripting engine, a new parser IR, a new workspace package, or a
new third-party dependency.

### Runtime UI Surface Layering

This task may add non-Pixi UI surfaces, but it must not create a second visual
effects layer beside Pixi.

Layering rules:

- Shell overlays are user-driven menu surfaces: backlog, settings, save/load,
  and pause. They remain owned by `GameOverlayKind`, `GameOverlayHost`, and
  `useOverlayPageAdapters`.
- Runtime UI surfaces are script-driven non-Pixi surfaces: dialog visibility,
  command bar visibility, toast layer visibility, toast queue, input prompt,
  and movie overlay controls.
  They are owned by app-local `uiRuntime` state. `GameInteractionShell` is the
  single DOM runtime UI mount host; the vertical-slice harness scenario may
  only pass controlled props/events or provide an existing container, not create
  a second runtime UI host. `VnRuntimeDispatcher` remains a Pixi presentation
  dispatcher and must not own DOM runtime UI surfaces.
- Harness/debug surfaces are not runtime UI surfaces. Vertical-slice debug
  sidebar tabs, runtime readouts, inspector panels, Pixi task readouts, and
  harness-only status chips must remain visible/operable according to harness
  state and must not bind to `showUI` / `hideUI` visibility.
- Lifecycle-owned surfaces are not direct `showUI` / `hideUI` targets.
  `inputPrompt` is derived from `runtimeWait.kind="input"` and its
  submit/validation events;
  `movieOverlay` is derived from the media effect plus
  `runtimeWait.kind="movie"` when blocking.
- Pixi presentation remains the only owner of actor, scene, screen-filter,
  weather, flash, shake, glitch, and other visual effect commands.
- Do not add a new global overlay enum value for each script-driven runtime UI
  surface. Add to `GameOverlayKind` only for durable shell/menu overlays.
- Do not put runtime UI command rendering into `useOverlayPageAdapters`; that
  adapter remains for shell overlay pages and shared UI actions.
- `uiRuntime` must stay pure. React surfaces receive controlled props from the
  app adapter and must not own story state or command execution.

## Parallel Pixi Worktree Coordination

This task is designed to run in parallel with a Pixi command-effect
optimization task. To minimize merge conflicts:

- Do not edit `packages/pixi-presenter/**`.
- Do not change Pixi command reducer behavior, Pixi render hints, Pixi stage
  snapshot shape, Pixi presentation task keys, or Pixi visual tests.
- Do not change `actor`, `scene`, or `effect` category routing.
- Do not change command-specific Pixi routes for `back`, `char`, `arrange`,
  `hidechars`, `slide`, `blur`, `bokeh`, `rain`, `snow`, `sun`, `shake`,
  `glitch`, `flash`, `focus`, or `trialkeyword`.
- Do not change vertical-slice visual smoke flows or screenshot expectations in
  this task. Updating existing text assertions for the renamed main interaction
  branch is allowed when the harness script text changes.
- App transaction work must be additive: keep
  `createVnRuntimePresentationTransaction` behavior intact and build media/UI
  output around it.
- If completing this task requires changing Pixi presenter internals or visual
  smoke expectations, stop and create an integration follow-up instead of
  widening the task.

## Boundary Decisions

### runtimeWait Scope

`runtimeWait` is a StoryEngine-owned latch for cases where script execution
must stop and the stop is neither a Pixi presentation wait nor a pending
choice.

Allowed `runtimeWait` service commands in this task:

| runtimeWait kind | Command | Completion source |
|---|---|---|
| `pause` | `wait` | timer, confirm input, or timer-or-confirm |
| `input` | `input` | input prompt submit |
| `movie` | `movie` when blocking | video ended or explicit skip |

Forbidden `runtimeWait` uses in this task:

- Do not use `runtimeWait` for `bgm`, `stopBgm`, `sfx`, `sfxFast`, `stopSfx`,
  or `stopVoice`.
- Do not use `runtimeWait` for `showUI`, `hideUI`, `toast`, or
  `showPrinter`.
- Do not use `runtimeWait` for `print` stops.
- Do not use `runtimeWait` for `choice`; choices continue to use
  `pendingChoices`.
- Do not use `runtimeWait` for Pixi `wait!`; Pixi continues to use
  `presentationWait`.

### Pixi Wait Boundary

Pixi already has a wait design:

- `StoryRuntimeSnapshot.presentationWait`
- `StoryPresentationWait.expectedTasks`
- `packages/pixi-presenter` wait task descriptors
- `apps/game` observation of Pixi task completion
- `PRESENTATION_COMPLETE` resume event

This task must not rename, replace, generalize, or route Pixi wait through
`runtimeWait`.

Boundary:

| Mechanism | Owner | Serves | Completion |
|---|---|---|---|
| `presentationWait` | Pixi presentation pipeline | actor/scene/effect `wait!` | Pixi task observed complete |
| `runtimeWait` | StoryEngine + app adapter | `wait`, `input`, blocking `movie` | timer/input/video complete |
| `pendingChoices` | StoryEngine | `choice` | user selects choice |
| story-play schedule | story-play | auto/skip after normal stops | delay expires |

Runtime wait completion invariants:

- `RUNTIME_WAIT_COMPLETE` must validate the active `runtimeWait.kind` before
  clearing it.
- Manual confirm may clear only `runtimeWait.kind="pause"` when the wait mode
  allows confirm.
- Manual confirm must not clear `runtimeWait.kind="input"`.
- Movie skip may clear `runtimeWait.kind="movie"` only after the app adapter
  has stopped or settled the video overlay.
- A completion event that does not match the active wait kind must keep
  `runtimeWait` active and emit `invalid-runtime-wait-completion`.
- `SUBMIT_INPUT` is the only event that may clear `runtimeWait.kind="input"`;
  invalid typed values must keep the wait active and emit `input-validation`.

### Manual / Auto / Skip Boundary

When `runtimeWait` exists:

- `story-play.selectStoryPlaySchedule` must return idle.
- story auto mode must not advance through `runtimeWait`.
- story skip mode must not advance through `runtimeWait` without an explicit
  runtime wait completion event.
- manual confirm may complete `wait` when its mode allows confirm.
- manual confirm must not submit `input`.
- manual confirm may request video skip, but the adapter must stop/settle video
  first and then clear `runtimeWait`.

### Save Boundary

This task does not add top-level media state to `SaveData`.

- Story additive fields are part of `StoryRuntimeSnapshot`.
- App capabilities should prevent normal user save while `runtimeWait` is
  active.
- No active media playback restoration is required.
- No SaveData version bump is expected unless contract tests prove it is
  required.

Save and restore invariant:

- Because schemas allow additive `StoryRuntimeSnapshot.runtimeWait` but this
  task does not restore active media playback, app restore code must not
  silently resume half-restored runtime waits. If a development save contains
  `runtimeWait`, the app adapter must either restore a controlled blocked UI
  state or clear the wait with a diagnostic. Choose one behavior and cover it
  in adapter tests.

### Naninovel Parity Boundary

This task implements a constrained runtime baseline, not full Naninovel parity.

Out of scope:

- `if`, `else`, `endIf`, `or`, `unless`, `while`, `group`, `random`,
  `gosub`, `return`, `async`, `await`, `sync`, `stop`.
- Parser child-block IR.
- Generic actor/printer prefab parity.
- Rich text / arbitrary HTML formatting.
- Cross-script `goto` execution.
- Media save/restore.
- New third-party expression engine.

Unsupported parameters must produce diagnostics instead of silent behavior.

## Technical Selection

| Area | Decision |
|---|---|
| Story semantics | Keep `packages/story-engine` pure, immutable, renderer-independent. |
| Runtime command bridge | Keep existing `RuntimeCommand` shape. Do not add command-specific wire objects. |
| Wait model | Add narrow `StoryRuntimeWait`; keep Pixi `presentationWait`. |
| Text/printer state | Add minimal `StoryTextState` to story snapshot. |
| Media runtime | Start app-local in `apps/game/src/mediaRuntime.ts`; do not add `packages/media-runtime` in this task. |
| Audio | Reuse Howler through existing `packages/media-save` primitives and add the required `AudioHandle.fadeOutAndStop(durationMs: number): void` API in `packages/media-save`; do not hide fade-stop behind an app-local wrapper. |
| Video | Use `HTMLVideoElement` through existing `VideoPort` concept. |
| UI | Use React and existing Radix dependency; add pure `ui-kit` surfaces only where needed. |
| Expression | Extend existing story expression/evaluator code with safe assignment handling; do not use `eval` or add `angular-expressions`. |
| Dependencies | No new third-party dependencies. No `package.json` or `pnpm-lock.yaml` edits. |
| Workspace packages | No new workspace package in this task. |

## Public Contract Changes

This task requires a CCR because public contracts change.

Create:

- `docs/ccr/non-pixi-runtime-command-baseline.md`

Allowed contract changes:

### NaniCommandExecution

Add only:

- `media-output`
- `ui-output`

Do not add `app-control` in this task.

### StoryRuntimeWait

Add a narrow discriminated union:

```ts
export const StoryRuntimeWaitSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pause"),
    commandId: z.literal("wait"),
    commandIndex: z.number().int().nonnegative(),
    mode: z.enum(["timer", "confirm", "timer-or-confirm"]),
    durationMs: z.number().int().nonnegative().optional()
  }),
  z.object({
    kind: z.literal("input"),
    commandId: z.literal("input"),
    commandIndex: z.number().int().nonnegative(),
    variableName: z.string().min(1),
    valueType: z.enum(["string", "number", "boolean"]).default("string"),
    summary: z.string().optional(),
    defaultValue: StoryScalarSchema.optional()
  }),
  z.object({
    kind: z.literal("movie"),
    commandId: z.literal("movie"),
    commandIndex: z.number().int().nonnegative(),
    moviePath: z.string().min(1),
    allowSkip: z.boolean().default(true)
  })
]);
```

### StoryTextState

Add minimal current text/printer state:

```ts
export const StoryTextStateSchema = z.object({
  printerId: z.string().default("default"),
  visible: z.boolean().default(true),
  current: z
    .object({
      speaker: z.string().optional(),
      text: z.string(),
      formatId: z.string().optional()
    })
    .optional(),
  formats: z.record(z.string(), z.string()).default({})
});
```

Text state authority:

- `StoryTextState.current` is the current dialog display authority.
- `backlog` remains the historical log authority.
- `selectCurrentStoryLine` and app dialog rendering must prefer
  `state.text.current` and fall back to the latest backlog entry only for old
  snapshots.
- `append` must update `text.current.text` without creating a new backlog
  entry.
- `resetText` must clear `text.current` without clearing backlog.
- `clearBacklog` must clear backlog without clearing `text.current`.
- New code that needs the current visible line must use
  `selectCurrentStoryLine` instead of reading `backlog.at(-1)` directly.

### StoryRuntimeSnapshot

Add optional fields:

```ts
runtimeWait: StoryRuntimeWaitSchema.optional()
text: StoryTextStateSchema.optional()
```

### StoryChoiceOption

Add only:

```ts
id: z.string().optional()
enabled: z.boolean().default(true).optional()
setExpression: z.string().optional()
```

Do not add `handlerId`, nested choice trees, button skinning, or choice handler
actor fields in this task.

### commandCatalog

Target commands may be promoted to `implemented` only when the command has:

- compiler normalization,
- StoryEngine or adapter behavior,
- diagnostics for unsupported params,
- regression tests.

Execution mapping:

| Execution | Commands |
|---|---|
| `story-control` | `print`, `append`, `resetText`, `clearBacklog`, `format`, `showPrinter`, `wait`, `input`, `choice`, `clearChoice`, `set`, `goto` |
| `ui-output` | `showUI`, `hideUI`, `toast` |
| `media-output` | `bgm`, `stopBgm`, `sfx`, `sfxFast`, `stopSfx`, `movie` |

Media catalog parameter additions:

- Add V-Ronpa compatibility param `group:string` to `stopBgm`.
- Add V-Ronpa compatibility param `group:string` to `stopSfx`.
- Mark these params with `source: "v-ronpa"` so group-targeted stops are
  explicit without pretending they are Naninovel official params.
- Do not add new stop-all, wildcard, bus, mixer, or priority params in this
  task.

Routing authority invariants:

- `commandCatalog.execution` is the semantic authority for command ownership.
- `VnOutputRouteTable` is only the app fanout projection of emitted
  `RuntimeCommand` records.
- Add tests that compare target command catalog execution values with route
  output so `media-output` commands route to media, `ui-output` commands route
  to UI, and Pixi presentation commands continue to route to Pixi.
- Story-control commands must not reach UI/media through category fallback just
  because their catalog category is `ui`, `media`, `state`, or `flow`.
- `movie` is a two-stage command: StoryEngine owns the blocking decision and
  `runtimeWait.kind="movie"` creation, while app media/UI runtimes own playback,
  overlay state, skip/ended completion, and diagnostics. A blocking `movie`
  must still produce the app-visible media/UI output needed to start playback.

## Module Internal Changes

### packages/contracts

Allowed files:

- `packages/contracts/src/index.ts`
- `packages/contracts/src/index.test.ts`

Required work:

- Add CCR-backed schemas above.
- Update `NaniCommandExecutionSchema`.
- Update `commandExecutions`.
- Promote target commands only with tests.
- Add schema tests for backward-compatible parsing of old story snapshots
  without `runtimeWait` or `text`.
- Add tests that `media-output` and `ui-output` command definitions validate.

### packages/nani-runtime-compiler

Allowed files:

- `packages/nani-runtime-compiler/src/index.ts`
- `packages/nani-runtime-compiler/src/index.test.ts`

Required work:

- Add normalizers for all target commands.
- Convert Naninovel seconds params:
  - `time` -> `durationMs`
  - `fade` -> `fadeMs`
- Normalize primary args:
  - `@bgm Theme` -> `bgmPath`
  - `@sfx Click` -> `sfxPath`
  - `@movie Intro` -> `moviePath`
  - `@toast Hello` -> `text`
  - `@wait i5` -> `waitMode`
- Normalize `group` for `bgm`, `sfx`, `sfxFast`, `stopBgm`, and `stopSfx`
  without adding a separate media handle wire shape.
- Preserve `sourceCommand`.
- Emit diagnostics for unsupported params.

Do not change `.nani` parser IR.

### packages/story-engine

Allowed files:

- `packages/story-engine/src/index.ts`
- `packages/story-engine/src/index.test.ts`

Required work:

- Add `StoryStopReason = "runtime-wait"`.
- Add diagnostics for:
  - `runtime-wait`
  - `invalid-runtime-wait-completion`
  - `input-validation`
  - unsupported command params as needed.
- Add events:

```ts
| { type: "RUNTIME_WAIT_COMPLETE"; script: RuntimeScript }
| { type: "SUBMIT_INPUT"; script: RuntimeScript; value: string | number | boolean }
```

- Block `advanceToNextStop` and `storyReducer` while `runtimeWait` exists.
- Implement story-control target commands:
  - `print`
  - `append`
  - `resetText`
  - `clearBacklog`
  - `format`
  - `showPrinter`
  - `wait`
  - `input`
  - `choice`
  - `clearChoice`
  - `set`
  - `goto`
- For `format`:
  - StoryEngine stores format registrations and selected `formatId` as opaque
    state only.
  - UI surfaces interpret any visual styling. StoryEngine must not parse CSS,
    HTML, DOM nodes, or rich text markup.
  - Unknown or unsupported format templates are diagnostics/no-op, not fallback
    styling.
- For `clearChoice`:
  - No params clears all pending choices.
  - `id` clears only the matching `StoryChoiceOption.id`.
  - Missing `id` matches are diagnostic/no-op.
  - `handlerId` and `hide` remain unsupported params with diagnostics in this
    task.
- For `movie`:
  - StoryEngine only interprets the blocking flag and creates
    `runtimeWait.kind="movie"` when blocking.
  - Actual playback belongs to media/UI adapter.
- For `goto`:
  - Only local labels are executable in this task.
  - Cross-script targets, empty targets, and missing local labels are
    diagnostics/no-op; do not silently treat them as successful jumps.
- Add selectors:
  - `selectCurrentStoryLine` should prefer `state.text.current` and fall back
    to backlog.

Do not import React, DOM, Pixi, R3F, Dexie, Howler, or app code.

### packages/story-play

Allowed files:

- `packages/story-play/src/index.ts`
- `packages/story-play/src/index.test.ts`

Required work:

- Treat `story.runtimeWait` like a hard block in schedule selection.
- `selectStoryPlaySchedule` must return idle when `runtimeWait` exists.
- Auto mode must not advance through `runtimeWait`.
- Skip mode must not advance through `runtimeWait` without an explicit
  completion event.
- Current-stop derivation should read StoryEngine-selected current line, not
  command logs where possible.

### apps/game runtime transaction

Allowed files:

- `apps/game/src/vnOutputRoutes.ts`
- `apps/game/src/vnOutputRoutes.test.ts`
- `apps/game/src/vnRuntimeTransaction.ts`
- `apps/game/src/vnRuntimeTransaction.test.ts`

Required work:

- Keep existing `createVnRuntimePresentationTransaction` behavior intact.
- Add `createVnRuntimeOutputTransaction` or equivalent wrapper that includes:
  - existing Pixi reduction by delegating to the current presentation
    transaction path,
  - gameplay events,
  - media commands/effects,
  - UI commands/events,
  - diagnostics.
- Do not route Pixi wait tasks through `runtimeWait`.
- Do not change Pixi route entries, Pixi command categories, Pixi wait task
  descriptors, Pixi stage snapshots, or Pixi render hint behavior.
- Add tests proving `media-output` routes to media, `ui-output` routes to UI,
  and Pixi commands still route to Pixi through the existing route behavior.

### apps/game media runtime

Allowed files:

- `apps/game/src/mediaRuntime.ts`
- `apps/game/src/mediaRuntime.test.ts`
- `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.ts` only for app
  adapter media effect application.
- `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.test.ts` only for
  adapter media coverage.

Required work:

- Implement app-local pure media reducer and effect descriptors.
- Supported commands:
  - `bgm`
  - `stopBgm`
  - `sfx`
  - `sfxFast`
  - `stopSfx`
  - `movie`
- First version media state is app-local and not persisted in `SaveData`.
- One-shot SFX and `sfxFast` must not enter saveable state.
- Looping SFX may be tracked app-locally only.
- Diagnostics for missing path/unknown handle should be non-throwing.

Media resource management invariants:

- Runtime chain:
  `.nani command -> compiler canonical params -> StoryEngine resolved RuntimeCommand -> vnRuntime output transaction -> pure mediaRuntime effect descriptors -> app adapter resolver -> AudioPort/VideoPort imperative calls`.
- Ownership boundaries:
  - Compiler normalizes params only.
  - StoryEngine never loads media and never stores media handles.
  - `mediaRuntime` stays pure, stores no Howler instances, DOM nodes, or
    `AudioHandle` objects, and only returns state/effect descriptors.
  - App adapter owns asset resolution, live audio/video refs, and imperative
    `AudioPort` / `VideoPort` calls.
- BGM is group-tracked:
  - BGM track key is `group ?? "bgm"`.
  - Multiple BGM groups may be active at once.
  - A new `bgm` replaces only the currently active BGM in the same group.
  - `stopBgm` targets `group ?? "bgm"`; `bgmPath` may be preserved for
    diagnostics and source compatibility but must not create a second tracking
    authority.
  - If same-group replacement or `stopBgm` includes `fadeMs`, `mediaRuntime`
    emits a fade-stop descriptor for the previous tracked BGM key; the app
    adapter calls `AudioHandle.fadeOutAndStop` and releases the live handle ref.
  - If no `fadeMs` is present, `mediaRuntime` emits an immediate stop
    descriptor; the app adapter calls `AudioHandle.stop` and releases the live
    handle ref.
- SFX tracking:
  - One-shot `sfx` is effect-only and untracked.
  - `sfxFast` is always effect-only and untracked.
  - Only `sfx loop:true` may enter app-local tracked state.
  - Looping SFX tracking key is `group ?? sfxPath`.
  - `stopSfx` resolves the same key with `group ?? sfxPath` and stops only
    tracked looping SFX.
  - Unknown stop keys produce diagnostics and no-op.
- Asset path policy:
  - `bgmPath`, `sfxPath`, and `moviePath` remain source refs until app adapter
    resolution.
  - The adapter resolver input must be explicit and app-boundary owned:
    `sourceRef`, media `kind` (`"bgm" | "sfx" | "voice" | "video"`), and the
    app-created `AssetResolver`. The resolver must not import a global manifest
    or load assets by itself.
  - Lookup keys are exact and case-sensitive. Do not normalize slashes, trim
    extensions, derive basenames, or treat command paths as catalog groups.
  - Lookup source:
    1. `ContentManifest.runtimeAssets` is the only runtime-loading authority.
       `sourceRef` must match `RuntimeAsset.id`; matching `kind` is required;
       the app resolver returns `RuntimeAsset.optimizedUri`.
    2. Manifest `assets` and `RuntimeScript.assets` are id-only dependency
       declarations. They can be validated, but they do not carry URLs and are
       not fallback loading catalogs.
    3. Raw URI-like refs (`/`, `./`, `../`, `http://`, `https://`, `data:`, or
       `blob:`) are rejected as asset diagnostics.
  - Missing or unresolvable media source is an asset diagnostic plus no-op.
  - Do not add or play placeholder media resources in this task; the prepared
    harness media files are explicit validation assets only.
- Validation asset declaration policy:
  - The normal harness showcase path should declare all prepared validation ids
    as `ContentManifest.runtimeAssets` entries with stable `id`, matching
    `kind`, app-loadable `optimizedUri`, format, and empty `compression`.
  - Adapter resolver unit tests should use mock `AssetResolver` instances;
    manifest `AssetRef` and `RuntimeScript.assets` can be tested as dependency
    declarations but not as URL fallbacks.
  - The prepared movie fixture id is `video:validation-intro` with
    `kind:"video"`; normal validation must resolve it through canonical runtime
    asset registration and must not rely on raw URI inputs.
  - Do not introduce a second ad hoc media catalog file; use
    `ContentManifest.runtimeAssets` plus the app-created `AssetRegistry`.
  - The app adapter must be able to resolve all prepared asset ids without raw
    URI fallback in the normal validation path.
- Movie validation policy:
  - `apps/game/public/harness/media/video/movie-validation-intro.mp4` is the
    canonical harness video fixture for this task.
  - `video:validation-intro` must resolve through the adapter resolver before
    playback. Do not reference the public `optimizedUri` directly from
    compiler, StoryEngine, pure mediaRuntime, or `.nani`.
  - `movie` playback uses the existing `VideoPort` / `HTMLVideoElement`
    boundary. Do not route movie playback through Pixi or add a cinematic
    effect system in this task.
  - Movie UI surfaces may host the `HTMLVideoElement`, but the app adapter and
    `VideoPort` own `src`, `play`, and `stop`. Do not create a second playback
    path by letting the UI surface assign media sources directly.
  - Blocking `movie` completion is two-step: media/UI adapter settles ended or
    skipped playback, then dispatches the matching runtime-wait completion.
- Future `.nani` validation should include this media sequence:
  - Start `@bgm bgm:validation-main group:music volume:0.45 fade:0.2`.
  - Start `@sfx sfx:rain-inside-car-loop group:rain loop:true volume:0.35`.
  - Play one-shot `@sfx sfx:knock-door volume:0.9`.
  - Replace the same BGM group with
    `@bgm bgm:validation-alt group:music volume:0.45 fade:0.5`.
  - Start a second BGM group with
    `@bgm bgm:validation-layer group:ambient volume:0.25 fade:0.1`.
  - Play `@sfxFast sfx:shock-fadeout volume:0.75`.
  - Play blocking movie with `@movie video:validation-intro block:true`.
  - Stop looped SFX with `@stopSfx group:rain fade:0.2`.
  - Stop BGM groups with `@stopBgm group:music fade:0.5` and
    `@stopBgm group:ambient fade:0.2`.
- Adapter diagnostics:
  - App adapter asset resolution misses use the runtime diagnostic source
    `"asset"`.
  - Media runtime diagnostics use source `"media"` for media-owned failures
    such as missing tracked stop targets and caught `AudioPort` / `VideoPort`
    failures.
  - Required diagnostic codes include `asset-missing` / `raw-uri-disallowed`
    for resolver misses or raw path refs, `media-handle-missing` for missing
    tracked stop targets, and `media-port-error` for caught `AudioPort` /
    `VideoPort` failures.
  - Compiler diagnostics remain compiler-owned, StoryEngine diagnostics remain
    story-owned, and transaction routing diagnostics remain transaction-owned.
- Unsupported media params:
  - Media `wait!` never creates `runtimeWait` or `presentationWait`.
  - Media `wait!` must produce an unsupported-param diagnostic.
  - `intro`, advanced `restart` / `additive`, and other unsupported Naninovel
    audio parity params stay diagnostic unless implemented with tests in this
    task.

### apps/game UI runtime

Allowed files:

- `apps/game/src/uiRuntime.ts`
- `apps/game/src/uiRuntime.test.ts`
- `apps/game/src/VnRuntimeDispatcher.tsx` only for keeping Pixi rendering
  separate from the DOM runtime UI host; do not change Pixi layer/readouts/visual
  flow.
- `apps/game/src/interaction/GameInteractionShell.tsx`
- `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.ts`
- `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.test.ts`
- `apps/game/src/interaction/useVerticalSliceSaveAdapter.ts` only for
  preventing runtimeWait persistence in normal saves.
- `apps/game/src/interaction/useVerticalSliceSaveAdapter.test.ts` only for
  runtimeWait save/no-persist coverage.
- `apps/game/src/harness/scenarios/vertical-slice/**` only for passing
  controlled runtime UI props/events through the existing shell boundary

Required work:

- Implement app-local UI runtime state/events:
  - visible UI groups,
  - toast queue,
  - input prompt state,
  - movie overlay state.
- Direct UI-output commands:
  - `showUI`
  - `hideUI`
  - `toast`
- Lifecycle-derived surfaces:
  - `inputPrompt` state is derived from StoryEngine `runtimeWait.kind="input"`
    and cleared only by valid input submission.
  - `movieOverlay` state is derived from media playback effects and, when
    blocking, StoryEngine `runtimeWait.kind="movie"`.
- Toast lifecycle:
  - `uiRuntime` may store the transient toast queue.
  - App adapter owns dismiss actions and duration timers.
  - `toastLayer` visibility suppresses rendering only. Toast duration timers
    continue while the layer is hidden; hidden toasts may expire before the layer
    is shown again.
  - Toasts must not create story waits, shell overlays, save data, or a second
    global notification manager.
- `showUI` / `hideUI` must use a v1 whitelist:
  - `dialog`
  - `commandBar`
  - `toastLayer`
- The whitelist names concrete player-facing runtime surface groups only. There
  is no standalone production `hud` surface in this task; `hud` must be
  unsupported/diagnostic, not a hidden alias for dialog, command bar, toast
  layer, vertical-slice harness/debug HUD, debug sidebar, runtime readouts,
  inspector panels, or other surfaces that will not exist in the shipped game
  UI.
- No-target `@hideUI` / `@showUI` are scoped all-runtime-UI commands for this
  project: they hide/show `dialog`, `commandBar`, and `toastLayer` only. They do
  not touch shell overlays, debug surfaces, Pixi, inputPrompt, movieOverlay, or
  Trial UI.
- Multi-target Naninovel `uINames` parity is not implemented in this task.
  Authors may issue multiple `@hideUI <target>` / `@showUI <target>` commands
  instead; comma-joined or list-like targets must not be silently split by the
  app runtime.
- `hideUI` must share the same `uiRuntime.visible` authority as `showUI`; it
  defaults the targeted group to hidden and must not create a separate command
  state, overlay host, or fallback routing path.
- `showUI` / `hideUI` must not directly show or hide lifecycle-owned surfaces
  such as `inputPrompt` or `movieOverlay`; those targets must produce
  diagnostics or no-op until a dedicated contract defines direct control.
- `trialOverlay` is not a v1 `showUI` / `hideUI` target; attempts to target
  trial UI must produce diagnostics or no-op until a Trial-owned task defines
  that contract.
- Do not allow script commands to hide or replace core shell safety controls.
- Do not model `toast`, `inputPrompt`, or `movieOverlay` as shell
  `GameOverlayKind` entries. They are runtime UI surfaces controlled by
  `uiRuntime` state.
- Mount runtime UI surfaces in `GameInteractionShell` as the single DOM runtime
  UI host. The
  vertical-slice harness scenario may pass controlled props/events through the
  existing adapter boundary, but must not create a parallel overlay host or a
  second presentation/effects layer.
- Harness debug panels may read runtime state for diagnostics, but they must
  not become script-controlled UI. `showUI` / `hideUI` must not hide or show the
  vertical-slice debug sidebar, runtime controls, inspector, Pixi readouts, or
  harness-only objective/status chips.
- Changes to `useVerticalSliceRuntimeAdapter.ts` must be limited to
  media/ui/runtimeWait state and completion wiring. Do not change Pixi stage
  runtime state shape, Pixi hint sequencing, Pixi task observation, or
  `completePresentationWaitAndAdvance` semantics.

### packages/ui-kit

Allowed files:

- `packages/ui-kit/src/**`
- `packages/ui-kit/src/**/*.test.tsx` if test setup exists

Required work:

- Add pure reusable surfaces only if needed by app adapter:
  - `VnToastHost`
  - `VnInputPromptSurface`
  - `VnMovieOverlay`
- Components must be controlled by props.
- Components must not own story state or command execution.
- Reuse the existing `GameInteractionSurfaces` / `VnDialogSurface` style and
  shell conventions where practical. Do not add one-off overlay frameworks,
  portals, or per-command host systems for this task.

### packages/media-save

Allowed files:

- `packages/media-save/src/index.ts`
- `packages/media-save/src/index.test.ts`

Required work:

- Add `AudioHandle.fadeOutAndStop(durationMs: number): void`.
- `stopBgm` and `stopSfx` with `fadeMs` must use `fadeOutAndStop`; immediate
  stops may continue to use `stop`.
- `fadeOutAndStop(0)` must be equivalent to immediate `stop()`.
- `stop()` and `fadeOutAndStop()` must be idempotent.
- `stop()` must cancel any pending fade cleanup timer for that handle.
- Repeated `fadeOutAndStop()` calls must not leak timers, double-release the
  same handle, or leave the handle registered after the final stop.

Forbidden:

- Do not add media persistence.
- Do not change save schema ownership.
- Do not add public placeholder media files; prepared harness validation assets
  must not be used as missing-media fallbacks.

## Allowed Paths

- `docs/tasks/non-pixi-runtime-command-baseline.md`
- `docs/ccr/non-pixi-runtime-command-baseline.md`
- `docs/architecture/contracts.md`
- `docs/architecture/vn-runtime-dispatcher.md`
- `docs/nani/command-catalog.md`
- `apps/game/public/harness/README.md`
- `apps/game/public/harness/media/bgm/*.ogg`
- `apps/game/public/harness/media/sfx/*.ogg`
- `apps/game/public/harness/media/video/*.mp4`
- `apps/game/src/harness/fixtures/verticalSlice.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/index.test.ts`
- `packages/nani-runtime-compiler/src/index.ts`
- `packages/nani-runtime-compiler/src/index.test.ts`
- `packages/story-engine/src/index.ts`
- `packages/story-engine/src/index.test.ts`
- `packages/story-play/src/index.ts`
- `packages/story-play/src/index.test.ts`
- `packages/ui-kit/src/**`
- `packages/media-save/src/index.ts`
- `packages/media-save/src/index.test.ts`
- `apps/game/src/vnOutputRoutes.ts`
- `apps/game/src/vnOutputRoutes.test.ts`
- `apps/game/src/vnRuntimeTransaction.ts`
- `apps/game/src/vnRuntimeTransaction.test.ts`
- `apps/game/src/mediaRuntime.ts`
- `apps/game/src/mediaRuntime.test.ts`
- `apps/game/src/uiRuntime.ts`
- `apps/game/src/uiRuntime.test.ts`
- `apps/game/src/VnRuntimeDispatcher.tsx`
- `apps/game/src/interaction/GameInteractionShell.tsx`
- `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.ts`
- `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.test.ts`
- `apps/game/src/interaction/useVerticalSliceSaveAdapter.ts`
- `apps/game/src/interaction/useVerticalSliceSaveAdapter.test.ts`
- `apps/game/src/harness/scenarios/vertical-slice/**`
- `tests/smoke/*.spec.ts`
- `tests/smoke/**/*.spec.ts`

## Forbidden Paths

- `packages/pixi-presenter/**`
- `packages/nani-parser/src/types.ts`
- `packages/nani-parser/src/index.ts` unless a compiler test proves parser
  output is already sufficient and no IR change is made.
- `package.json`
- `pnpm-lock.yaml`
- New `packages/media-runtime/**`
- New third-party dependency files
- New or expanded `tests/smoke/**` flows
- Smoke screenshot baseline changes
- Pixi layer/readout/visual-flow changes inside
  `apps/game/src/harness/scenarios/vertical-slice/**`
- Public media assets outside `apps/game/public/harness/media/**`
- `docs/architecture/presentation-pipeline.md`

Allowed path caveats:

- `apps/game/src/interaction/GameInteractionShell.tsx` and
  `apps/game/src/harness/scenarios/vertical-slice/**` may be changed only to
  keep `GameInteractionShell` as the single DOM runtime UI mount host and pass
  controlled props/events through existing adapters. Do not add a second runtime
  UI host in the harness scenario, and do not change Pixi layer ordering, Pixi
  debug readouts, R3F scene flow, or vertical-slice visual behavior. Do not
  bind harness debug/sidebar/readout visibility to `uiRuntime.visible`; those
  are harness diagnostics, not script-controlled game UI.
- `tests/smoke/**/*.spec.ts` may be changed only to keep existing branch text
  assertions and existing branch traversal steps aligned with the renamed main
  interaction branch. Do not add new smoke tests, new screenshots, or new
  visual acceptance flows in this task.

## Command Implementation Matrix

| Command | Owner | First implementation boundary |
|---|---|---|
| `print` | StoryEngine | Write `text.current` and backlog; support canonical speaker/text/printer/speed subset. |
| `append` | StoryEngine | Append to `text.current.text`; do not create a new backlog entry. |
| `resetText` | StoryEngine | Clear current text; do not clear backlog. |
| `clearBacklog` | StoryEngine | Clear backlog only. |
| `format` | StoryEngine + UI surface | StoryEngine stores opaque format ids/templates; UI interprets presentation; arbitrary rich text is unsupported. |
| `showPrinter` | StoryEngine | Set `text.visible=true` and printer id; `wait!` is unsupported in this task. |
| `showUI` | UI runtime | Show `dialog`, `commandBar`, `toastLayer`, or all three when no target is supplied; no global shell replacement and no harness/debug surface control. |
| `hideUI` | UI runtime | Hide `dialog`, `commandBar`, `toastLayer`, or all three when no target is supplied through the same `uiRuntime.visible` authority as `showUI`; no lifecycle or harness/debug surface control. |
| `toast` | UI runtime | Transient event; no story block and no save persistence. |
| `wait` | StoryEngine | Create `runtimeWait.kind="pause"`. |
| `input` | StoryEngine + UI surface | Create input runtime wait; prompt surface derives from the wait; submit writes variable and clears wait. |
| `bgm` | media runtime | Play/switch group-tracked BGM with basic volume/fade. |
| `stopBgm` | media runtime | Stop/fade tracked BGM by `group ?? "bgm"`. |
| `sfx` | media runtime | One-shot SFX; `loop:true` tracks by `group ?? sfxPath`. |
| `sfxFast` | media runtime | Transient SFX effect; no saveable state. |
| `stopSfx` | media runtime | Stop tracked looping SFX by `group ?? sfxPath`; missing handle is diagnostic/no-op. |
| `stopVoice` | declared-only | Deferred until a future task implements `voice` playback and tracked voice handles. |
| `movie` | StoryEngine + media runtime + UI surface | Blocking movie creates runtime wait; playback and overlay are adapter-owned. |
| `choice` | StoryEngine | Support id/enabled/setExpression; unsupported choice handler params diagnostic. |
| `clearChoice` | StoryEngine | No params clears all; `id` clears matching choice; missing id and unsupported handler/hide params are diagnostics/no-op. |
| `set` | StoryEngine | Safe assignment evaluator; no `eval`. |
| `goto` | StoryEngine | Local labels only; cross-script paths diagnostic unsupported. |

## Implementation Path

### Phase 1: CCR and contracts

- Add CCR.
- Add schemas and tests.
- Add execution enum values.
- Update command catalog status/execution for commands completed in this task.

### Phase 2: Compiler normalization

- Normalize all target command params.
- Add unsupported-param diagnostics.
- Keep parser IR unchanged.

### Phase 3: Story text and control

- Add `StoryTextState` behavior.
- Add `runtimeWait` behavior for `wait`, `input`, and blocking `movie`.
- Add choice/set/goto constrained enhancements.

### Phase 4: story-play behavior

- Ensure manual/auto/skip do not bypass `runtimeWait`.
- Add tests for schedule idle behavior.

### Phase 5: transaction routes

- Add output transaction support for media/UI while keeping Pixi behavior.
- Add route tests.

### Phase 6: app-local media/UI runtimes

- Add reducers/effect descriptors.
- Wire app adapter through additive media/ui/runtimeWait state only.
- Add UI surfaces only as controlled components.

### Phase 7: app adapter unit coverage

- Add app adapter unit coverage for runtime wait completion, media events, and
  UI events.
- Do not add Playwright smoke flows or screenshots in this task. Existing smoke
  text assertions may be updated only when renamed harness branch copy requires
  it; broader visible smoke coverage belongs to an integration follow-up after
  the parallel Pixi worktree lands.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Old story snapshots still parse | Contract tests |
| New story snapshots with `text` parse | Contract tests |
| New story snapshots with `runtimeWait` parse | Contract tests |
| Command catalog execution boundaries are explicit | Contract tests |
| Compiler normalizes all target commands | Compiler tests |
| Unsupported params are diagnostic, not silent | Compiler/StoryEngine tests |
| `print` updates text current and backlog | StoryEngine tests |
| `append` does not create new backlog entry | StoryEngine tests |
| `resetText` does not clear backlog | StoryEngine tests |
| `clearBacklog` does not clear current text | StoryEngine tests |
| `format` stores opaque state while UI owns visual interpretation | StoryEngine/ui-kit tests |
| `clearChoice` all/id/missing-id behavior is deterministic | StoryEngine tests |
| `wait` blocks advance | StoryEngine tests |
| `input` blocks then writes variable on submit | StoryEngine tests and app test |
| `movie` blocking creates runtime wait | StoryEngine/app tests |
| auto/skip idle during runtime wait | story-play tests |
| Pixi presentation wait still works | Existing Pixi/app tests remain passing without modification |
| Media commands route to media, not Pixi | App route/transaction tests |
| UI commands route to UI, not Pixi | App route/transaction tests |
| `hideUI` shares `showUI` visibility authority, including scoped no-target all-runtime-UI behavior | Compiler/uiRuntime/transaction tests |
| BGM groups can coexist while same-group replacement emits stop/fade-stop effects | mediaRuntime tests |
| App adapter releases prior live BGM handle on same-group replacement | adapter tests |
| one-shot SFX and `sfxFast` stay effects-only | mediaRuntime tests |
| looping SFX is tracked and can be stopped by key | mediaRuntime tests |
| media source resolution is adapter-owned | adapter tests |
| unresolved media source no-ops with `"asset"` diagnostics | adapter tests |
| `AudioHandle.fadeOutAndStop` releases faded handles | media-save tests |
| runtime UI surfaces do not become shell overlay enum entries | adapter/ui-kit tests and review |
| choice id/enabled/setExpression works | StoryEngine tests |
| local `goto` continues to work | StoryEngine tests |

## Regression Requirements

Required regression cases:

- Normal path: text command updates current text and backlog.
- Boundary path: `append` with no current text creates a current text or emits a
  deterministic diagnostic per implementation decision.
- Boundary path: `format` stores opaque format state only; UI owns visual
  interpretation, and unsupported rich-text/template behavior is diagnostic or
  no-op.
- Boundary path: `clearChoice` clears all with no params, clears matching
  choices by `id`, and diagnoses/no-ops missing ids plus unsupported
  `handlerId` / `hide` params.
- Boundary path: `wait i` blocks until confirm completion.
- Boundary path: `wait 1.5` blocks until timer completion.
- Boundary path: invalid runtime wait completion keeps `runtimeWait` active and
  emits `invalid-runtime-wait-completion`.
- Boundary path: `input` rejects invalid typed value and keeps wait active.
- Boundary path: manual confirm does not submit or clear an input wait.
- Boundary path: blocking `movie` does not advance to next text before
  completion.
- Boundary path: blocking `movie` still emits the media/UI output needed to
  start playback before waiting.
- Normal path: `bgm` starts group-tracked BGM; a later `bgm` in the same group
  emits a stop/fade-stop effect for the prior track, while a later `bgm` in a
  different group coexists. This belongs to `mediaRuntime` tests.
- Normal path: app adapter handling same-group BGM replacement calls `stop()` or
  `fadeOutAndStop()` on the previous live handle and removes that live handle
  ref. This belongs to adapter tests, not pure `mediaRuntime` tests.
- Normal path: `stopBgm` stops only the targeted `group ?? "bgm"` BGM track.
- Normal path: `sfx loop:true` is tracked by `group ?? sfxPath`, and `stopSfx`
  clears only the matching tracked looping SFX key.
- Normal path: `AudioHandle.fadeOutAndStop` fades to zero and releases the
  handle.
- Boundary path: `fadeOutAndStop(0)` behaves like `stop()`, and repeated
  `stop()` / `fadeOutAndStop()` calls are idempotent without leaked timers or
  double release.
- Normal path: adapter resolver resolves media refs from the app-created
  `AssetResolver` backed by manifest runtime assets.
- Boundary path: adapter resolver lookup uses exact key matching, validates
  media `kind`, returns `optimizedUri` for `RuntimeAsset`, treats manifest
  `AssetRef` / `RuntimeScript.assets` as id-only dependency declarations, and
  rejects URI-like source refs.
- Normal path: prepared harness ids resolve through canonical
  `ContentManifest.runtimeAssets` declarations and cover BGM same-group
  replacement, second BGM group coexistence, looping SFX start/stop, one-shot
  `sfx`, `sfxFast`, and blocking `movie`.
- Normal path: runtime UI surfaces for dialog, commandBar, toast, input, and
  movie mount through `GameInteractionShell` without adding per-command
  `GameOverlayKind` values; the vertical-slice harness scenario only passes
  controlled props/events.
- Normal path: no-target `showUI` / `hideUI` show or hide only `dialog`,
  `commandBar`, and `toastLayer`.
- Boundary path: `hud`, comma-joined UI names, `inputPrompt`, `movieOverlay`,
  and `trialOverlay` targets produce diagnostics/no-op; they do not create
  lifecycle surfaces, shell overlays, or debug UI control.
- Boundary path: hidden `toastLayer` does not pause toast expiration timers;
  toasts continue to dismiss according to duration while the layer is hidden.
- Harness path: future non-Pixi showcase commands are added to
  `#MainInteractionFlow`, while `#PixiCommandShowcase` remains the Pixi visual
  validation branch.
- Harness path: existing smoke text assertions may be updated for renamed branch
  copy, but no new smoke flow or screenshot baseline is added.
- Boundary path: media `wait!` produces an unsupported-param diagnostic and
  does not create `runtimeWait` or `presentationWait`.
- No-op path: unresolved media source emits adapter diagnostics with source
  `"asset"` and does not call `AudioPort` / `VideoPort`.
- No-op path: `stopSfx` with no active handle does not throw.
- No-op path: unsupported command params produce diagnostics.
- No-op path: one-shot `sfx` and `sfxFast` produce effects but no tracked media
  state.
- Drift path: media/UI commands are not reduced by Pixi.
- Drift path: route table output matches `commandCatalog.execution` for target
  media/UI/Pixi commands.
- Drift path: story-control commands do not reach media/UI through category
  fallback.
- Serialization path: story snapshots with and without additive fields satisfy
  `StoryRuntimeSnapshotSchema`.
- Serialization path: restore behavior for a development save containing
  `runtimeWait` is deterministic and covered by adapter tests.
- Playback mode path: manual/auto/skip do not bypass `runtimeWait`.
- Text authority path: `selectCurrentStoryLine` prefers `text.current` and
  falls back to backlog for old snapshots.

Test placement:

- Contract tests: `packages/contracts/src/index.test.ts`
- Compiler tests: `packages/nani-runtime-compiler/src/index.test.ts`
- StoryEngine tests: `packages/story-engine/src/index.test.ts`
- Story-play tests: `packages/story-play/src/index.test.ts`
- Media-save tests: `packages/media-save/src/index.test.ts`
- App routing/transaction tests: `apps/game/src/*Runtime*.test.ts`
- Adapter tests: `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.test.ts`
- `apps/game/src/VnRuntimeDispatcher.tsx`
- `apps/game/src/interaction/useVerticalSliceSaveAdapter.ts`
- `apps/game/src/interaction/useVerticalSliceSaveAdapter.test.ts`
- Smoke tests: no new tests or screenshots; existing branch text/traversal
  updates are allowed only for renamed harness branch copy.

## Dependency Changes

None.

Do not edit:

- `package.json`
- `pnpm-lock.yaml`

If a new third-party library or new workspace package becomes necessary, stop
and create a follow-up task/CCR. Do not widen this task.

## CCR Triggers

This task intentionally includes one CCR:

- `docs/ccr/non-pixi-runtime-command-baseline.md`

Additional CCR is required if implementation needs:

- parser IR changes,
- RuntimeCommand shape changes,
- SaveData top-level media state,
- new dependency,
- new workspace package,
- Pixi wait redesign,
- Pixi presenter changes,
- new/changed Pixi visual smoke flows or screenshot baselines,
- block flow / async track semantics.

## Required Gates

Local iteration gates:

```bash
pnpm setup:worktree-env
pnpm validate:contracts
pnpm vitest run packages/nani-runtime-compiler/src/index.test.ts
pnpm vitest run packages/story-engine/src/index.test.ts
pnpm vitest run packages/story-play/src/index.test.ts
pnpm vitest run packages/media-save/src/index.test.ts
pnpm vitest run apps/game/src/vnOutputRoutes.test.ts
pnpm vitest run apps/game/src/vnRuntimeTransaction.test.ts
pnpm vitest run apps/game/src/mediaRuntime.test.ts
pnpm vitest run apps/game/src/uiRuntime.test.ts
pnpm vitest run apps/game/src/interaction/useVerticalSliceRuntimeAdapter.test.ts
pnpm typecheck
pnpm validate:boundaries
```

Conditional smoke gate:

```bash
# Run only if existing tests/smoke/**/*.spec.ts text assertions are changed.
pnpm test:smoke
```

Merge gate:

```bash
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/non-pixi-runtime-command-baseline.md
```

## Programmatic Acceptance

The implementation is programmatically acceptable when:

- All target commands have compiler normalization coverage.
- Every promoted `implemented` command has behavior coverage, including
  `hideUI` as the inverse of the shared `showUI` visibility authority,
  scoped no-target all-runtime-UI behavior, and unsupported `hud` diagnostics.
- `runtimeWait` is covered for `wait`, `input`, and blocking `movie`.
- `runtimeWait` is not used for Pixi, ordinary media, ordinary UI, `print`, or
  `choice`.
- Old and new story snapshots validate.
- BGM group replacement/coexistence, SFX tracking, missing media no-op with
  `"asset"` diagnostics, `fadeOutAndStop` idempotent release, and adapter
  resolver key/kind rules are covered by tests.
- Prepared harness media ids, including `video:validation-intro`, are wired
  through canonical `ContentManifest.runtimeAssets` declarations for normal
  validation; adapter unit tests use mock resolvers instead of fallback source
  tables.
  No runtime code hard-codes those optimized URIs outside generator and
  registration sources.
- The former fast-exit branch is treated as `#MainInteractionFlow`, and the
  Pixi showcase branch remains separate.
- Runtime UI surfaces are covered through `GameInteractionShell` without adding
  per-command `GameOverlayKind` entries or changing Pixi visual behavior.
- Media `wait!` is diagnosed and does not create `runtimeWait` or
  `presentationWait`.
- Existing Pixi presentation wait behavior remains covered by unchanged
  existing tests.
- No files under `packages/pixi-presenter/**` are modified.
- Any `tests/smoke/**` changes are limited to existing text assertions for
  renamed harness branch copy; no new smoke flow or screenshot baseline is
  added.
- Any `apps/game/src/harness/scenarios/vertical-slice/**` changes are limited to
  passing controlled non-Pixi runtime UI props/events through the existing
  `GameInteractionShell` boundary; Pixi layer/readouts/visual flow remain
  unchanged.
- `pnpm typecheck` passes.
- `pnpm validate:boundaries` passes.
- The merge gate passes with this task card.

## Manual Acceptance

The reviewer should inspect that:

- Scope stayed limited to the fixed command list.
- `runtimeWait` did not become a generic adapter task manager.
- Invalid runtime wait completions cannot clear the wrong wait kind.
- `movie` has exactly one blocking authority: StoryEngine creates the wait,
  app media/UI runtimes perform playback and completion.
- `StoryTextState.current` and backlog are used as separate current-display
  and history authorities.
- App dialog/current-line code uses `selectCurrentStoryLine` instead of direct
  `backlog.at(-1)` reads.
- `commandCatalog.execution` and `VnOutputRouteTable` cannot drift for the
  target command set.
- Media source refs are resolved only in the app adapter; compiler,
  StoryEngine, and pure mediaRuntime do not load assets or hold live handles.
- Prepared harness media assets are referenced by stable ids, not by hard-coded
  runtime file URIs in compiler, StoryEngine, or pure `mediaRuntime`.
- `video:validation-intro` resolves to the canonical harness video fixture
  through `ContentManifest.runtimeAssets`; movie playback uses `VideoPort` /
  DOM video, not Pixi.
- Future showcase `.nani` commands are staged in the main interaction branch,
  not mixed into the Pixi visual validation branch.
- Runtime UI surfaces are mounted through `GameInteractionShell` as the single
  DOM runtime UI host, while the vertical-slice harness scenario only passes controlled
  props/events; no per-command shell overlay enum values are added.
- `showUI` / `hideUI` do not control harness/debug UI. The vertical-slice
  sidebar, runtime controls, inspector, Pixi readouts, and harness status chip
  remain harness-owned even while a script hides runtime command UI.
- `useOverlayPageAdapters` remains scoped to shell overlays such as backlog,
  settings, save/load, and pause.
- `showUI` / `hideUI` v1 do not target `trialOverlay`; trial UI remains
  Trial-owned.
- `showUI` / `hideUI` v1 also do not directly target lifecycle-owned
  `inputPrompt` or `movieOverlay`; those are derived from `runtimeWait` and
  media playback state.
- Existing smoke text assertions may change for renamed branch copy, but no new
  smoke flow or screenshot baseline is introduced.
- Adapter media resolution receives the app-created `AssetResolver`; it does
  not import or own a global asset catalog. Normal harness showcase validation
  uses canonical `ContentManifest.runtimeAssets`; raw URI inputs are rejected.
- Adapter media lookup uses exact source-ref keys and media kind checks; it
  does not infer catalog groups, basenames, or extension-stripped aliases.
- BGM is an explicit group-keyed multi-track implementation, where same-group
  playback replaces and different groups may coexist.
- One-shot `sfx` and `sfxFast` are effect-only, while only looping `sfx` is
  tracked app-locally.
- Missing media sources no-op with `"asset"` adapter diagnostics and do not use
  placeholder media.
- `AudioHandle.fadeOutAndStop` is the only media-save audio API extension added
  for fade-stop cleanup.
- Fade-stop cleanup is idempotent: immediate `stop()` cancels pending fades,
  repeated fade-stop calls do not leak timers, and handles are released once.
- Pixi `presentationWait` remained the sole Pixi wait mechanism.
- Pixi routes, Pixi reducer behavior, Pixi task descriptors, and Pixi visual
  behavior were not changed.
- Media state did not enter `SaveData`.
- Development saves containing `runtimeWait` have deterministic restore
  behavior instead of silent half-restore.
- Parser IR did not change.
- No new dependency or workspace package was added.
- Unsupported Naninovel parity is surfaced by diagnostics.
- Manual/auto/skip behavior cannot bypass `runtimeWait`.

## Review Packet

- Changed files summary.
- CCR link.
- Test and gate output.
- Regression coverage summary.
- Explicit confirmation that no smoke screenshots were changed by this task.
- Explicit list of unsupported Naninovel params left as diagnostics.
- Explicit summary of media resource handling: BGM group-track behavior, SFX
  tracking behavior, adapter resolver input sources, resolver key/kind policy,
  missing-source `"asset"` diagnostics, and `fadeOutAndStop` usage.
- Explicit summary of prepared harness media asset usage: ids, canonical
  `ContentManifest.runtimeAssets` declaration path, mock resolver tests,
  canonical movie asset id, and the `.nani` media validation sequence.
- Explicit summary of runtime UI surface handling: which shell overlays remain
  `GameOverlayKind`, which script-driven surfaces are app-local runtime UI, and
  confirmation that Pixi visual behavior was not changed.
- Residual risks and follow-up task suggestions.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting this branch removes the non-Pixi command baseline, `runtimeWait`,
`StoryTextState`, and media/UI execution boundary additions.

No media save migration should be required because this task must not add
top-level media persistence.

If a user somehow saved while `runtimeWait` was active during development,
that save is considered development-only and not a compatibility guarantee.

## Done When

- CCR and task card are present.
- Target command implementations stay within the command matrix boundary.
- Required regression tests pass.
- Public contract changes are covered by tests.
- Manual/auto/skip `runtimeWait` behavior is verified.
- Existing Pixi presentation wait behavior does not regress.
- Diff stays inside allowed paths.
- Summary includes changed files, verification, and residual risks.
