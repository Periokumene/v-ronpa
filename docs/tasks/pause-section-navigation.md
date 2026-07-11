# Pause Section Navigation

## Base Branch

- `integration/v-ronpa-baseline`

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-07-11`
- Updated: `2026-07-11`
- Archive Target: `docs/archive/completed-tasks/pause-section-navigation.md`

## Goal

Make pause tabs sibling sections with constant-depth navigation and one-step close/resume across Game A and Harness.

## Constraints

- Public contract changes require `docs/ccr/pause-section-navigation.md`.
- No compatibility aliases, dependency changes, or save migration.
- Preserve unrelated changes, especially `apps/game-a/src/nani/opening.nani`.

## Allowed Paths

- `packages/contracts/**`
- `packages/game-flow-machine/**`
- `packages/app-vn-shell/**`
- `packages/ui-kit/**`
- `apps/game-a/**`
- `apps/game-harness/src/interaction/**`
- `tests/smoke/**`
- `docs/architecture/**`
- `docs/ccr/**`
- `docs/tasks/pause-section-navigation.md`
- `progress.md`

## Contracts

- `GamePauseSection`, `GameOverlayKind`, `GameInteractionContext`
- `InteractionCapabilitySnapshot`, `GameUiAction`
- `GameFlowEvent`, `GameFlowSnapshot`, `GameFlowShellAdapter`

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Pause defaults to first enabled section | shell helper unit tests and smoke |
| Tabs switch without history | flow and adapter unit tests |
| Close/Escape resumes once | flow tests and Game A/Harness smoke |
| Title overlays remain independent | contract/flow/shell tests |
| Load confirmation consumes Escape | Game A surface and smoke tests |

## Regression Requirements

- Normal: `Escape -> LOG -> SAVE -> LOAD -> close` resumes once.
- Boundary: missing backlog/save/load falls back to SETTINGS.
- No-op: selecting the current section does not create history.
- Rejection: legacy overlay ids and `overlayStack` fail contract parsing.

## Dependency Changes

None.

## Required Gates

```bash
pnpm vitest run packages/contracts/src/index.test.ts packages/game-flow-machine/src/index.test.ts packages/app-vn-shell/src apps/game-a/src apps/game-harness/src/interaction
pnpm typecheck
pnpm validate:contracts
pnpm validate:boundaries
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pause-section-navigation.md
```

## Done When

- Required unit, contract, build, boundary, and smoke gates pass.
- Updated screenshots show the tabbed pause surface in both apps.
- The diff stays inside allowed paths and contains the required CCR.
