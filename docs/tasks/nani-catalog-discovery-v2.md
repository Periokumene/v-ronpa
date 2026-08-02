# Nani Catalog Discovery v2

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/nani-catalog-discovery-v2`

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-08-02`
- Updated: `2026-08-02`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/nani-catalog-discovery-v2.md`

## Goal

Hard-cut Nani catalog membership from per-file registration to shared recursive
directory discovery. Migrate Game A, Harness, the generator, runtime/debug
policy, Devtools/Vite, and the VS Code extension together, without compatibility
exports, legacy modes, template-source special cases, or dual configuration.

## Context

- [CCR](../ccr/nani-catalog-discovery-v2.md)
- [Asset pipeline](../architecture/asset-pipeline.md)
- [VN Devtools](../architecture/vn-devtools.md)
- [Harness gates](../architecture/harness-gates.md)

## Constraints

- Do not change `.nani` syntax, public IR, `SaveData`, or `ContentManifest` schema.
- Entry IDs and initial script paths remain explicit and stable.
- Ordinary `.nani` membership comes only from configured scope roots.
- Game A uses the canonical physical roots `src/nani`, `src/nani-dev`, and
  `src/nani-test`; alternate directory-name spellings are forbidden.
- Discovery has no ignore, allowlist, glob, alias, or symlink support.
- This is an atomic hard cut; no old configuration readers or re-exports remain.
- Preserve renderer and gameplay-state boundaries described in `AGENTS.md`.

## Allowed Paths

- `apps/game-a/**`
- `apps/game-harness/**`
- `packages/nani-project/**`
- `packages/nani-runtime-compiler/**`
- `packages/app-vn-runtime/**`
- `packages/app-vn-devtools/**`
- `scripts/**`
- `tools/vscode-nani/**`
- `tests/smoke/**`
- `docs/**`
- `package.json`
- `playwright.config.ts`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `tsconfig.json`

## Forbidden Paths

- `packages/contracts/**`
- `.nani` public IR and save/manifest schemas.

## Contracts

- `NaniProjectConfig`, discovery result, and diagnostic policy are introduced by
  `@v-ronpa/nani-project` as Node/tooling APIs.
- Existing `VnEntryDef`, `VnRuntimeScriptCatalog`, `Diagnostic`, save identities,
  and `ContentManifest` remain unchanged.
- Runtime/debug callers must state a `NaniSourceDiagnosticPolicy` explicitly.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Recursive scope discovery and stable paths | `packages/nani-project` unit tests |
| Symlink, collision, escape, root, and entry rejection | `packages/nani-project` rejection tests |
| Recoverable command omission and fatal fallback | compiler/runtime/materializer tests |
| Split generated output and hard config cut | generator tests plus `generate:assets --check` |
| Harness template migration preserves semantics | revision/golden/smoke tests |
| Dirty catalog freezes adoption until refresh | Devtools/Vite and Playwright tests |
| VS Code roots, union navigation, and test catalog | extension tests |
| Production excludes development/test tooling | production validator and app build |

## Regression Requirements

- Normal: nested production/development/test scripts are discovered without a
  configuration edit and valid recovered scripts remain runnable.
- Boundary: non-Nani files are ignored; symlinks, case collisions, escaped paths,
  missing roots/entries, parser/linker errors, and invalid targets are fatal.
- No-op: ordinary source edits keep the existing monotonic HMR transaction;
  catalog-dirty does not mutate the last-known-good runtime.
- Compatibility: production entry identity and Harness semantic revision remain
  stable; deliberately no compatibility exists for renamed script paths or old
  modes/generated files.

Test placement:

- `packages/nani-project/src/**/*.test.ts`
- `packages/nani-runtime-compiler/src/**/*.test.ts`
- `packages/app-vn-runtime/src/**/*.test.ts`
- `packages/app-vn-devtools/src/**/*.test.ts`
- `scripts/generate-assets.test.ts`
- `tools/vscode-nani/src/**/*.test.ts`
- `tests/smoke/**/*.spec.ts`

## Dependency Changes

Allowed: add the `@v-ronpa/nani-project` workspace package, its project
references, and workspace dependencies needed by generator, apps, Devtools, and
the VS Code extension. Lockfile updates are expected.

## Required Gates

```bash
pnpm generate:assets
pnpm validate:assets
pnpm vitest run packages/nani-project packages/nani-parser packages/nani-runtime-compiler packages/app-vn-runtime packages/app-vn-devtools apps/game-a scripts/generate-assets.test.ts
pnpm test:extension
pnpm typecheck
pnpm validate:contracts
pnpm validate:boundaries
pnpm validate:vn-runtime-cleanup
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/nani-catalog-discovery-v2.md
pnpm validate:baseline
```

## Programmatic Acceptance

The implementation is acceptable when the required gates pass and cleanup
guards prove that explicit script lists, `sourceFormat`, old generated modules,
old test wrappers, and old mode names cannot return.

## Manual Acceptance

- Workbench shows production/development scope and recovered/fatal state.
- Add/unlink/rename requests a refresh and freezes preview/adoption.
- Refresh performs a fresh scan without a server restart.
- Product builds contain no development/test source or Workbench protocol.

## Review Packet

- Added `@v-ronpa/nani-project`; hard-cut Game A, Harness, the generator,
  Devtools/Vite, and VS Code to recursive scope discovery and explicit entry
  identity only.
- Removed the TypeScript Harness template, legacy wrappers/modes, per-file
  script registration, `sourceFormat`, and old generated Nani modules.
- `pnpm validate:baseline` passes with 99 Vitest files / 809 tests, 13 real
  Extension Host tests, both production builds, all cleanup guards, and 17
  Playwright tests.
- Playwright evidence includes `game-a-nani-catalog-dirty-refresh-required.png`,
  `game-a-nani-scope-after-refresh.png`, and the four
  `game-a-workbench-problems-*.png` recovered-diagnostic layouts under
  `test-results/`.
- Game A retains its production entry ID and script path. Harness retains the
  pre-migration semantic revision. The draft path intentionally hard-cuts to
  `game-a/dev/draft-home-quarrel.nani` without an alias.
- Publication policy beyond physical scope separation and current strict
  production validation remains intentionally deferred.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Rollback must restore all consumers and generated files together. Script path
renames are intentionally not migrated and may invalidate existing saves through
the current revision/identity checks.

## Done When

- All three Game A scope roots and the Harness root use shared discovery.
- Runtime and debug policy are explicit at every call site.
- Generated modules, modes, wrappers, extension wiring, documentation, and
  cleanup guards have completed the same hard cut.
- Required gates pass and review evidence is recorded.
