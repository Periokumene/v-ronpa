# Game A Multi-Nani Runtime Hard Cut

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/game-a-multi-nani-runtime`

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-07-19`
- Updated: `2026-07-19`
- Completed Commit: `This atomic subsystem commit`
- Archive Target: `docs/archive/completed-tasks/game-a-multi-nani-runtime.md`

## Goal

Deliver one atomic subsystem hard cut in which Game A has one VN entry and one
generated catalog containing multiple `.nani` scripts, with statically linked
cross-script navigation, atomic presentation preparation/save restore, and a
catalog-aware Devtools workbench. Remove the obsolete single-script wiring and
all compatibility or migration code.

## Context

- CCR: `docs/ccr/game-a-multi-nani-runtime-hard-cut.md`
- Architecture: `docs/architecture/system-guide.md`
- VN runtime: `packages/app-vn-runtime`, `packages/app-vn-session`,
  `packages/app-vn-dispatch`, `packages/app-vn-shell`
- Content pipeline: `packages/nani-parser`, `packages/nani-runtime-compiler`,
  `scripts/generate-assets.mjs`
- Product surfaces: `apps/game-a`, `apps/game-harness`,
  `packages/app-vn-devtools`

## Constraints

- Implement the contracts/runtime/content/Devtools transition atomically.
- Do not add migration, compatibility, alias, forwarding, fallback parser, or
  database-copy paths for prior schemas or APIs.
- Preserve renderer independence of Story/Session/runtime contracts.
- Game A may consume only canonical VN shell/runtime hooks and media-save ports;
  it must not import session, dispatch, presenter, renderer, Navi, or Trial
  implementation packages directly.
- Use one app-owned ContentManifest and AssetRegistry.
- Do not change dependencies, `package.json`, or `pnpm-lock.yaml`.
- Do not add chapter browsing, graphs, implicit catalog-order navigation,
  relative/wildcard/dynamic endpoints, gosub, or asset unloading.

## Allowed Paths

