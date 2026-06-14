# R3F First-Person Exploration

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/r3f-first-person`

## Worktree Path

- `.worktrees/r3f-first-person`

## Status

- State: `Ready`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-15`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/r3f-first-person.md`

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
你在 V-Ronpa 独立 worktree 中执行 docs/tasks/r3f-first-person.md。
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/worktree-flow.md、docs/architecture/harness-gates.md、以及本 task card。
先运行 pnpm setup:worktree-env；Vite/Playwright 会读取 .env.worktree 隔离端口，不要提交 .env.worktree、.local-state、test-results 或 playwright-report。
本线目标是在 packages/r3f-adapter 和 P0 预留的 /?scenario=r3f-first-person 中完成第一人称探索端到端验证。
严格遵守 Allowed Paths / Forbidden Paths；不要改 public contracts、package.json、pnpm-lock.yaml，也不要新增 Rapier/物理依赖。
只能使用 apps/game/src/harness/scenarios/r3f-first-person/** 和 tests/smoke/r3f-first-person.spec.ts；不要修改 apps/game 其他文件。
若发现必须改 apps/game 其他文件、shared fixture、contracts、依赖、或任务卡外路径，停止并在 review packet 中说明需要 public-core/integration follow-up，不要扩大范围。
实现后运行 Required Gates，最终运行 BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/r3f-first-person.md。
输出 changed files、测试结果、截图路径、残余风险。
```

## Goal

Implement first-person exploration presentation in `r3f-adapter` using the P0
`r3f-first-person` harness entry.

## Context

The harness entry is `/?scenario=r3f-first-person`.

## Constraints

- R3F owns presentation only, not gameplay rules.
- Use simple AABB clamp, not Rapier or new dependencies.
- Model assets may be missing; provide primitive fallback.

## Allowed Paths

- `packages/r3f-adapter/**`
- `apps/game/src/harness/scenarios/r3f-first-person/**`
- `tests/smoke/r3f-first-person.spec.ts`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `pnpm-lock.yaml`
- `package.json`

## Contracts

Honor `WorldMapDef`, `walkBounds`, `CameraControlMode`, and `InputLockState`.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| First-person view boots | Smoke screenshot |
| Movement clamps to AABB | Smoke or adapter test |
| Hotspot focus callback | Smoke state |
| Interact callback | Smoke state |
| Missing model fallback | Smoke screenshot |

## Regression Requirements

Required regression cases:

- Normal path: move/look/focus/interact.
- Boundary path: movement clamps at room bounds.
- Fallback path: missing glTF still renders primitives.

Test placement:

- `packages/r3f-adapter/**`
- `tests/smoke/r3f-first-person.spec.ts`

## Dependency Changes

None.

## CCR Triggers

Any new public contract, package dependency, or app-wide harness change.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm --filter @v-ronpa/game build
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/r3f-first-person.md
```

## Programmatic Acceptance

Build, smoke, and subsystem validation pass.

## Manual Acceptance

Reviewer checks screenshot readability and confirms playfield is not blocked by
HUD chrome.

## Temporary Harness Cleanup

Remove `apps/game/src/harness/scenarios/r3f-first-person/**` and
`tests/smoke/r3f-first-person.spec.ts` after integration.

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
