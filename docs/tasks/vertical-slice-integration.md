# Navi To VN Vertical Slice Integration

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/navi-to-vn-vertical-slice`

## Worktree Path

- `.worktrees/navi-to-vn-vertical-slice`

## Status

- State: `Draft`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-15`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/vertical-slice-integration.md`

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
你在 V-Ronpa integration worktree 中执行 docs/tasks/vertical-slice-integration.md。
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/worktree-flow.md、docs/architecture/harness-gates.md、以及本 task card。
先运行 pnpm setup:worktree-env；Vite/Playwright 会读取 .env.worktree 隔离端口，不要提交 .env.worktree、.local-state、test-results 或 playwright-report。
本线必须等待 navi-interaction、r3f-first-person、story-vn、vn-dialog、pixi-vn 五条独立线合入后再启动。
目标只是在 P0 预留的 /?scenario=vertical-slice 中联通首个可玩切片，不新增 public contracts、不扩大到生产 app flow。
只能使用 apps/game/src/harness/scenarios/vertical-slice/** 和 tests/smoke/vertical-slice.spec.ts；不要修改 apps/game 其他文件。
若发现必须改 apps/game 其他文件、shared fixture、contracts、依赖、或任务卡外路径，停止并在 review packet 中说明需要 public-core/integration follow-up，不要扩大范围。
实现后运行 Required Gates，最终运行 BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/vertical-slice-integration.md。
输出 changed files、测试结果、截图路径、残余风险。
```

## Goal

After P1-A through P1-E merge, connect the full playable path in the P0
`vertical-slice` harness entry.

## Context

The harness entry is `/?scenario=vertical-slice`.

## Constraints

- Start only after independent lines merge.
- Do not introduce new public contracts.
- Do not implement unrelated Trial, save/load, or production asset behavior.

## Allowed Paths

- `apps/game/src/harness/scenarios/vertical-slice/**`
- `tests/smoke/vertical-slice.spec.ts`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `pnpm-lock.yaml`
- `package.json`

## Contracts

Consume existing P0 contracts and merged P1 package APIs.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Spawn and move in hall | Smoke screenshot |
| Item interaction | Smoke state |
| Evidence appears in inspector | Smoke state |
| Map transition | Smoke state and screenshot |
| VN dialog trigger | Smoke state and screenshot |
| Choice A returns to hallway | Smoke state |
| Choice B changes scene | Smoke state |

## Regression Requirements

Required regression cases:

- Normal path: item interaction, VN trigger, choice branch.
- Boundary path: no active interactable does not change state.
- Integration path: choice A returns, choice B changes map.

Test placement:

- `tests/smoke/vertical-slice.spec.ts`

## Dependency Changes

None.

## CCR Triggers

Any public contract or app-wide harness change beyond this scenario.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm --filter @v-ronpa/game build
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/vertical-slice-integration.md
```

## Programmatic Acceptance

Build, smoke, and subsystem validation pass.

## Manual Acceptance

Reviewer plays the route and checks screenshots for readability.

## Temporary Harness Cleanup

This is the final temporary integration entry. Remove
`apps/game/src/harness/scenarios/vertical-slice/**`,
`tests/smoke/vertical-slice.spec.ts`, and related fixture assets after the
accepted slice is migrated into production harness or app flow.

## Review Packet

- Changed files summary.
- Screenshot paths.
- Test output.
- Residual risks.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

No save migration required.

## Done When

- Full smoke route passes.
- Diff stays inside allowed paths.
