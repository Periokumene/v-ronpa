# Story VN Stepper

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/story-vn-stepper`

## Worktree Path

- `.worktrees/story-vn-stepper`

## Status

- State: `Ready`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-15`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/story-vn-stepper.md`

## Worktree Environment

Run once after the worktree is created:

```bash
pnpm setup:worktree-env
```

This creates an ignored `.env.worktree` with a worktree-specific
`PORT/VITE_DEV_PORT`. Vite and Playwright both read this file so parallel
worktrees do not share the same dev server.

## Thread Startup Prompt

```text
你在 V-Ronpa 独立 worktree 中执行 docs/tasks/story-vn-stepper.md。
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/worktree-flow.md、docs/architecture/harness-gates.md、以及本 task card。
先运行 pnpm setup:worktree-env；Vite/Playwright 会读取 .env.worktree 隔离端口，不要提交 .env.worktree、.local-state、test-results 或 playwright-report。
本线目标是在 packages/story-engine 和 P0 预留的 /?scenario=story-vn 中完成推进、选择、结束的 VN 基础验证。
严格遵守 Allowed Paths / Forbidden Paths；不要改 public contracts、.nani IR、package.json、pnpm-lock.yaml。
只能使用 apps/game/src/harness/scenarios/story-vn/** 和 tests/smoke/story-vn.spec.ts；不要修改 apps/game 其他文件。
若发现必须改 apps/game 其他文件、shared fixture、contracts、依赖、或任务卡外路径，停止并在 review packet 中说明需要 public-core/integration follow-up，不要扩大范围。
实现后运行 Required Gates，最终运行 BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/story-vn-stepper.md。
输出 changed files、测试结果、截图路径、残余风险。
```

## Goal

Deliver a pure StoryEngine VN stepper for the fixed P0 `/?scenario=story-vn`
harness entry.

This line must prove advance-to-next-readable-stop, local choice branching,
branch variable updates, gameplay event effects, invalid choice diagnostics,
and ended-state no-op behavior. It must do so without changing public
contracts, `.nani` IR, shared fixtures, dependencies, `package.json`, or
`pnpm-lock.yaml`.

## Context

The true task name is `story-vn-stepper`, from branch
`ai/story-vn-stepper` and this task card.

The harness entry is `/?scenario=story-vn`. The `StoryVnScenario` must continue
using the existing shared `verticalSliceScript` without editing the shared
fixture. New harness logic belongs only in
`apps/game/src/harness/scenarios/story-vn/**`.

Use Game Studio guidance only as shared architecture and playtest framing. This
task does not choose or add a new engine, Phaser, Three.js, React Three Fiber,
or another runtime stack.

## Functional Intent

- A player confirm action advances the current story snapshot to the next
  readable or choosable stop.
- `advanceToNextStop` is not fast-forward. It executes labels, comments,
  state commands, gameplay commands, presentation commands, and jumps until the
  next text statement, contiguous choices, ended state, or `maxSteps`.
- Multiple dialogue lines require multiple advances. A single advance must not
  skip over one visible text line to show a later visible text line.
- Contiguous `@choice` commands are collected into one pending choice list.
- `chooseStoryOption` clears pending choices and jumps to the selected label
  only; it does not auto-advance after the jump.
- Branch effects such as `@set route` and `@gameplay grant-evidence` appear on
  the next `advanceToNextStop`.
- Invalid choices, ended no-op advances, pending-choice advances, and max-step
  guard hits return diagnostics without throwing.
- The currently displayable VN line is derived by StoryEngine helper/selector
  code. Harness and integration callers must not each re-scan presentation
  command logs with their own ad hoc "latest print" logic.

## Constraints

- Only implement advance, choice, and end behavior.
- Do not add scheduler, typewriter, autoplay, fast-forward, backlog UI,
  save/load, editor behavior, timing APIs, or presentation timing.
- Do not add or change public contracts, `.nani` IR, shared fixtures, package
  dependencies, `package.json`, or `pnpm-lock.yaml`.
- Runtime helpers must remain pure, immutable, renderer-independent, and free
  of React, DOM, Pixi, R3F, Dexie, and Howler dependencies.
- Treat the "complete small runner" as package-level story helper API, not a
  UI runtime, mutable class, React hook, scheduler, or presenter.
- Backlog remains text-only. Selected choices and effects do not enter backlog.

## Allowed Paths

- `packages/story-engine/**`
- `apps/game/src/harness/scenarios/story-vn/**`
- `tests/smoke/story-vn.spec.ts`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `pnpm-lock.yaml`
- `package.json`

## Contracts

Honor `StoryRuntimeSnapshot`, `StoryChoiceOption`, `StoryEffect`, and existing
`.nani` IR.

No CCR is expected. Consuming existing contract schemas in tests, for example
`StoryRuntimeSnapshotSchema.parse(storyRuntimeSnapshot(state))`, is allowed
because this task does not modify contracts. If implementation requires a
contract or IR shape change, stop and create or request a CCR follow-up instead
of widening this task.

Adding package-local StoryEngine helper types or selectors is allowed inside
`packages/story-engine/**` and does not require a CCR as long as no fields are
added to `StoryRuntimeSnapshot`, `StoryEffect`, `.nani` IR, or any public
contract package.

## Design Intent And Architecture

- StoryEngine owns script semantics, variables, backlog, choices, effects, and
  serializable story snapshots.
- React harness code owns only input buttons, rendering of observable state,
  and smoke-test evidence.
- The reducer remains pure state/no-op compatible; new diagnostics are returned
  through helper result wrappers, not stored in `StoryRuntimeSnapshot`.
- Current-line derivation belongs to StoryEngine selectors. UI and integration
  code should consume a selected `{ speaker?, text }` shape instead of
  duplicating command-log traversal.
- Scheduler, typewriter, autoplay, and fast-forward belong to future `ui-kit`,
  presenter, or integration tasks if desired. They require CCR only if that
  future work changes public contracts or `.nani` IR.

## StoryEngine API Plan

Allowed exported additions from `packages/story-engine/src/index.ts`:

- `advanceToNextStop(state, scenario, options?) => { state, diagnostics }`
- `chooseStoryOption(state, scenario, index) => { state, diagnostics }`
- `selectCurrentStoryLine(state) => { speaker?: string; text: string } | undefined`
- Helper result and diagnostic types local to `@v-ronpa/story-engine`, not
  `packages/contracts`.

Required helper semantics:

- Helpers return `{ state, diagnostics }`.
- Existing immutable reducer-style state remains the underlying model.
- `advanceToNextStop` stops at the next text, contiguous choices, ended state,
  or `maxSteps`.
- `chooseStoryOption` only clears choices and jumps to the selected label.
- `maxSteps` has an internal default, returns a diagnostic on limit, and does
  not throw.
- Diagnostics include at least invalid choice, ended no-op, pending choices,
  and max-steps cases.
- Diagnostic codes are package-local and should use story-domain names such as
  `invalid-choice`, `story-ended-noop`, `pending-choices`, and `max-steps`.
  Do not reuse UI event-log labels such as `advance-blocked:ended`.
- `selectCurrentStoryLine` reads existing state only. It must not add a
  `currentLine` field to `StoryRuntimeSnapshot` or require a contract change.

## Harness Observability

`StoryVnScenario` must wire the existing Advance and choice buttons to the
StoryEngine helpers and expose snapshot/effect evidence with stable test IDs.

Required observable evidence:

- instruction pointer
- ended flag
- variables
- pending choices
- latest dialog speaker and text from `selectCurrentStoryLine`
- latest effect
- diagnostics

Screenshot evidence path:

- `test-results/story-vn.png`

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Advance to text | Unit and smoke |
| Advance to contiguous choices | Unit and smoke |
| Valid choice jumps only | Unit |
| Branch advance sets variable | Unit and smoke |
| Branch advance emits gameplay event | Unit and smoke |
| Invalid choice no-op diagnostic | Unit |
| Ended advance no-op diagnostic | Unit |
| Pending choices block advance diagnostic | Unit |
| Max-step guard diagnostic | Unit |
| Snapshot satisfies public schema | Unit |

## Regression Requirements

Required regression cases:

- Normal path: advance to first text, then advance to choices with both options
  collected.
- Branch path: valid choice jumps only; the next advance sets the route
  variable and emits gameplay event effects.
- Boundary path: invalid choice returns the same effective state plus a
  diagnostic.
- No-op path: ended advance returns the same effective state plus a diagnostic.
- Guard path: `maxSteps` returns a diagnostic without throwing.
- Serialization path:
  `StoryRuntimeSnapshotSchema.parse(storyRuntimeSnapshot(state))` validates the
  public snapshot contract.

Test placement:

- `packages/story-engine/src/**/*.test.ts`
- `tests/smoke/story-vn.spec.ts`

Smoke requirements for `tests/smoke/story-vn.spec.ts`:

- Boot `/?scenario=story-vn`.
- Click Advance and assert the first dialogue.
- Click Advance and assert choices.
- Choose "Follow the witness into class", then Advance.
- Assert variable `route: classroom`, gameplay event
  `grant-evidence evidence:keycard`, branch dialogue, and ended evidence after
  final Advance.
- Save `test-results/story-vn.png` after branch evidence is visible.

## Dependency Changes

None.

## CCR Triggers

Any public contract or `.nani` IR shape change.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm vitest run packages/story-engine
pnpm test:smoke tests/smoke/story-vn.spec.ts
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/story-vn-stepper.md
```

