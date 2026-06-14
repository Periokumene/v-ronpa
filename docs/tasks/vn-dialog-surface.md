# VN Dialog Surface

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/vn-dialog-surface`

## Worktree Path

- `.worktrees/vn-dialog-surface`

## Status

- State: `Ready`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-15`
- Completed Commit: `TBD`
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

Add the DOM VN dialog surface in `ui-kit` using the P0 `vn-dialog` harness
entry.

## Context

The harness entry is `/?scenario=vn-dialog`.

## Constraints

- DOM owns text-heavy VN UI.
- Keep the UI 70% developer-readable and 30% atmospheric.
- Do not implement autoplay, typewriter, or full backlog.

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

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Advance action | Smoke |
| Choice list | Smoke |
| Keyboard confirm/cancel | Smoke |
| Ended state | Smoke |

## Regression Requirements

Required regression cases:

- Normal path: advance and choose.
- Boundary path: no choices hides choice controls.
- No-op path: ended state disables advance.

Test placement:

- `packages/ui-kit/**`
- `tests/smoke/vn-dialog.spec.ts`

## Dependency Changes

None.

## CCR Triggers

Any public contract, dependency, or app-wide harness change.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm --filter @v-ronpa/game build
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/vn-dialog-surface.md
```

## Programmatic Acceptance

Build, smoke, and subsystem validation pass.

## Manual Acceptance

Reviewer checks text readability and playfield protection.

## Temporary Harness Cleanup

Remove `apps/game/src/harness/scenarios/vn-dialog/**` and
`tests/smoke/vn-dialog.spec.ts` after integration.

## Review Packet

- Changed files summary.
- Screenshot path.
- Test output.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

No save migration required.

## Done When

- Required tests pass.
- Diff stays inside allowed paths.
