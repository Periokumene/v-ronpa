# Non-Pixi Runtime Command Baseline

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/non-pixi-runtime-command-baseline`

## Worktree Path

- Manual Git worktree suggestion: `.worktrees/non-pixi-runtime-command-baseline`

## Status

- State: `Draft`
- Owner: `TBD`
- Created: `2026-06-24`
- Updated: `2026-06-24`
- Completed Commit: `TBD`
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
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/vn-runtime-dispatcher.md、docs/architecture/contracts.md、docs/architecture/harness-gates.md、docs/nani/naninovel-command-implementation-split-report.md、以及本 task card。
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
`showUI`, `toast`, `wait`, `input`, `bgm`, `stopBgm`, `sfx`, `sfxFast`,
`stopSfx`, `stopVoice`, `movie`, `choice`, `clearChoice`, `set`, `goto`.

The implementation must preserve the existing Pixi presentation pipeline while
adding the smallest necessary StoryEngine, compiler, media, and UI runtime
support for these commands.

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

## Target Architecture Summary

This task introduces only three public architecture additions:

1. Narrow StoryEngine `runtimeWait` for non-Pixi story blocking.
2. Minimal `StoryTextState` for current printer/text state.
3. Command execution boundaries for media and UI output.

The task does not introduce a second Pixi wait system, a generic async task
manager, a new scripting engine, a new parser IR, a new workspace package, or a
new third-party dependency.

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
  this task.
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
- Do not use `runtimeWait` for `showUI`, `toast`, or `showPrinter`.
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
| Audio | Reuse Howler through existing `packages/media-save` primitives; extend local port shape or wrap existing port as needed. |
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
| `ui-output` | `showUI`, `toast` |
| `media-output` | `bgm`, `stopBgm`, `sfx`, `sfxFast`, `stopSfx`, `stopVoice`, `movie` |

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
- For `movie`:
  - StoryEngine only interprets the blocking flag and creates
    `runtimeWait.kind="movie"` when blocking.
  - Actual playback belongs to media/UI adapter.
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
- Existing app adapter files needed to apply media effects.

Required work:

- Implement app-local pure media reducer and effect descriptors.
- Supported commands:
  - `bgm`
  - `stopBgm`
  - `sfx`
  - `sfxFast`
  - `stopSfx`
  - `stopVoice`
  - `movie`
- First version media state is app-local and not persisted in `SaveData`.
- One-shot SFX and `sfxFast` must not enter saveable state.
- Looping SFX may be tracked app-locally only.
- Diagnostics for missing path/unknown handle should be non-throwing.

### apps/game UI runtime

Allowed files:

- `apps/game/src/uiRuntime.ts`
- `apps/game/src/uiRuntime.test.ts`
- `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.ts`
- `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.test.ts`

Required work:

- Implement app-local UI runtime state/events:
  - visible UI groups,
  - toast queue,
  - input prompt state,
  - movie overlay state.
- Supported commands:
  - `showUI`
  - `toast`
  - `input` prompt rendering/completion
  - `movie` overlay rendering/completion
- `showUI` must use a whitelist such as:
  - `dialog`
  - `commandBar`
  - `hud`
  - `trialOverlay`
- Do not allow script commands to hide or replace core shell safety controls.
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

### packages/media-save

Allowed files:

- `packages/media-save/src/index.ts`
- `packages/media-save/src/index.test.ts`

Allowed only if needed:

- Extend or wrap `AudioPort` for stop/fade behavior.

Forbidden:

- Do not add media persistence.
- Do not change save schema ownership.

## Allowed Paths

- `docs/tasks/non-pixi-runtime-command-baseline.md`
- `docs/ccr/non-pixi-runtime-command-baseline.md`
- `docs/architecture/contracts.md`
- `docs/architecture/vn-runtime-dispatcher.md`
- `docs/nani/command-catalog.md`
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
- `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.ts`
- `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.test.ts`

## Forbidden Paths

- `packages/pixi-presenter/**`
- `packages/nani-parser/src/types.ts`
- `packages/nani-parser/src/index.ts` unless a compiler test proves parser
  output is already sufficient and no IR change is made.
- `package.json`
- `pnpm-lock.yaml`
- New `packages/media-runtime/**`
- New third-party dependency files
- `apps/game/src/harness/scenarios/vertical-slice/**`
- `tests/smoke/**`
- `docs/architecture/presentation-pipeline.md`

## Command Implementation Matrix

| Command | Owner | First implementation boundary |
|---|---|---|
| `print` | StoryEngine | Write `text.current` and backlog; support canonical speaker/text/printer/speed subset. |
| `append` | StoryEngine | Append to `text.current.text`; do not create a new backlog entry. |
| `resetText` | StoryEngine | Clear current text; do not clear backlog. |
| `clearBacklog` | StoryEngine | Clear backlog only. |
| `format` | StoryEngine | Register safe format template ids; arbitrary rich text is unsupported. |
| `showPrinter` | StoryEngine | Set `text.visible=true` and printer id; `wait!` is unsupported in this task. |
| `showUI` | UI runtime | Show whitelisted UI groups only; no global shell replacement. |
| `toast` | UI runtime | Transient event; no story block and no save persistence. |
| `wait` | StoryEngine | Create `runtimeWait.kind="pause"`. |
| `input` | StoryEngine + UI runtime | Create input runtime wait; submit writes variable and clears wait. |
| `bgm` | media runtime | Play/switch BGM with basic volume/fade. |
| `stopBgm` | media runtime | Stop/fade tracked BGM. |
| `sfx` | media runtime | One-shot SFX; loop support is app-local if implemented. |
| `sfxFast` | media runtime | Transient SFX effect; no saveable state. |
| `stopSfx` | media runtime | Stop tracked SFX handle; missing handle is diagnostic/no-op. |
| `stopVoice` | media runtime | Stop current voice handle only. |
| `movie` | StoryEngine + media/UI runtime | Blocking movie creates runtime wait; playback and overlay are adapter-owned. |
| `choice` | StoryEngine | Support id/enabled/setExpression; unsupported choice handler params diagnostic. |
| `clearChoice` | StoryEngine | Clear all or clear by id. |
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
- Do not add or update Playwright smoke tests in this task. Visible smoke
  coverage belongs to an integration follow-up after the parallel Pixi worktree
  lands.

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
| `wait` blocks advance | StoryEngine tests |
| `input` blocks then writes variable on submit | StoryEngine tests and app test |
| `movie` blocking creates runtime wait | StoryEngine/app tests |
| auto/skip idle during runtime wait | story-play tests |
| Pixi presentation wait still works | Existing Pixi/app tests remain passing without modification |
| Media commands route to media, not Pixi | App route/transaction tests |
| UI commands route to UI, not Pixi | App route/transaction tests |
| `sfxFast` stays effects-only | mediaRuntime tests |
| choice id/enabled/setExpression works | StoryEngine tests |
| local `goto` continues to work | StoryEngine tests |

## Regression Requirements

Required regression cases:

- Normal path: text command updates current text and backlog.
- Boundary path: `append` with no current text creates a current text or emits a
  deterministic diagnostic per implementation decision.
- Boundary path: `wait i` blocks until confirm completion.
- Boundary path: `wait 1.5` blocks until timer completion.
- Boundary path: `input` rejects invalid typed value and keeps wait active.
- Boundary path: blocking `movie` does not advance to next text before
  completion.
- No-op path: `stopSfx` and `stopVoice` with no active handle do not throw.
- No-op path: unsupported command params produce diagnostics.
- Drift path: media/UI commands are not reduced by Pixi.
- Serialization path: story snapshots with and without additive fields satisfy
  `StoryRuntimeSnapshotSchema`.
- Playback mode path: manual/auto/skip do not bypass `runtimeWait`.

Test placement:

- Contract tests: `packages/contracts/src/index.test.ts`
- Compiler tests: `packages/nani-runtime-compiler/src/index.test.ts`
- StoryEngine tests: `packages/story-engine/src/index.test.ts`
- Story-play tests: `packages/story-play/src/index.test.ts`
- App routing/transaction tests: `apps/game/src/*Runtime*.test.ts`
- Adapter tests: `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.test.ts`
- Smoke tests: not allowed in this task.

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
- vertical-slice smoke or harness expectation changes,
- block flow / async track semantics.

## Required Gates

Local iteration gates:

```bash
pnpm setup:worktree-env
pnpm validate:contracts
pnpm vitest run packages/nani-runtime-compiler/src/index.test.ts
pnpm vitest run packages/story-engine/src/index.test.ts
pnpm vitest run packages/story-play/src/index.test.ts
pnpm vitest run apps/game/src/vnOutputRoutes.test.ts
pnpm vitest run apps/game/src/vnRuntimeTransaction.test.ts
pnpm typecheck
pnpm validate:boundaries
```

Merge gate:

```bash
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/non-pixi-runtime-command-baseline.md
```

## Programmatic Acceptance

The implementation is programmatically acceptable when:

- All target commands have compiler normalization coverage.
- Every promoted `implemented` command has behavior coverage.
- `runtimeWait` is covered for `wait`, `input`, and blocking `movie`.
- `runtimeWait` is not used for Pixi, ordinary media, ordinary UI, `print`, or
  `choice`.
- Old and new story snapshots validate.
- Existing Pixi presentation wait behavior remains covered by unchanged
  existing tests.
- No files under `packages/pixi-presenter/**`, `tests/smoke/**`, or
  `apps/game/src/harness/scenarios/vertical-slice/**` are modified.
- `pnpm typecheck` passes.
- `pnpm validate:boundaries` passes.
- The merge gate passes with this task card.

## Manual Acceptance

The reviewer should inspect that:

- Scope stayed limited to the fixed command list.
- `runtimeWait` did not become a generic adapter task manager.
- Pixi `presentationWait` remained the sole Pixi wait mechanism.
- Pixi routes, Pixi reducer behavior, Pixi task descriptors, and Pixi visual
  behavior were not changed.
- Media state did not enter `SaveData`.
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
