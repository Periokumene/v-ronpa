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

Add story-engine helpers for VN advance, branching, and ended state using the
P0 `story-vn` harness entry.

## Context

The harness entry is `/?scenario=story-vn`.

## Constraints

- Only implement advance, choice, and end behavior.
- Do not add typewriter, autoplay, full backlog UI, or save/load.

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

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Advance to text | Unit and smoke |
| Advance to choices | Unit and smoke |
| Choice sets variable | Unit and smoke |
| Choice emits gameplay event | Unit and smoke |
| Ended no-op | Unit |

## Regression Requirements

Required regression cases:

- Normal path: text then choices.
- Boundary path: invalid choice no-op.
- No-op path: ended state does not advance.
- Serialization path: snapshot remains serializable.

Test placement:

- `packages/story-engine/src/**/*.test.ts`
- `tests/smoke/story-vn.spec.ts`

## Dependency Changes

None.

## CCR Triggers

Any public contract or `.nani` IR shape change.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm vitest run packages/story-engine
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/story-vn-stepper.md
```

## Programmatic Acceptance

Tests and subsystem validation pass.

## Manual Acceptance

Reviewer confirms no scheduler, autoplay, or editor behavior slipped in.

## Temporary Harness Cleanup

Remove `apps/game/src/harness/scenarios/story-vn/**` and
`tests/smoke/story-vn.spec.ts` after integration.

## Review Packet

- Changed files summary.
- Test output.
- Residual risks.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

No save migration required.

## Done When

- Required tests pass.
- Diff stays inside allowed paths.
