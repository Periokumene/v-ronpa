# Pixi Effects Architecture and `@focus` Hard Delete

## Base Branch

- `integration/v-ronpa-baseline`

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-08-05`
- Updated: `2026-08-06`

## Goal

Hard-delete public `@focus`, converge Pixi effects on pure Stage reducers and
thin private Presenter families, and make automated unit, restore, Harness, and
visual evidence sufficient to detect lifecycle and isolation regressions.

## Constraints

- No compatibility layer, generic plugin host, feature flag, dependency, or lockfile change.
- Preserve every effect behavior except removal of `@focus`.
- Preserve `bokeh focus:`, Navi/DOM focus, historical archives, snapshot v6, and SaveData versions.
- Keep renderer dependencies out of contracts, compiler, Stage Model, dispatch, and runtime.

## Allowed Paths

- `packages/contracts/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `packages/story-engine/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-runtime/**`
- `packages/pixi-stage-model/**`
- `packages/pixi-presenter/**`
- `apps/game-harness/**`
- `tests/smoke/harness-pixi.spec.ts`
- `scripts/fixtures/nani-semantic-golden.json`
- `scripts/validate-boundaries.mjs`
- `docs/ccr/**`
- `docs/architecture/**`
- `docs/nani/**`
- `docs/tasks/**`

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`
- historical archive contents
- R3F/Navi/Trial behavior packages

## Contracts

- CCR: `docs/ccr/pixi-effects-focus-hard-delete.md`
- `RuntimeCommand`, `PixiStageSnapshot.version=6`, `PixiPresenterPort`, and
  `PixiPresentationTaskKind` remain stable except catalog removal of `focus`.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| `@focus` hard cut | catalog absence plus exact compiler `unknown-command` test |
| Stage completeness | catalog/registry bidirectional invariant and package tests |
| Effect lifecycle | adjacent Presenter effect and family tests |
| Isolation/order | weather coexistence, glitch coexistence, bokeh/glitch order, Trial separation |
| Restore | no hints, tweens, transient overlays, tasks, or phantom wait |
| Real rendering | Harness state assertions, motion frame difference, cleanup, screenshots |
| Future effect boundary | one family registration path, leaf import isolation, and `validate:boundaries` enforcement |

## Regression Requirements

Cover normal, invalid/no-op, timed removal, interrupt/settle, resize, clear,
destroy, and restore paths for all registered effects. Preserve rain/snow
coexistence, persistent/transient glitch coexistence, actor independence, and
Trial isolation. Active-code audit must find no command-level `@focus`.

## Dependency Changes

None. `package.json` and `pnpm-lock.yaml` must not change.

## Required Gates

```bash
pnpm generate:command-docs
pnpm typecheck
pnpm validate:contracts
pnpm validate:boundaries
pnpm validate:ccr
pnpm validate:assets
pnpm test
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-effects-focus-hard-delete.md
```

## Rollback Notes

No save migration is required. Reverting `@focus` requires restoring all public
pipeline touchpoints together; Presenter-only rollback must preserve the Stage
registry invariant and automated effect behavior.
