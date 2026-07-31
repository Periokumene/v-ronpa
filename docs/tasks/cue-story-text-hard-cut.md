# Cue Story Text Hard Cut

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/cue-story-text-hard-cut`

## Worktree Path

- Current Codex workspace.

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-08-01`
- Updated: `2026-08-01`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/cue-story-text-hard-cut.md`

## Goal

Implement `@cue` and `@hideCue` as a hard-cut extension of the canonical story
text pipeline, with a separate centered DOM surface, SaveData v9, DB v11, full
tests, generated docs, and app/harness acceptance coverage.

## Context

See `docs/ccr/cue-story-text-hard-cut.md`. The work crosses the public command
catalog, parser/compiler, StoryEngine, app dispatch/runtime/shell, UI kit,
media-save, Game A, and Game Harness because Cue must not create a second text
or playback authority.

## Constraints

- No compatibility aliases, migrations, old API exports, or old DB fallback.
- No new Pixi/R3F presentation path and no `vscode-nani` changes.
- `hideUI/showUI` and commandBar remain independent from Cue.
- Game A consumes shared runtime/shell ports only.
- Do not change dependencies.

## Allowed Paths

- `packages/contracts/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `packages/story-engine/**`
- `packages/story-play/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-runtime/**`
- `packages/app-vn-shell/**`
- `packages/ui-kit/**`
- `packages/media-save/**`
- `packages/debug-adapter/**`
- `apps/game-a/**`
- `apps/game-harness/**`
- `tests/smoke/**`
- `docs/ccr/cue-story-text-hard-cut.md`
- `docs/tasks/cue-story-text-hard-cut.md`
- `docs/architecture/**`
- `docs/nani/**`
- `docs/testing/**`
- `docs/assets/**`
- `scripts/fixtures/nani-semantic-golden.json`
- `scripts/nani-semantic-golden.test.ts`

## Forbidden Paths

- `apps/vscode-nani/**`
- `package.json`
- `pnpm-lock.yaml`

## Contracts

- `cue`, `hideCue`, `StoryTextChannel`, `VnUiSurfaceId`
- `StoryTextCurrent`, `StoryUiPresentationWait`, `VnUiCheckpoint`
- `StoryTextReveal*`, `storyTextPlayback*`, `VnStoryTextDisplaySettings`
- SaveData v9 and Game A/Harness database namespace v11

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Parse and compile Cue | Parser/compiler unit tests and generated command catalog |
| Single StoryText authority | StoryEngine and Story Play channel/stop/backlog tests |
| Independent Cue transition | Dispatch/runtime wait, settle, and hideUI-isolation tests |
| Shared playback | StoryText reveal and voice/bleep tests for both channels |
| DOM Cue presentation | Shell/ui-kit tests plus Game A/Harness smoke screenshots |
| Stable checkpoint | SaveData v9 round-trip and v8 rejection tests |
| App boundary | Game A boundary validation and DB v11 tests |

## Regression Requirements

- Normal: dialog→Cue→hideCue(wait)→dialog, rich text, voice/bleep, auto/skip.
- Boundary/rejection: missing primary text, wrong types, invalid/duplicate textId,
  zero-time/already-hidden hideCue, v8 save rejection.
- No-op/isolation: hideUI excludes Cue; Cue excludes commandBar; pause suppresses
  rendering without mutating runtime state.
- Serialization: v9 current channel and terminal Cue visibility round-trip.

Test placement is in the affected package unit tests and `tests/smoke/**` for
the Game A/Harness visual flows.

## Dependency Changes

None. `package.json` and `pnpm-lock.yaml` must remain unchanged.

## CCR Triggers

- Satisfied by `docs/ccr/cue-story-text-hard-cut.md`.

## Required Gates

```bash
pnpm test
pnpm typecheck
pnpm validate:contracts
pnpm validate:boundaries
pnpm validate:ccr
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:task-boundaries -- --task docs/tasks/cue-story-text-hard-cut.md
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/cue-story-text-hard-cut.md
```

## Programmatic Acceptance

All task-specific unit/contract/smoke tests and required gates pass; generated
artifacts are current; visual smoke evidence exists for both apps.

## Manual Acceptance

Review the two surface lifecycles, hard-cut API removals, Cue accessibility and
styling, app boundaries, and absence of compatibility code.

## Review Packet

- Contract and compiler: command catalog, StoryText channel/surface/checkpoint
  schemas, exact named-textId diagnostics, shared text normalization, SaveData
  v9, and semantic golden updates.
- Runtime and presentation: one StoryText state/reveal/audio clock, Cue UI
  reduction and wait settlement, shell mutual exclusion, shared DOM Cue surface,
  and hard-cut StoryText API names.
- App integration: Game A delegates its Cue slot to the shared surface; Harness
  uses the default slot. Both save stores use fresh v11 namespaces and both
  generated script catalogs are current.
- Regression result: 97 Vitest files / 767 tests, 58 contract-gate files / 534
  tests, Game A and Harness production builds, 14 Playwright smoke tests,
  task-boundaries, and the complete subsystem gate passed on 2026-08-01.
- Visual evidence:
  - `test-results/game-a-cue-centered-borderless.png`
  - `test-results/game-a-cue-hide-ui-isolation.png`
  - `test-results/game-a-cue-fading-before-dialog.png`
  - `test-results/game-a-cue-fade-complete-dialog.png`
  - `test-results/harness-cue-centered-borderless.png`
  - `test-results/harness-cue-hide-ui-isolation.png`
  - `test-results/harness-cue-fading-before-dialog.png`
  - `test-results/harness-cue-fade-complete-dialog.png`
- Residual compatibility risk is intentional: v8 saves, v10 databases, and the
  removed DialogReveal/dialogPlayback/dialogDisplay exports have no fallback.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting also reverts SaveData v9 and DB v11; no older save/DB migration exists.

## Done When

- Required tests and gates pass.
- Generated docs/assets are current.
- Visual evidence is captured.
- No dependency or vscode-nani changes exist.
