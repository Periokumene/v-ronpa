# Navi Interaction Flow

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/navi-interaction-flow`

## Worktree Path

- `.worktrees/navi-interaction-flow`

## Status

- State: `Ready`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-14`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/navi-interaction-flow.md`

## Goal

Implement Navi interaction flow across `gameplay` and `navi-director` using the
P0 `navi-interaction` harness entry.

## Context

The harness entry is `/?scenario=navi-interaction`.

## Constraints

- Do not edit shared contracts.
- Do not edit app files outside this scenario folder.
- Do not add dependencies.

## Allowed Paths

- `packages/gameplay/**`
- `packages/navi-director/**`
- `apps/game/src/harness/scenarios/navi-interaction/**`
- `tests/smoke/navi-interaction.spec.ts`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `pnpm-lock.yaml`
- `package.json`

## Contracts

Honor `PlayerPose`, `WorldMapDef.walkBounds`, `NaviRuntimeState.playerPose`,
and `InteractableDef.action`.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Focus nearest interactable | Unit test and smoke state |
| Item/evidence interaction | Unit test and smoke state |
| Map change | Unit test and smoke state |
| Start script / close overlay | Unit test and smoke state |

## Regression Requirements

Required regression cases:

- Normal path: item grant and script start.
- Boundary path: no nearby interactable returns no-op.
- No-op path: closing overlay from walk remains walk.

Test placement:

- `packages/gameplay/src/**/*.test.ts`
- `packages/navi-director/src/**/*.test.ts`
- `tests/smoke/navi-interaction.spec.ts`

## Dependency Changes

None.

## CCR Triggers

Any public contract change or app-wide harness change.

## Required Gates

```bash
pnpm vitest run packages/gameplay packages/navi-director
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/navi-interaction-flow.md
```

## Programmatic Acceptance

Tests and subsystem validation pass.

## Manual Acceptance

Reviewer confirms the diff is limited to allowed paths and uses the fixed
scenario entry.

## Temporary Harness Cleanup

Remove `apps/game/src/harness/scenarios/navi-interaction/**` and
`tests/smoke/navi-interaction.spec.ts` after vertical-slice integration accepts
the behavior.

## Review Packet

- Changed files summary.
- Test output.
- Smoke screenshot path.
- Residual risks.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

No save migration required.

## Done When

- Required tests pass.
- Diff stays inside allowed paths.
