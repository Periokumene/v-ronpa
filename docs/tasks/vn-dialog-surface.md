# VN Dialog Surface

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/vn-dialog-surface`

## Worktree Path

- `.worktrees/vn-dialog-surface`

## Status

- State: `Ready`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-14`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/vn-dialog-surface.md`

## Goal

Add the DOM VN dialog surface in `ui-kit` using the P0 `vn-dialog` harness
entry.

## Context

The harness entry is `/?scenario=vn-dialog`.

## Constraints

- DOM owns text-heavy VN UI.
- Keep the UI 70% developer-readable and 30% atmospheric.
- Do not implement autoplay, typewriter, or full backlog.

## Allowed Paths

- `packages/ui-kit/**`
- `apps/game/src/harness/scenarios/vn-dialog/**`
- `tests/smoke/vn-dialog.spec.ts`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `pnpm-lock.yaml`
- `package.json`

## Contracts

Honor current story snapshot and choice shapes passed in by the app harness.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Advance action | Smoke |
| Choice list | Smoke |
| Keyboard confirm/cancel | Smoke |
| Ended state | Smoke |

## Regression Requirements

Required regression cases:

- Normal path: advance and choose.
- Boundary path: no choices hides choice controls.
- No-op path: ended state disables advance.

Test placement:

- `packages/ui-kit/**`
- `tests/smoke/vn-dialog.spec.ts`

## Dependency Changes

None.

## CCR Triggers

Any public contract, dependency, or app-wide harness change.

## Required Gates

```bash
pnpm --filter @v-ronpa/game build
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/vn-dialog-surface.md
```

## Programmatic Acceptance

Build, smoke, and subsystem validation pass.

## Manual Acceptance

Reviewer checks text readability and playfield protection.

## Temporary Harness Cleanup

Remove `apps/game/src/harness/scenarios/vn-dialog/**` and
`tests/smoke/vn-dialog.spec.ts` after integration.

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
