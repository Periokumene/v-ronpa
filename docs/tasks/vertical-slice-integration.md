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
- Updated: `2026-06-14`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/vertical-slice-integration.md`

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