## Programmatic Acceptance

Targeted StoryEngine unit tests, targeted story-vn smoke, and subsystem
validation pass.

## Manual Acceptance

Reviewer confirms:

- Advance is a confirm-to-next-stop action, not fast-forward.
- Choice selection does not auto-advance.
- Diagnostics stay out of `StoryRuntimeSnapshot`.
- Current-line selection is not duplicated inside the harness, UI Kit, or the
  future vertical-slice integration.
- No scheduler, typewriter, autoplay, fast-forward, backlog UI, save/load,
  editor behavior, or timing API slipped in.

## Stop Conditions

Stop and document a public-core or integration follow-up in the review packet
if implementation requires:

- editing `apps/game` outside `apps/game/src/harness/scenarios/story-vn/**`
- editing shared fixtures
- editing `packages/contracts/**`
- editing `packages/presentation-contracts/**`
- editing `.nani` IR or parser public types
- adding `currentLine`, diagnostic, or runner metadata to public contract
  snapshots instead of keeping it package-local
- changing dependencies, `package.json`, or `pnpm-lock.yaml`

## Temporary Harness Cleanup

Remove `apps/game/src/harness/scenarios/story-vn/**` and
`tests/smoke/story-vn.spec.ts` after integration.

## Review Packet

- Changed files summary.
- Test output, including the targeted smoke command.
- Screenshot path: `test-results/story-vn.png`.
- Residual risks.
- Any follow-up needed for scheduler, typewriter, autoplay, fast-forward, or
  integration-owned harness behavior.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

No save migration required.

## Done When

- Required tests pass.
- `test-results/story-vn.png` is captured by the story-vn smoke test.
- Diff stays inside allowed paths.
- No public contracts, shared fixtures, dependencies, or lockfiles are changed.
