# Pixi VN Presenter

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/pixi-vn-presenter`

## Worktree Path

- `.worktrees/pixi-vn-presenter`

## Status

- State: `Ready`
- Owner: `TBD`
- Created: `2026-06-14`
- Updated: `2026-06-14`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/pixi-vn-presenter.md`

## Goal

Render VN placeholder portraits and simple effects in `pixi-presenter` using
the P0 `pixi-vn` harness entry.

## Context

The harness entry is `/?scenario=pixi-vn`. Image assets are expected under
`apps/game/public/harness/portraits/**`, but may be missing during development.

## Constraints

- Pixi owns 2D presentation only.
- Use imagegen harness assets when present.
- Provide a programmatic fallback when assets are missing.

## Allowed Paths

- `packages/pixi-presenter/**`
- `apps/game/src/harness/scenarios/pixi-vn/**`
- `tests/smoke/pixi-vn.spec.ts`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `pnpm-lock.yaml`
- `package.json`

## Contracts

Honor `PresentationCommand` and `PresenterPort`.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| `char-enter` slot rendering | Snapshot or smoke |
| Missing portrait fallback | Smoke |
| Flash/shake | Snapshot or smoke |

## Regression Requirements

Required regression cases:

- Normal path: portrait image or placeholder appears.
- Boundary path: missing asset falls back cleanly.
- No-op path: unknown non-Pixi command does not crash.

Test placement:

- `packages/pixi-presenter/**`
- `tests/smoke/pixi-vn.spec.ts`

## Dependency Changes

None.

## CCR Triggers

Any public presentation contract, dependency, or app-wide harness change.

## Required Gates

```bash
pnpm --filter @v-ronpa/game build
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-vn-presenter.md
```

## Programmatic Acceptance

Build, smoke, and subsystem validation pass.

## Manual Acceptance

Reviewer checks screenshot evidence for portrait placement and effect
readability.

## Temporary Harness Cleanup

Remove `apps/game/src/harness/scenarios/pixi-vn/**` and
`tests/smoke/pixi-vn.spec.ts` after integration.

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
