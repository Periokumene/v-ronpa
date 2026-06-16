# Navi To VN Vertical Slice Integration

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `integration/navi-vn-vertical-slice-0616`

## Worktree Path

- `.worktrees/navi-to-vn-vertical-slice`

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-06-14`
- Updated: `2026-06-16`
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
目标是在 P0 预留的 /?scenario=vertical-slice 中联通首个可玩切片，随后移除五个临时 subsystem scenario。
本轮允许通过 CCR-0001 增加 Navi/R3F interaction authority 的 additive public contract。
实现后运行 Required Gates；累计合线分支不再对单张 subsystem task 运行 validate:subsystem。
输出 changed files、测试结果、截图路径、残余风险。
```

## Goal

After P1-A through P1-E merge, connect the full playable path in the P0
`vertical-slice` harness entry.

## Context

The harness entry is `/?scenario=vertical-slice`.

## Constraints

- Start only after independent lines merge.
- Public contract changes require CCR and additive compatibility.
- Do not implement unrelated Trial, save/load, or production asset behavior.

## Allowed Paths

- `apps/game/src/harness/scenarios/vertical-slice/**`
- `apps/game/src/harness/registry.tsx`
- `tests/smoke/harness-registry.spec.ts`
- `tests/smoke/vertical-slice.spec.ts`
- `packages/contracts/**`
- `packages/navi-director/**`
- `docs/ccr/**`
- `docs/archive/completed-tasks/**`
- `docs/architecture/harness-gates.md`

## Forbidden Paths

- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `pnpm-lock.yaml`
- `package.json`

## Contracts

Consume merged P1 package APIs and add CCR-0001 for Navi/R3F interaction
authority:

- `NaviInteractionSensorReport`
- `NaviInteractionView`
- `NaviInteractionConfirmRequest`
- `InteractionBlockedReason`

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Spawn and move in hall | Smoke screenshot |
| Item interaction | Smoke state |
| Evidence appears in inspector | Smoke state |
| Map transition | Smoke state and screenshot |
| VN dialog trigger | Smoke state and screenshot |
| Choice A returns to hallway | Smoke state |
| Choice B grants evidence / branches route | Smoke state and screenshot |

## Regression Requirements

Required regression cases:

- Normal path: item interaction, VN trigger, choice branch.
- Boundary path: no active interactable does not change state.
- Integration path: choice A returns, choice B branches and applies gameplay event.

Test placement:

- `tests/smoke/vertical-slice.spec.ts`
- package unit tests for contract and Navi authority helpers

## Dependency Changes

None.

## CCR Triggers

Any future public contract or app-wide harness change beyond CCR-0001.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm validate:contracts
pnpm validate:boundaries
pnpm test
pnpm --filter @v-ronpa/game build
pnpm test:smoke
pnpm validate:baseline
```

## Programmatic Acceptance

Build, smoke, and baseline validation pass.

## Manual Acceptance

Reviewer plays the route and checks screenshots for readability.

## Temporary Harness Cleanup

Removed the five temporary subsystem scenario entries and smoke specs after
their behavior was integrated:

- `navi-interaction`
- `r3f-first-person`
- `story-vn`
- `vn-dialog`
- `pixi-vn`

Keep `/?scenario=vertical-slice` as the accepted integration harness for this
round. Future slices should create new scenario entries.

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
