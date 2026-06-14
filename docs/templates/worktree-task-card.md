# Worktree Task Card Template

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `subsystem/<name>`

## Worktree Path

- `.worktrees/<name>` or the path assigned by the coordinator.

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

## Dependency Changes

None. Do not edit `package.json` or `pnpm-lock.yaml` unless this section says `Allowed` and explains why.

## CCR Triggers

- Public schemas, ports, events, save data, manifest shape, or `.nani` IR must change.
- Allowed paths are insufficient to finish the task safely.
- A dependency change is required but not already allowed by this task card.

## Required Gates

```bash
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/<name>.md
```

Add package-specific commands here.

## Review Packet

- Changed files summary.
- Test and gate output.
- Screenshot paths for harness or visual changes.
- CCR link if contract changes were requested.
- Residual risks or known non-goals.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

State whether reverting this branch requires save migration, fixture updates, or harness cleanup.

## Done When

- Tests pass.
- Diff stays inside allowed paths.
- Public contract changes have a CCR.
- Summary includes changed files, verification, and residual risks.
