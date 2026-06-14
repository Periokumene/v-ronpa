# Worktree Task Card Template

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/<feat>-<module(s)>`

## Worktree Path

- Manual Git worktree suggestion: `.worktrees/<name>`
- Codex App may assign a managed path under `$CODEX_HOME/worktrees`; use the assigned path if launched from Codex App.

## Worktree Environment

Run once after the worktree is created:

```bash
pnpm setup:worktree-env
```

This creates an ignored `.env.worktree` with a worktree-specific
`PORT/VITE_DEV_PORT`. Vite and Playwright both read this file so parallel
worktrees do not share the same dev server. Do not commit `.env.worktree`,
`.local-state/`, `test-results/`, or `playwright-report/`.

## Thread Startup Prompt

Use this prompt when opening the implementation thread for this task:

```text
你在 V-Ronpa 独立 worktree 中执行 docs/tasks/<name>.md。
请先阅读 AGENTS.md、docs/architecture/system-guide.md、docs/architecture/worktree-flow.md、docs/architecture/harness-gates.md、以及本 task card。
先运行 pnpm setup:worktree-env；Vite/Playwright 会读取 .env.worktree 隔离端口，不要提交 .env.worktree、.local-state、test-results 或 playwright-report。
严格遵守 Allowed Paths / Forbidden Paths；不要改 public contracts、package.json、pnpm-lock.yaml，除非 task card 明确允许。
只能使用本卡预留的 app harness scenario 文件夹和 tests/smoke/<line>.spec.ts；独立线不得修改 apps/game 其他文件。
若发现必须改 apps/game 其他文件、shared fixture、contracts、依赖、或任务卡外路径，停止并在 review packet 中说明需要 public-core/integration follow-up，不要扩大范围。
实现后运行 Required Gates，最终运行 BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/<name>.md。
输出 changed files、测试结果、截图路径、残余风险。
```

## Status

- State: `Draft` (`Draft | Ready | In Progress | Blocked | Review | Done | Archived`)
- Owner: `TBD`
- Created: `YYYY-MM-DD`
- Updated: `YYYY-MM-DD`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/<name>.md`

## Goal

State the concrete outcome.

## Context

Reference relevant docs, packages, fixtures, and previous decisions.

## Constraints

List architectural rules and non-goals.

## Allowed Paths

- `packages/example/**`

## Forbidden Paths

- `packages/contracts/**` unless this task explicitly includes a CCR.
- `packages/presentation-contracts/**` unless this task explicitly includes a CCR.
- `packages/nani-parser/src/types.ts` unless this task explicitly includes a CCR.

## Contracts

Name public schemas, ports, events, or fixtures this task must honor.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Example behavior | Unit, contract, snapshot, or smoke evidence that proves it |

Every public behavior introduced or changed by this task should have an observable evidence row.

## Regression Requirements

This task must add or update tests for every changed public behavior.

Required regression cases:

- Normal path: `<case>`
- Boundary or rejection path: `<case>`
- No-op or unchanged-state path, if applicable: `<case>`
- Serialization, snapshot, or contract compatibility path, if applicable: `<case>`

Test placement:

- Package/unit tests: `<package>/src/**/*.test.ts`
- Contract or snapshot tests: `<package>/src/**/*.test.ts`
- Harness/smoke tests: `tests/smoke/**` only when this task explicitly allows app or harness changes.

If the right regression test cannot be added inside Allowed Paths, stop and document the gap in the review packet or create a follow-up task instead of widening scope silently.

## Dependency Changes

None. Do not edit `package.json` or `pnpm-lock.yaml` unless this section says `Allowed` and explains why.

## CCR Triggers

- Public schemas, ports, events, save data, manifest shape, or `.nani` IR must change.
- Allowed paths are insufficient to finish the task safely.
- A dependency change is required but not already allowed by this task card.

## Required Gates

Local iteration gates:

```bash
pnpm setup:worktree-env
pnpm vitest run <package-or-test-path>
pnpm typecheck
pnpm validate:boundaries
```

Merge gate:

```bash
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/<name>.md
```

Add package-specific commands here.

## Programmatic Acceptance

The implementation is programmatically acceptable when:

- Task-specific package tests pass.
- Required regression cases are covered by tests named in this card.
- `pnpm typecheck` passes.
- `pnpm validate:boundaries` passes.
- The merge gate passes with the task card and base branch.

Expected evidence:

- Test output for package-specific tests.
- Gate output for typecheck, boundaries, and subsystem validation.
- Screenshot paths only if this task changes app, harness, UI, or visual behavior.

## Manual Acceptance

The reviewer should inspect the final diff and review packet for:

- The implementation matches the Goal without widening scope.
- Public APIs are clear, stable, and documented by readable tests.
- Regression tests cover the acceptance matrix, including boundary/rejection cases.
- The diff stays inside Allowed Paths.
- Forbidden contracts, app surfaces, dependencies, and harness files are untouched unless explicitly allowed.
- Residual risks and follow-up tasks are explicit.

## Review Packet

- Changed files summary.
- Test and gate output.
- Regression coverage summary: which required cases were covered, and which were deferred.
- Screenshot paths for harness or visual changes.
- CCR link if contract changes were requested.
- Residual risks or known non-goals.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

State whether reverting this branch requires save migration, fixture updates, or harness cleanup.

## Done When

- Tests pass.
- Required regression tests are added or deferred with a clear reason.
- Diff stays inside allowed paths.
- Public contract changes have a CCR.
- Summary includes changed files, verification, and residual risks.
