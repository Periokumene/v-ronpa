# Pixi Effect Baseline Integration Preparation

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/pixi-effect-lab-integration-prep`

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-08-08`
- Updated: `2026-08-09`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/pixi-effect-baseline-integration-prep.md`

## Goal

Prepare the nine Pixi effects for direct baseline integration by removing all
production batch wrappers, aligning public parameters and decimal seeds, and
applying the baseline lifecycle contract to every persistent effect.

## Constraints

- Preserve Catalog → Compiler → Stage Model → Presenter family ownership.
- Keep each new effect as a peer leaf with an independent reducer, controller,
  shader program, resource group, and semantic uniforms.
- SignalMask targets one explicit active character and filters the complete
  outer actor composition.
- Do not restore either effect covered by the hard-delete CCR or add compatibility paths.
- Do not change dependencies, production Nani content, or snapshot version 6.

## Allowed Paths

- `packages/contracts/**`
- `packages/nani-runtime-compiler/**`
- `packages/pixi-stage-model/**`
- `packages/pixi-presenter/**`
- `packages/app-vn-devtools/**`
- `packages/story-engine/src/index.test.ts`
- `apps/game-a/src/devtools/**`
- `apps/game-a/src/nani-dev/**`
- `tests/smoke/game-a-effects-*.ts`
- `tests/smoke/game-a-multi-nani.spec.ts`
- `tests/smoke/game-a-vn.spec.ts`
- `scripts/validate-boundaries.mjs`
- `scripts/generate-command-catalog-doc.mjs`
- `scripts/generate-command-catalog-doc.test.ts`
- `playwright.config.ts`
- `docs/architecture/**`
- `docs/ccr/pixi-effect-lab.md`
- `docs/ccr/pixi-effect-lab-*-hard-delete.md`
- `docs/ccr/pixi-persistent-effect-lifecycle.md`
- `docs/**/pixi-effect-lab.md`
- `docs/nani/command-catalog.md`
- `docs/tasks/pixi-effect-lab.md`
- `docs/tasks/pixi-effect-lab-*-hard-delete.md`
- `docs/tasks/pixi-effect-baseline-integration-prep.md`

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`
- `apps/game-a/src/nani/**`
- `docs/archive/completed-tasks/**`

## Contracts

- SignalMask target is required; region and nested transition are removed.
- All Pixi seeds use finite decimal semantics.
- New effects accept only baseline easing names.
- Persistent terminal equality and repeated removal are strict no-ops.
- See `docs/ccr/pixi-persistent-effect-lifecycle.md`.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Independent command/reducer registration | Contract, compiler, and Stage registry tests |
| Typed no-op and removal behavior | Stage reference/revision/hint/task assertions |
| Independent semantic shaders | Presenter resource/program and family-order tests |
| Full-character SignalMask | Actor filter-order and crossfade ownership tests |
| Individual versus composed authoring | Separate Playwright specs and screenshots |
| Canonical observations | Devtools exposes one `pixi.snapshot` plus runtime hints/tasks |
| Formal command authoring docs | Catalog metadata and generated all-effect reference |

## Regression Requirements

- Normal: all nine commands compile and reach independent leaves.
- Boundary: missing/unknown SignalMask target, removed params, invalid easing,
  non-finite seed, range, enum, vector, color, and count are rejected.
- No-op: identical persistent state and repeated removal preserve reference and revision.
- Restore/lifecycle: interruption, removal, restart, `animate:false`, clear, and
  destroy settle tasks and release only owned resources.
- Smoke: exact five-script catalog, isolated single effects, exact compositions,
  motion fingerprints, precise task kind/target, and empty final state.
- Docs: all nine commands have concrete Chinese parameter metadata and appear in
  the same generated effect reference as existing commands; the temporary Lab
  design note exists only under `docs/archive`.

## Dependency Changes

None.

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
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-effect-baseline-integration-prep.md
```

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Revert the preparation commit atomically. No save migration or dependency
rollback is required.

## Done When

- Full gates and final naming audit pass.
- The prep branch contains one independent integration-preparation commit and
  is not pushed or merged automatically.
