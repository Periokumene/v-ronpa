# Pixi Effect Lab

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/pixi-effect-lab`

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-08-07`
- Updated: `2026-08-07`
- Completed Commit: `Working tree handoff; commit not requested`
- Archive Target: `docs/archive/completed-tasks/pixi-effect-lab.md`

## Goal

Add four finite and five persistent Pixi VN effects, expose them as typed Nani
commands, and provide separate development-only Game A scripts for isolated and
composed usage.

## Context

- Follow `docs/ccr/pixi-effect-lab.md` for the public command, IR, stage snapshot, and wait-task additions.
- Preserve the `.nani -> compiler -> session/dispatch -> pixi-stage-model -> presentation port -> pixi-presenter` ownership chain.
- The effect lab targets high-end desktop presentation and intentionally contains an opt-in high-frequency flicker sequence.

## Constraints

- Pixi effects must not alter DOM dialogue, choice, menu, or accessibility surfaces.
- Gameplay and persisted state stay renderer-independent; transient GPU history and particles remain presenter-private.
- No dependency, package manifest, or lockfile changes.
- Development scripts only; do not add either scene to production content.

## Allowed Paths

- `docs/tasks/pixi-effect-lab.md`
- `docs/ccr/pixi-effect-lab.md`
- `docs/design/pixi-effect-lab.md`
- `docs/architecture/adding-pixi-effect.md`
- `docs/architecture/pixi-effects.md`
- `docs/nani/command-catalog.md`
- `progress.md`
- `packages/contracts/**`
- `packages/nani-runtime-compiler/**`
- `packages/story-engine/src/index.test.ts`
- `packages/pixi-stage-model/**`
- `packages/pixi-presenter/**`
- `apps/game-a/src/nani-dev/pixi-effect-lab.nani`
- `apps/game-a/src/nani-dev/pixi-effect-compositions.nani`
- `apps/game-a/src/devtools/**`
- `apps/game-a/src/generatedAssets.test.ts`
- `tests/smoke/game-a-effects-lab.spec.ts`
- `tests/smoke/game-a-multi-nani.spec.ts`
- `playwright.config.ts`
- `scripts/validate-boundaries.mjs`

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`
- Production Game A `.nani` content and content manifests.
- Gameplay/session ownership outside the typed command and presentation boundaries.

## Contracts

- Add the nine commands and their semantic authoring params to the Nani catalog.
- Extend Pixi terminal snapshots for vignette, staticFilter, waterVeil, pulse, and signalMask.
- Extend render hints and Pixi presentation wait-task kinds for impact, afterimage, shutter, and flicker.
- Preserve `PixiStageSnapshot.version === 6` and SaveData compatibility.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Commands compile to canonical semantic runtime params | Compiler and contract unit tests |
| Transient effects remain outside terminal snapshots and settle tasks | Stage-model and presenter tests |
| Persistent effects transition, restore, and remove independently | Stage-model and presenter tests |
| Fixed filter ordering and resource lifecycle | Presenter registry/system tests |
| All effects are authorable in Game A development content | Nani discovery/build test and browser smoke screenshots |

## Regression Requirements

- Normal: every command compiles and reaches its assigned effect family.
- Boundary: invalid enum, range, count, target, or non-finite value is rejected or diagnosed without state mutation.
- No-op: persistent `power:0` for a missing effect does not disturb siblings.
- Serialization: terminal effect snapshots parse and restore with no transient phase or GPU history.
- Lifecycle: retrigger, resize, clear, and destroy settle tasks and release owned resources.
- Authoring example: every newly added effect in `pixi-effect-lab.nani` is shown
  in isolation, has a Chinese explanation of its intended visual result and key
  test parameters, and is removed before the next persistent effect begins;
  every composition in `pixi-effect-compositions.nani` explains its combined
  visual intent in Chinese.

## Dependency Changes

None.

## Required Gates

```bash
pnpm vitest run packages/contracts/src/index.test.ts packages/nani-runtime-compiler/src/index.test.ts packages/pixi-stage-model/src/index.test.ts packages/pixi-stage-model/src/effects/effects.test.ts packages/pixi-presenter/src/internal/effects/registries.test.ts packages/pixi-presenter/src/internal/effects/transientEffects.test.ts packages/pixi-presenter/src/internal/systemsTasks.test.ts
pnpm typecheck
pnpm validate:contracts
pnpm validate:boundaries
pnpm --filter @v-ronpa/game-a build
pnpm test:smoke -- --project game-a-product tests/smoke/game-a-effects-lab.spec.ts
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-effect-lab.md
```

## Programmatic Acceptance

- Required tests and gates pass.
- Both development scripts are discoverable but absent from production build output.
- Screenshot evidence covers each effect family, compositions, and final cleanup.

## Manual Acceptance

- Inspect visual rhythm, legibility, filter isolation, actor masking, resize behavior, and flicker warning/skip path.
- Confirm no DOM surface is filtered and no presenter-private state appears in saves.

## Review Packet

### Delivered

- Nine typed semantic commands, compiler validation/defaults, pure Stage reducers,
  snapshots/hints/waits, and fixed Presenter-family integrations.
- Half-resolution captured history for Pulse and Afterimage and actor crossfade
  SignalMask.
- Separate development-only `pixi-effect-lab.nani` and
  `pixi-effect-compositions.nani` scenes, read-only Devtools diagnostics,
  generated command documentation, CCR, architecture updates, and the detailed
  professional processing-chain note in `docs/design/pixi-effect-lab.md`.
- No dependency, package manifest, lockfile, production Nani, or App manifest
  changes.

### Verification

- `pnpm typecheck`: passed.
- `pnpm validate:contracts`: 60 files / 591 tests passed.
- `pnpm test`: 107 files / 887 tests passed.
- `pnpm validate:boundaries`, `validate:ccr`, and `validate:command-docs`: passed.
- Game A production build/content/asset checks: passed.
- Full Playwright smoke: 19/19 passed, including Effects Lab and Game A multi-Nani coverage.
- `BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-effect-lab.md`:
  passed, including both production builds and 19/19 full Playwright smoke tests.

### Visual And Performance Evidence

- Representative images: `test-results/game-a-effects-lab-impact.png`,
  `game-a-effects-lab-afterimage.png`,
  `game-a-effects-lab-flicker-frame-3.png`, `game-a-effects-lab-pulse-frame-4.png`,
  `game-a-effects-lab-signalMask.png`, `game-a-effects-lab-stress-stack.png`, and
  `game-a-effects-lab-cleanup.png`.
- The smoke records current Pulse, Afterimage, Domestic Pressure, and full
  persistent-stack frame profiles in
  `test-results/game-a-effects-lab-performance.json`; methodology is documented
  in `docs/design/pixi-effect-lab.md`.
- Browser console/page errors were empty; final screen/weather/actor snapshots,
  hints, and presentation tasks were empty.

### Residual Scope And Safety

- rAF profiles validate delivered frame cadence, not isolated GPU timer-query
  duration; hard thresholds run only with `PIXIEFFECT_PERF_ASSERT=1` on verified
  hardware acceleration.
- The full Flicker route intentionally exceeds general flash-safety guidance.
  The warning and skip route are present, but product merge still requires a
  separate photosensitivity review.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Revert the branch atomically. Optional version-6 snapshot fields require no save migration.

## Done When

- Nine commands and their effects are implemented and demonstrated.
- Required regression tests and visual evidence pass.
- Diff remains inside the allowed paths and the CCR accurately records public changes.
