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
- Updated: `2026-06-14`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/r3f-first-person.md`

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
