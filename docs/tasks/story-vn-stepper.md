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
- Updated: `2026-06-14`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/story-vn-stepper.md`

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