- `AGENTS.md`
- `apps/game-a/**`
- `apps/game-harness/**`
- `packages/asset-registry/**`
- `packages/contracts/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `packages/story-engine/**`
- `packages/story-play/**`
- `packages/app-vn-session/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-runtime/**`
- `packages/app-vn-shell/**`
- `packages/app-vn-devtools/**`
- `packages/pixi-presenter/**`
- `packages/pixi-stage-model/**`
- `packages/runtime-assets-pixi/**`
- `packages/media-save/**`
- `playwright.config.ts`
- `scripts/**`
- `tests/smoke/**`
- `docs/**`

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`
- Unrelated Navi/Trial/R3F implementation packages.
- Historical CCR/archive content except a concise superseded pointer where a
  current claim directly conflicts with this CCR.

## Contracts

- `ContentManifest` v4, `SaveData` v8, and `VnEntryDef.initialScriptPath`.
- `VnRuntimeScriptSource` and ordered unique `VnRuntimeScriptCatalog`.
- `SaveableVnState.script` as the sole saved script identity.
- Async Result-based `VnLifecyclePort.startStory` and `restoreVnState`.
- Shared static endpoint parser/linker and Story navigation request.
- Idempotent `PixiPresenterPort`/`PixiStageHandle.prepareCharacters`.
- Devtools catalog controller/session v3 with separate viewed/runtime paths.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Manifest/save hard cut | Contract tests accept v4/v8 and reject v3/v7 and old shapes |
| Endpoint grammar/linker | Parser/compiler tests cover goto/choice and invalid/unknown/duplicate targets |
| Cross-script Story/Session | Unit tests prove navigation stop, preserved state, cleared waits/choices, local goto behavior |
| Atomic runtime coordinator | Runtime tests cover start/goto/load, failed prep rollback, cancellation, no-op repeat, loop cap |
| Incremental Pixi preparation | Presenter/system tests cover first/incremental/in-flight dedupe/failure and no remount |
| Save/restore | Unit and smoke tests restore chapter-02 state/media and reject revision/path/pointer without mutation |
| Game A product flow | Smoke reaches chapter-02, final end returns title, production build excludes test Nani |
| Harness scale compatibility | Existing VN/Navi/Trial smoke passes on a one-record catalog |
| Multi-script Devtools | Controller/UI/materializer tests cover viewed/runtime split, preview, HMR, failures, session v3 |
| Responsive Devtools | Screenshot evidence at 420px, 320px, and overlay layout |
| Legacy cleanup | Cleanup guards reject obsolete launch/revision/single-file/remount wiring |

## Regression Requirements

- Normal: opening choice navigates to chapter-02 while preserving Story,
  presentation, UI, BGM, and looping SFX state.
- Boundary: duplicate paths, unknown script/label, malformed/dynamic/relative/
  wildcard endpoints, failed presentation preparation, invalid save pointer or
  revision, and 33rd chained navigation are rejected.
- No-op: repeated advance during navigation, non-current valid HMR, and repeated
  character preparation do not disturb the installed state or canvas.
- Devtools consistency: a fixed point in opening must not block chapter-02
  inspection before, after, or across a refresh; HMR of a current or previously
  executed script cannot be misclassified as an unrelated future update.
- Serialization: only Manifest v4, SaveData v8, DB v10, and Devtools session v3
  are accepted; prior versions are ignored without migration.
- Visual: selector popover, chapter-02 viewed state, cross-script Preview stage,
  and chapter-02 load restoration are captured at required layouts.

Test placement:

- Pure/package tests beside the changed package sources.
- Contract and generated snapshot tests in existing contract/asset suites.
- Game A/Harness/browser behavior in `tests/smoke/**`.

## Dependency Changes

None. `package.json` and `pnpm-lock.yaml` must remain unchanged.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm generate:assets
pnpm generate:command-docs
pnpm typecheck
pnpm validate:contracts
pnpm validate:command-docs
pnpm validate:assets
pnpm validate:boundaries
pnpm validate:app-cleanup
pnpm validate:vn-runtime-cleanup
pnpm test
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/game-a-multi-nani-runtime.md
pnpm validate:baseline
```

## Programmatic Acceptance

- Every matrix row has a readable regression test or named smoke assertion.
- All required gates pass on this branch.
- Production bundles contain product catalog members only.
- Cleanup guards and repository search find no obsolete runtime/launch wiring.
- `git diff -- package.json pnpm-lock.yaml` is empty.

## Manual Acceptance

- Inspect the generated catalog, single manifest/registry ownership, canonical
  runtime boundary, cancellation/rollback behavior, and absence of double-track
  code or documentation.
- Verify final `@end` resets runtime/media then reuses `RETURN_TITLE`.
- Inspect screenshots for the selector, chapter-02, preview, restore, focus, and
  responsive layouts.

## Review Packet

- Changed-files and removed-symbol summary.
- Test/gate output with any intentionally skipped environmental checks.
- Regression-to-test mapping.
- Screenshot paths and viewport/layout labels.
- Residual risks limited to explicit non-goals.

## Validation Evidence

- `pnpm validate:contracts`: 52 files, 492 tests passed.
- `pnpm test`: 90 files, 721 tests passed.
- `pnpm test:smoke`: 11 browser smoke tests passed, including the production
  Game A multi-script journey and the existing Harness VN/Navi/Trial paths.
- Game A and Game Harness production builds passed; the Game A content check
  confirmed that no test `.nani` entered the production bundle.
- Contract, command-doc, asset, boundary, app cleanup, VN runtime cleanup,
  subsystem, and baseline gates all passed.
- Visual evidence:
  - `test-results/game-a-multi-nani-script-selector-420.png` (420px selector)
  - `test-results/game-a-multi-nani-chapter-02-view-320.png` (320px viewed script)
  - `test-results/game-a-multi-nani-cross-script-preview-overlay.png` (overlay preview)
  - `test-results/game-a-multi-nani-chapter-02-load.png` (chapter-02 restore)
  - `test-results/game-a-multi-nani-fixed-point-chapter-view.png` (opening fixed point while viewing chapter-02)
- `package.json` and `pnpm-lock.yaml` are unchanged.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Revert the whole subsystem change as one unit. No old database or schema
migration exists; rollback would require returning to the prior app/runtime
build and its independent storage namespace.

## Done When

- The implementation, tests, documentation, generated artifacts, cleanup, and
  all gates are complete.
- The task state is `Done`; after merge it moves to the archive target.
