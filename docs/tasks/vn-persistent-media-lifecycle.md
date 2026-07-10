# VN Persistent Media Lifecycle

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/vn-persistent-media-lifecycle`

## Worktree Path

- Codex App managed worktree or `.worktrees/vn-persistent-media-lifecycle`.

## Worktree Environment

Run `pnpm setup:worktree-env` before smoke or subsystem gates.

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-07-11`
- Updated: `2026-07-11`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/vn-persistent-media-lifecycle.md`

## Goal

Hard-cut SaveData v7, persist and restore VN BGM/looping-SFX intent, guarantee
complete media cleanup on reset/restore/unmount/title exit, and converge Game A
and Harness on the canonical lifecycle boundary.

## Context

- `docs/ccr/save-data-v7-vn-persistent-media.md`
- `docs/architecture/system-guide.md`
- `docs/architecture/app-vn-integration.md`
- `docs/architecture/vn-runtime-ports.md`

## Constraints

- No migration, compatibility schema, fallback database, new package, dependency,
  Audio Director, cross-mode media scope, playback cursor, or fade restoration.
- BGM is always looped; SFX loop behavior remains command-controlled.
- Sound settings gain/mute wiring is out of scope.
- Runtime logic remains renderer/storage/audio-implementation independent.

## Allowed Paths

- `docs/tasks/vn-persistent-media-lifecycle.md`
- `docs/tasks/inner-background-command.md`
- `docs/review-watchlist.md`
- `docs/ccr/**`
- `docs/architecture/**`
- `docs/nani/**`
- `packages/contracts/**`
- `packages/nani-runtime-compiler/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-runtime/**`
- `packages/media-save/**`
- `apps/game-a/**`
- `apps/game-harness/**`
- `tests/smoke/game-a-vn.spec.ts`
- `tests/smoke/harness-showcase.spec.ts`

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`
- Archived task documents.

## Contracts

- `SaveDataSchema` v7.
- Required `SaveableVnState.media` / `VnMediaCheckpoint`.
- `VnLifecyclePort.resetRuntime()` always performs a hard media reset.
- `@bgm loop` is declared but not consumed; BGM playback always loops.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Persistent media round-trip | Contract and media reducer tests |
| Deterministic restore materialization | Dispatch/runtime restore-plan tests |
| Complete port cleanup | Shared disposer fake-port tests plus reset/restore/unmount call-site review |
| Restore rejection preservation | Runtime identity and Game A wrapper tests |
| Title exit ordering | Game A/Harness adapter tests |
| Hard-cut storage | App save tests and smoke database setup |

## Regression Requirements

- Normal: multiple BGM groups and looping SFX restore once at saved volume.
- Boundary: one-shot/voice/bleep/movie/fade/cursor do not enter checkpoints.
- Rejection: v6, missing media, and identity mismatch fail without mutating live media.
- No-op: same-resource media without a volume change does not restart.
- Cleanup: reset/restore/unmount/title exit stop the runtime-owned media port.

## Dependency Changes

None. `package.json` and `pnpm-lock.yaml` must remain unchanged.

## CCR Triggers

Satisfied by `docs/ccr/save-data-v7-vn-persistent-media.md`.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm vitest run packages/contracts packages/nani-runtime-compiler packages/app-vn-dispatch packages/app-vn-runtime packages/media-save apps/game-a/src apps/game-harness/src/interaction
pnpm typecheck
pnpm validate:contracts
pnpm validate:boundaries
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/vn-persistent-media-lifecycle.md
pnpm validate:baseline
```

## Programmatic Acceptance

- Task-specific tests and every required gate pass.
- SaveData v6 and database v8 are absent from active production code and current
  architecture docs; the superseded CCR and explicit rejection tests remain.
- Both app builds and smoke projects pass without new audio telemetry APIs.

## Manual Acceptance

- Review desired-state/live-handle separation and cleanup ordering.
- Confirm the diff adds no compatibility layer or cross-mode audio abstraction.
- Confirm Game A resets runtime before sending `RETURN_TITLE`.

## Review Packet

- Public contract: SaveData v7 requires canonical VN media intent; BGM loop is
  no longer emitted in runtime commands; lifecycle reset has no soft-media option.
- Runtime/App: checkpoint/restore owns persistent-media projection, all lifecycle
  cleanup uses runtime-exclusive port-wide stop, and Game A resets before title.
- Evidence: targeted contract/compiler/dispatch/runtime/App tests, full unit and
  contract suites, both production builds, and 7/7 Playwright smoke tests passed.
- Gates: `validate:contracts`, `validate:boundaries`, task-specific
  `validate:subsystem`, and full `validate:baseline` passed.
- Dependencies: `package.json` and `pnpm-lock.yaml` unchanged.
- Residual non-goals: settings mixing, cross-mode continuation, cursor/fade
  restoration, and precise audio-clock persistence.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting requires discarding v9 development databases; no migration is provided.

## Done When

- Save/restore and title lifecycle behavior are proven by tests.
- All required gates pass.
- Current architecture and command docs describe v7 and persistent media.
- Diff stays inside allowed paths and dependencies remain unchanged.
