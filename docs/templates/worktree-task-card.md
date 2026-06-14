# Worktree Task Card Template

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/<feat>-<module(s)>`

## Worktree Path

- Manual Git worktree suggestion: `.worktrees/<name>`
- Codex App may assign a managed path under `$CODEX_HOME/worktrees`; use the assigned path if launched from Codex App.

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
