# Pixi VN Presenter

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/pixi-vn-presenter`

## Worktree Path

- `.worktrees/pixi-vn-presenter`

## Status

- State: `Ready`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-15`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/pixi-vn-presenter.md`

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
你在 V-Ronpa 独立 worktree 中执行 docs/tasks/pixi-vn-presenter.md。
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/worktree-flow.md、docs/architecture/harness-gates.md、以及本 task card。
先运行 pnpm setup:worktree-env；Vite/Playwright 会读取 .env.worktree 隔离端口，不要提交 .env.worktree、.local-state、test-results 或 playwright-report。
本线目标是在 packages/pixi-presenter 和 P0 预留的 /?scenario=pixi-vn 中完成立绘占位、简单效果和缺资源 fallback 验证。
严格遵守 Allowed Paths / Forbidden Paths；不要改 public contracts、presentation contracts、package.json、pnpm-lock.yaml。
只能使用 apps/game/src/harness/scenarios/pixi-vn/** 和 tests/smoke/pixi-vn.spec.ts；不要修改 apps/game 其他文件。
若发现必须改 apps/game 其他文件、shared fixture、contracts、依赖、或任务卡外路径，停止并在 review packet 中说明需要 public-core/integration follow-up，不要扩大范围。
实现后运行 Required Gates，最终运行 BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-vn-presenter.md。
输出 changed files、测试结果、截图路径、残余风险。
```

## Goal

Render VN placeholder portraits and simple effects in `pixi-presenter` using
the P0 `pixi-vn` harness entry.

## Context

The harness entry is `/?scenario=pixi-vn`. Image assets are expected under
`apps/game/public/harness/portraits/**`, but may be missing during development.

## Constraints

- Pixi owns 2D presentation only.
- Use imagegen harness assets when present.
- Provide a programmatic fallback when assets are missing.

## Allowed Paths

- `packages/pixi-presenter/**`
- `apps/game/src/harness/scenarios/pixi-vn/**`
- `tests/smoke/pixi-vn.spec.ts`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `pnpm-lock.yaml`
- `package.json`

## Contracts

Honor `PresentationCommand` and `PresenterPort`.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| `char-enter` slot rendering | Snapshot or smoke |
| Missing portrait fallback | Smoke |
| Flash/shake | Snapshot or smoke |

## Regression Requirements

Required regression cases:

- Normal path: portrait image or placeholder appears.
- Boundary path: missing asset falls back cleanly.
- No-op path: unknown non-Pixi command does not crash.

Test placement:

- `packages/pixi-presenter/**`
- `tests/smoke/pixi-vn.spec.ts`

## Dependency Changes

None.

## CCR Triggers

Any public presentation contract, dependency, or app-wide harness change.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm --filter @v-ronpa/game build
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-vn-presenter.md
```

## Programmatic Acceptance

Build, smoke, and subsystem validation pass.

## Manual Acceptance

Reviewer checks screenshot evidence for portrait placement and effect
readability.

## Temporary Harness Cleanup

Remove `apps/game/src/harness/scenarios/pixi-vn/**` and
`tests/smoke/pixi-vn.spec.ts` after integration.

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
