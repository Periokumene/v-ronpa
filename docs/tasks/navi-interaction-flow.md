# Navi Interaction Flow

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/navi-interaction-flow`

## Worktree Path

- `.worktrees/navi-interaction-flow`

## Status

- State: `Ready`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-15`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/navi-interaction-flow.md`

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
你在 V-Ronpa 独立 worktree 中执行 docs/tasks/navi-interaction-flow.md。
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/worktree-flow.md、docs/architecture/harness-gates.md、以及本 task card。
先运行 pnpm setup:worktree-env；Vite/Playwright 会读取 .env.worktree 隔离端口，不要提交 .env.worktree、.local-state、test-results 或 playwright-report。
本线目标是在 packages/gameplay、packages/navi-director 和 P0 预留的 /?scenario=navi-interaction 中完成交互流端到端验证。
严格遵守 Allowed Paths / Forbidden Paths；不要改 public contracts、package.json、pnpm-lock.yaml。
只能使用 apps/game/src/harness/scenarios/navi-interaction/** 和 tests/smoke/navi-interaction.spec.ts；不要修改 apps/game 其他文件。
若发现必须改 apps/game 其他文件、shared fixture、contracts、依赖、或任务卡外路径，停止并在 review packet 中说明需要 public-core/integration follow-up，不要扩大范围。
实现后运行 Required Gates，最终运行 BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/navi-interaction-flow.md。
输出 changed files、测试结果、截图路径、残余风险。
```

## Goal

Implement Navi interaction flow across `gameplay` and `navi-director` using the
P0 `navi-interaction` harness entry.

## Context

The harness entry is `/?scenario=navi-interaction`.

## Constraints

- Do not edit shared contracts.
- Do not edit app files outside this scenario folder.
- Do not add dependencies.

## Allowed Paths

- `packages/gameplay/**`
- `packages/navi-director/**`
- `apps/game/src/harness/scenarios/navi-interaction/**`
- `tests/smoke/navi-interaction.spec.ts`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `pnpm-lock.yaml`
- `package.json`

## Contracts

Honor `PlayerPose`, `WorldMapDef.walkBounds`, `NaviRuntimeState.playerPose`,
and `InteractableDef.action`.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Focus nearest interactable | Unit test and smoke state |
| Item/evidence interaction | Unit test and smoke state |
| Map change | Unit test and smoke state |
| Start script / close overlay | Unit test and smoke state |

## Regression Requirements

Required regression cases:

- Normal path: item grant and script start.
- Boundary path: no nearby interactable returns no-op.
- No-op path: closing overlay from walk remains walk.

Test placement:

- `packages/gameplay/src/**/*.test.ts`
- `packages/navi-director/src/**/*.test.ts`
- `tests/smoke/navi-interaction.spec.ts`

## Dependency Changes

None.

## CCR Triggers

Any public contract change or app-wide harness change.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm vitest run packages/gameplay packages/navi-director
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/navi-interaction-flow.md
```

## Programmatic Acceptance

Tests and subsystem validation pass.

## Manual Acceptance

Reviewer confirms the diff is limited to allowed paths and uses the fixed
scenario entry.

## Temporary Harness Cleanup

Remove `apps/game/src/harness/scenarios/navi-interaction/**` and
`tests/smoke/navi-interaction.spec.ts` after vertical-slice integration accepts
the behavior.

## Review Packet

- Changed files summary.
- Test output.
- Smoke screenshot path.
- Residual risks.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

No save migration required.

## Done When

- Required tests pass.
- Diff stays inside allowed paths.
