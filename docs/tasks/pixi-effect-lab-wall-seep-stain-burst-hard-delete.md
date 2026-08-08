# Effect Lab Hard Delete

## Base Branch

- `integration/v-ronpa-baseline`

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-08-08`
- Updated: `2026-08-08`
- Completed Commit: `Working tree handoff; commit not requested`

## Goal

Hard-delete two rejected Effect Lab effects across registration, dispatch,
consumption, rendering, development content, tests, and active documentation,
without compatibility behavior or replacement effects.

## Constraints

- No aliases, deprecated stubs, no-ops, migrations, replacements, or diagnostic
  special cases.
- Preserve `PixiStageSnapshot.version === 6` and all unrelated effects.
- Keep session, dispatch, and presentation-port generic transport unchanged.
- Do not modify dependencies, lockfiles, production Nani content, or historical
  archives.

## Allowed Paths

- `packages/contracts/**`
- `packages/nani-runtime-compiler/**`
- `packages/pixi-stage-model/**`
- `packages/pixi-presenter/**`
- `packages/story-engine/src/index.test.ts`
- `apps/game-a/src/nani-dev/pixi-effect-lab.nani`
- `apps/game-a/src/nani-dev/pixi-effect-compositions.nani`
- `apps/game-a/src/devtools/**`
- `tests/smoke/game-a-effects-lab.spec.ts`
- `tests/smoke/game-a-multi-nani.spec.ts`
- `playwright.config.ts`
- `scripts/validate-boundaries.mjs`
- `docs/architecture/adding-pixi-effect.md`
- `docs/architecture/pixi-effects.md`
- `docs/design/pixi-effect-lab.md`
- `docs/nani/command-catalog.md`
- `docs/ccr/pixi-effect-lab.md`
- `docs/ccr/pixi-effect-lab-wall-seep-stain-burst-hard-delete.md`
- `docs/tasks/pixi-effect-lab.md`
- `docs/tasks/pixi-effect-lab-wall-seep-stain-burst-hard-delete.md`

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`
- production Game A Nani content or content manifests
- historical archive contents

## Contracts

- CCR: `docs/ccr/pixi-effect-lab-wall-seep-stain-burst-hard-delete.md`
- Remove both command definitions and their consumed-parameter metadata.
- Remove the stain task kind and wall weather snapshot shape.
- Preserve Stage snapshot version 6 with strict rejection of the deleted shape.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Public hard cut | catalog absence and exact `unknown-command` compiler tests |
| Stage hard cut | registry absence, generic unsupported diagnostic, no mutation |
| Presenter removal | registry absence and remaining shader/lifecycle tests |
| Isolated authoring | nine effects, Chinese explanation, one effect at a time |
| Composition authoring | no deleted commands and empty terminal state after cleanup |
| Residual audit | names appear only in deletion records and rejection tests |

## Regression Requirements

- Cover public schema and catalog rejection.
- Cover compiler rejection with no runtime output.
- Cover manually injected legacy runtime commands without snapshot, hint, or wait
  mutation.
- Preserve remaining weather/transient registration, shader mode, lifecycle,
  order, isolation, restore, and cleanup tests.
- Run browser smoke for both development scripts and regenerate current
  performance evidence.

## Required Gates

```bash
pnpm generate:command-docs
pnpm typecheck
pnpm validate:contracts
pnpm validate:command-docs
pnpm validate:boundaries
pnpm validate:ccr
pnpm test
pnpm test:extension
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-effect-lab-wall-seep-stain-burst-hard-delete.md
```

## Done When

- Both effects are absent from every active runtime and authoring link.
- Remaining effects and development scripts pass their regression and smoke
  coverage.
- Active-source audit contains only intentional deletion-record and rejection
  test references.

## Verification

- Typecheck, command generation/check, contracts, boundaries, CCR validation,
  unit tests, extension tests, and both production builds passed.
- Contracts: 60 files / 591 tests; full unit suite: 107 files / 887 tests.
- Full Playwright smoke passed 19/19 on isolated ports, including the isolated
  and composition Effect Lab scripts and empty final effect/task state.
- The subsystem gate passed against `integration/v-ronpa-baseline`.
