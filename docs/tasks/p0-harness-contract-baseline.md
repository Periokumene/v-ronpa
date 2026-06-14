# P0 Harness And Contract Baseline

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/p0-harness-contract-baseline`

## Worktree Path

- `.worktrees/p0-harness-contract-baseline`

## Status

- State: `Ready`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-15`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/p0-harness-contract-baseline.md`

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
你在 V-Ronpa public-core worktree 中执行 docs/tasks/p0-harness-contract-baseline.md。
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/worktree-flow.md、docs/architecture/harness-gates.md、以及本 task card。
先运行 pnpm setup:worktree-env；Vite/Playwright 会读取 .env.worktree 隔离端口，不要提交 .env.worktree、.local-state、test-results 或 playwright-report。
本线目标是建立公共 contracts、固定 harness entries、fixture 目录、task cards 和 smoke evidence，供后续独立线使用。
严格遵守 Allowed Paths / Forbidden Paths；任何额外 public schema、依赖或 .nani IR 变化都需要 CCR。
实现后运行 Required Gates，最终运行 BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/p0-harness-contract-baseline.md。
输出 changed files、测试结果、截图路径、残余风险。
```

## Goal

Establish the public contracts, fixed harness scenario entries, fixture folders,
task cards, and smoke evidence needed before independent subsystem worktrees
fan out.

## Context

See `docs/architecture/system-guide.md`, `docs/architecture/worktree-flow.md`,
`docs/architecture/harness-gates.md`, and
`docs/ccr/navi-vertical-slice-contract-baseline.md`.

## Constraints

- Do not implement P1 subsystem behavior.
- Do not add save/load.
- Do not add dependencies or physics.
- Keep harness scenario entries fixed and removable.

## Allowed Paths

- `packages/contracts/**`
- `packages/gameplay/**`
- `packages/navi-director/**`
- `docs/ccr/**`
- `docs/tasks/**`
- `docs/architecture/harness-gates.md`
- `apps/game/src/App.tsx`
- `apps/game/src/harness/**`
- `apps/game/src/styles.css`
- `apps/game/public/harness/**`
- `tests/smoke/harness-registry.spec.ts`

## Forbidden Paths

- `pnpm-lock.yaml`
- `package.json`

## Contracts

Adds optional `AabbBounds`, `PlayerPose`, `WorldMapDef.walkBounds`,
`NaviRuntimeState.playerPose`, and `InteractableDef.action` `change-map`.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Fixed harness entries boot | `tests/smoke/harness-registry.spec.ts` |
| Contract additions validate | `packages/contracts/src/index.test.ts` |
| Map changes stay director-owned | `packages/gameplay/src/exploration.test.ts`, `packages/navi-director/src/index.test.ts` |

## Regression Requirements

Required regression cases:

- Normal path: fixed scenario route renders expected `harness-scenario-id`.
- Boundary path: gameplay treats `change-map` as director-owned.
- Serialization path: contracts parse optional pose and walk bounds.

Test placement:

- Package tests in touched packages.
- Harness smoke in `tests/smoke/harness-registry.spec.ts`.

## Dependency Changes

None.

## CCR Triggers

Any additional public schema, port, event, save data, manifest, or `.nani` IR
change after this card needs a new CCR.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm vitest run packages/contracts packages/gameplay packages/navi-director
pnpm --filter @v-ronpa/game build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/p0-harness-contract-baseline.md
```

## Programmatic Acceptance

The implementation is acceptable when package tests, app build, smoke tests,
and subsystem validation pass.

## Manual Acceptance

Review fixed scenario entries, fixture folder naming, CCR text, and task-card
path boundaries.

## Temporary Harness Cleanup

The fixed entries under `apps/game/src/harness/scenarios/**` and
`apps/game/public/harness/**` are temporary. Remove or replace them after the
vertical slice is accepted.

## Review Packet

- Changed files summary.
- Test and gate output.
- Screenshot path: `test-results/harness-registry.png`.
- Residual risk: P1 lines may still request a follow-up public-core patch if a
  missing seam is discovered.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting this branch removes the P1 fanout baseline and requires rebasing all
dependent worktrees.

## Done When

- Tests pass.
- Fixed scenario entries boot.
- Task cards for independent lines exist.
