# Nani Inline Staged Text

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/nani-inline-staged-text`

## Worktree Path

- Current Codex workspace.

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-08-02`
- Updated: `2026-08-02`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/nani-inline-staged-text.md`

## Goal

Implement `[-]` / `[wait i]` as inline story-text stops across parser,
compiler, runtime, save/backlog/audio/automation, and debug tooling, then consume
the feature in the existing Game A Cue and dedicated Harness coverage.

## Context

See `docs/ccr/nani-inline-staged-text.md`. The change is one atomic vertical
slice because accepting syntax before every runtime/checkpoint consumer supports
the expanded commands would create invalid scripts or split state authority.

## Constraints

- One logical line lowers to normal stable story-text commands; no renderer,
  React, Pixi, or app-specific stage state.
- SaveData schema and product VN runtime ports remain unchanged.
- No feature flag, temporary command, compatibility parser, dependency change,
  or package/lockfile edit.
- Preserve all unrelated `opening.nani` edits and change only the selected Cue.

## Allowed Paths

- `packages/contracts/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `packages/story-engine/**`
- `packages/story-play/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-runtime/**`
- `packages/app-vn-devtools/**`
- `packages/app-vn-shell/**`
- `apps/game-a/src/nani/opening.nani`
- `apps/game-a/src/generatedAssets.ts`
- `apps/game-a/src/**/*.test.ts`
- `apps/game-harness/**`
- `tests/smoke/**`
- `docs/ccr/nani-inline-staged-text.md`
- `docs/tasks/nani-inline-staged-text.md`
- `progress.md`
- `scripts/fixtures/nani-semantic-golden.json`
- `scripts/fixtures/nani-diagnostic-golden.json`
- `scripts/nani-semantic-golden.test.ts`

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`
- Renderer-specific packages and app presentation special cases.
- Other Game A content or existing unrelated changes in `opening.nani`.

## Contracts

- `TextStageIR` and optional `textStages` on `.nani` text/command IR.
- `RuntimeTextStageSchema`, `RuntimeTextStage`, and
  `RuntimeCommand.textStage`.
- Existing SaveData, StoryText, checkpoint, presentation, and debug ports remain
  the only state boundaries.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Inline syntax and source precision | Parser unit tests for aliases, rich text, escaping, and invalid spans |
| Atomic one-to-many lowering | Compiler tests for fragments, labels, params, stage metadata, and digest |
| Cumulative story state | StoryEngine tests for staged backlog and explicit print append |
| Suffix-only playback | Reveal/runtime/audio tests for ticks, bleep, voice, manual, AUTO, and SKIP |
| Stable restore | Checkpoint/save test restoring stage 2 and advancing to stage 3 |
| Stable debugging | Materializer, anchor, final-preview, remap, and State summary tests |
| Product integration | Game A and Harness Playwright assertions plus screenshots |

## Regression Requirements

- Normal: ordinary dialogue, `@print`, and `@cue` produce three cumulative stops.
- Boundary/rejection: timed/empty/consecutive/tag-internal/conditional/dynamic
  stages and explicit inline `[>]` / `[<]` fail at precise source spans.
- No-op/compatibility: escaped `\[-\]` stays visible; `@append` and non-staged
  script output remain unchanged.
- Serialization: stage 2 restores fully visible and advances to stage 3 without
  a SaveData schema change.

Tests live beside affected packages; app behavior is covered under
`tests/smoke/**`.

## Dependency Changes

None. `package.json` and `pnpm-lock.yaml` must remain unchanged.

## CCR Triggers

- Satisfied by `docs/ccr/nani-inline-staged-text.md` for runtime command and
  `.nani` IR changes.

## Required Gates

```bash
pnpm vitest run packages/contracts packages/nani-parser packages/nani-runtime-compiler packages/story-engine packages/story-play packages/app-vn-dispatch packages/app-vn-runtime packages/app-vn-devtools
pnpm validate:contracts
pnpm typecheck
pnpm validate:boundaries
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/nani-inline-staged-text.md
pnpm validate:baseline
```

## Programmatic Acceptance

All focused tests, contracts, typecheck, boundaries, production builds, smoke,
subsystem, and baseline gates pass with required new regression cases.

## Manual Acceptance

Review cumulative dialog/Cue behavior, two-click reveal gating, AUTO/SKIP stage
progression, backlog timing, voice/bleep lifecycle, stage-aware debugger state,
and absence of any presentation-layer stage authority.

## Review Packet

- Changed files and public contract summary.
- Focused/full gate output and regression mapping.
- Game A/Harness screenshot paths.
- Residual risks and accepted non-goals from the CCR.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Rollback is atomic: remove the IR/schema/lowering/runtime/debug implementation,
Harness scenarios, and Game A markers together. No save migration is required;
old script revisions are already rejected.

## Done When

- Required tests and gates pass.
- Browser screenshots prove staged cumulative output.
- Existing `opening.nani` changes remain intact except for the selected Cue.
- No dependency or product-port changes are introduced.
