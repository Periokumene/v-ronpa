# VN Dialog Surface

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/vn-dialog-surface`

## Worktree Path

- `.worktrees/vn-dialog-surface`

## Status

- State: `Archived`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-15`
- Completed Commit: `4db94ee`
- Archive Target: `docs/archive/completed-tasks/vn-dialog-surface.md`

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
你在 V-Ronpa 独立 worktree 中执行 docs/tasks/vn-dialog-surface.md。
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/worktree-flow.md、docs/architecture/harness-gates.md、以及本 task card。
先运行 pnpm setup:worktree-env；Vite/Playwright 会读取 .env.worktree 隔离端口，不要提交 .env.worktree、.local-state、test-results 或 playwright-report。
本线目标是在 packages/ui-kit 和 P0 预留的 /?scenario=vn-dialog 中完成 DOM VN 对话框、推进、选择和结束态验证。
严格遵守 Allowed Paths / Forbidden Paths；不要改 public contracts、package.json、pnpm-lock.yaml。
只能使用 apps/game/src/harness/scenarios/vn-dialog/** 和 tests/smoke/vn-dialog.spec.ts；不要修改 apps/game 其他文件。
若发现必须改 apps/game 其他文件、shared fixture、contracts、依赖、或任务卡外路径，停止并在 review packet 中说明需要 public-core/integration follow-up，不要扩大范围。
实现后运行 Required Gates，最终运行 BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/vn-dialog-surface.md。
输出 changed files、测试结果、截图路径、残余风险。
```

## Goal

Add a reusable controlled DOM VN dialog surface in `ui-kit` using the P0
`vn-dialog` harness entry.

This line is a UI surface line. It proves that DOM can render and operate a VN
dialog with advance, choices, keyboard confirm/cancel, and ended state
observability. It must not take ownership of StoryEngine branching semantics,
`.nani` parsing, script scheduling, or integration-wide harness behavior.

## Context

The harness entry is `/?scenario=vn-dialog`.

Related but separate work:

- `docs/tasks/story-vn-stepper.md` owns StoryEngine advance, choice branching,
  invalid choice handling, gameplay effects, serialization, and ended no-op
  semantics.
- This task owns the DOM presentation and input surface only. It may render data
  shaped like `StoryRuntimeSnapshot` / `StoryChoiceOption`, but it must not
  import `story-engine` or `nani-parser` from `packages/ui-kit`.
- The P0 `vn-dialog` scenario should use local scenario state to demonstrate UI
  event flow without reimplementing StoryEngine policy.
- Choice objects are UI options here, not branch instructions. The component and
  scenario must not inspect or interpret `goto`, route variables, labels, or
  gameplay events.

## Constraints

- DOM owns text-heavy VN UI.
- Keep the UI 70% developer-readable and 30% atmospheric.
- Do not implement autoplay, typewriter, or full backlog.
- Do not add a VN theme system.
- Do not implement a generic branch tree or script runtime in the harness.
- Do not implement StoryEngine diagnostics, route variables, `goto`, branch
  resolution, gameplay events, presentation-command selection, or script
  scheduling in this UI line.
- Do not add package dependencies or change public contracts.
- Do not edit app-wide CSS. Reuse existing harness classes and use minimal
  component-local inline style / CSS variable hooks only when needed.
- Preserve existing `DialogBox` behavior for the baseline harness unless an
  implementation detail can be changed without breaking current callers.

## Functional Intent

- Render the current VN line with optional speaker, readable body text, compact
  controls, and a low-chrome visual treatment that protects the playfield.
- Render choice controls only when choices are pending.
- Support advance, choice selection, cancel, and ended-state feedback through
  controlled callbacks.
- Make ended state explicit in the DOM and disable advance in that state.
- Keep the center of the playfield visually clear; the VN dialog should feel
  like an overlay on a playable scene, not a full-page app dashboard.
- Keep backlog scope light. A current-line or lightweight modal inspection path
  is acceptable; full backlog history is out of scope.

## Design Intent

- Visual tone: readable developer harness first, atmospheric VN layer second.
- Material language: translucent dark panel, existing accent/gold colors, tight
  8px-or-less radii, compact controls, no decorative full-screen chrome.
- Interaction tone: predictable and testable. Button clicks and keyboard input
  should map directly to observable harness events.
- Accessibility: expose the dialog as a meaningful region; speaker, text,
  choices, ended state, and disabled controls must be reachable and assertable
  through semantic DOM / Playwright locators.
- Motion: no typewriter, autoplay, or attention-heavy animation. Respect the
  task card's P0 verification purpose.

## Architecture And Boundary Decisions

- Add and export a `VnDialogSurface` component from `@v-ronpa/ui-kit`.
- Prefer controlled props over children-driven behavior. The caller provides
  current line data, choices, ended state, and event callbacks.
- The component may use `StoryChoiceOption` from `@v-ronpa/contracts` for choice
  shape compatibility.
- The component must not depend on `@v-ronpa/story-engine`,
  `@v-ronpa/nani-parser`, Pixi, R3F, Dexie, Howler, or app harness internals.
- The `vn-dialog` scenario owns only a local demonstration state machine. It
  should model enough state to drive UI evidence, not script semantics.
- The local demonstration state should be a UI-only state such as
  `demoStep: "line" | "choices" | "ended"`. It must not grow into a mini story
  runtime with labels, jumps, route state, gameplay effects, or diagnostics.
- If implementation needs shared fixtures, app-wide route/registry changes,
  public contract changes, dependency changes, or edits outside the allowed
  scenario folder, stop and record a public-core/integration follow-up in the
  review packet.

## Component Interface

Implement the package-local public API with this shape unless TypeScript
ergonomics require a minor naming adjustment:

```ts
export interface VnDialogSurfaceProps {
  speaker?: string;
  text: string;
  choices?: StoryChoiceOption[];
  ended?: boolean;
  onAdvance?: () => void;
  onAdvanceBlocked?: (reason: "ended") => void;
  onChoice?: (index: number, choice: StoryChoiceOption) => void;
  onCancel?: () => void;
}
```

Behavior:

- No pending choices and not ended: advance button is enabled and `Enter` on the
  dialog root triggers `onAdvance`.
- Pending choices and not ended: choice buttons render; selecting a choice calls
  `onChoice(index, choice)`.
- Choice rendering uses display data only, normally `choice.text`. The component
  may pass the original choice object back to callers, but must not read or act
  on `choice.goto`.
- Pending choices and root-focused `Enter`: select the first choice for keyboard
  smoke coverage. Native button keyboard behavior should not double fire.
- `Escape` on the dialog root triggers `onCancel`.
- Ended: advance is disabled; `Enter` calls `onAdvanceBlocked("ended")` without
  changing scenario state.
- UI blocked-advance observability should be logged as
  `advance-blocked:ended`, distinct from StoryEngine diagnostics such as
  `story-ended-noop`.
- Add a concise code comment around the root keyboard handler explaining the
  Enter/Escape boundary so future input-lock regressions are easy to trace.

## Allowed Paths

- `packages/ui-kit/**`
- `apps/game/src/harness/scenarios/vn-dialog/**`
- `tests/smoke/vn-dialog.spec.ts`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `pnpm-lock.yaml`
- `package.json`

## Contracts

Honor current story snapshot and choice shapes passed in by the app harness.

No contract edits are allowed. The UI may consume `StoryChoiceOption` shape from
`@v-ronpa/contracts`, but it must not alter `StoryRuntimeSnapshot`,
`StoryChoiceOption`, `.nani` IR, or presentation contracts.

## Harness Scenario Requirements

Use only `apps/game/src/harness/scenarios/vn-dialog/**`.

The scenario should demonstrate three states:

- Initial line: speaker and text are visible, no choices are shown, advance is
  enabled.
- Choice prompt: two choices are visible and selectable.
- Ended: final line is visible, ended state is explicit, advance is disabled.

The scenario must expose both forms of observability:

- `data-state` or equivalent testable attributes for initial/choice/ended state.
- Harness event log entries for advance, choice, cancel, ended, and
  `advance-blocked:ended`.

The scenario should not import `story-engine` or `nani-parser`; use local
contract-shaped fixture data instead.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Advance action | Smoke |
| Choice list | Smoke |
| Keyboard confirm/cancel | Smoke |
| Ended state | Smoke |
| No choices hidden | Smoke |
| Ended advance blocked | Smoke and event log |
| Scenario state | `data-state` / smoke |
| UI event flow | Harness event log |

## Regression Requirements

Required regression cases:

- Normal path: focus dialog, press `Enter` to advance, verify choices, choose
  one option, and verify ended state.
- Boundary path: initial state has no visible choice controls.
- No-op path: ended state disables advance; pressing `Enter` records an ended
  `advance-blocked:ended` event and leaves state/text unchanged.
- Keyboard path: `Escape` triggers cancel observability without leaving the
  scenario in an invalid state.

Test placement:

- `packages/ui-kit/**` for component source only; do not create artificial pure
  helpers solely to force package-level unit coverage.
- `tests/smoke/vn-dialog.spec.ts`

Smoke test structure:

- Prefer three focused Playwright tests rather than one long test so failures
  identify the broken state.
- Capture review screenshots:
  - `test-results/vn-dialog.png`
  - `test-results/vn-dialog-choices.png`
  - `test-results/vn-dialog-ended.png`
- Component behavior is browser-verified through smoke. Do not add React
  component tests that require new jsdom/testing-library dependencies.

## Dependency Changes

None.

## CCR Triggers

Any public contract, dependency, or app-wide harness change.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm --filter @v-ronpa/game build
pnpm exec playwright test tests/smoke/vn-dialog.spec.ts
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/vn-dialog-surface.md
```

## Programmatic Acceptance

Build, smoke, and subsystem validation pass.

## Manual Acceptance

Reviewer checks text readability, keyboard affordance, choice clarity, ended
state clarity, and playfield protection.

## Temporary Harness Cleanup

Remove `apps/game/src/harness/scenarios/vn-dialog/**` and
`tests/smoke/vn-dialog.spec.ts` after integration.

## Review Packet

- Changed files summary.
- Test output.
- Screenshot paths:
  - `test-results/vn-dialog.png`
  - `test-results/vn-dialog-choices.png`
  - `test-results/vn-dialog-ended.png`
- Residual risks, especially any deferred public-core/integration follow-up.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

No save migration required.

## Done When

- Required tests pass.
- Diff stays inside allowed paths.
- `package.json` and `pnpm-lock.yaml` are unchanged.
- Public contracts and `.nani` IR are unchanged.
- Review packet includes changed files, test output, screenshot paths, and
  residual risks.
