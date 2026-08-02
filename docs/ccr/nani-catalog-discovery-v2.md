# Contract Change Request

> Status: accepted for the Nani Catalog Discovery v2 hard upgrade.

## Requested Change

Replace ordered per-file Nani registration with recursive scope-root discovery
and establish one explicit source-diagnostic policy for generation, runtime,
debug materialization, development snapshots, and editor analysis.

## Superseded Decision

This CCR supersedes every statement that an ordered `scripts` list is the sole
membership authority. Entry identity remains explicit; ordinary script
membership is now determined exclusively by a configured production,
development, or test directory.

## Affected Packages And Apps

- `packages/nani-project` (new Node/tooling package)
- `packages/nani-runtime-compiler`
- `packages/app-vn-runtime`
- `packages/app-vn-devtools`
- `apps/game-a`
- `apps/game-harness`
- `tools/vscode-nani`
- asset generation and validation scripts

## Why Existing Contract Is Insufficient

The current configuration duplicates source-file/script-path pairs across the
generator, Vite, extension, test catalogs, and Harness template special cases.
A valid `.nani` beside a registered script therefore remains outside the
runnable and editor catalogs. Error handling is also duplicated as an implicit
"any error blocks" rule even though the compiler already removes two kinds of
invalid commands while preserving surrounding executable content.

## Proposed Shape

- `NaniProjectConfig` declares `scopes`, one production `mainEntry`, named test
  entries, and voice locales.
- Game A's canonical physical scope roots are `src/nani`, `src/nani-dev`, and
  `src/nani-test`; their stable logical roots remain `game-a`, `game-a/dev`, and
  `game-a/test` respectively.
- Discovery recursively admits ordinary `.nani` files from configured roots,
  normalizes POSIX paths, sorts stably, and rejects missing roots/entries,
  symlinks, escapes, duplicate logical paths, and case-fold collisions.
- `NaniSourceDiagnosticPolicy` is mandatory wherever source becomes runnable.
- Only `unknown-command` and error-severity `invalid-command-param` are
  recoverable under `allow-recoverable-command-errors`; all unrecognized codes
  default to fatal.
- Production build analysis uses `strict`; development snapshots use
  `allow-recoverable-command-errors`.
- Development uses a production+development union catalog; test is isolated.
- Directory structural changes invalidate the catalog until a page refresh;
  ordinary file edits keep atomic monotonic HMR.

## Compatibility And Migration

This is an atomic hard cut. There are no legacy config readers, path aliases,
mode aliases, wrapper modules, generated-file re-exports, or TypeScript-template
source branches. Renaming a file creates a new script path and no save migration
or script alias is generated.

The public `.nani` syntax/IR, `SaveData`, `ContentManifest`, existing production
entry ID/path, and Harness entry ID/path remain unchanged. Revision changes keep
using existing restore rejection semantics.

## Tests And Gates

- Shared discovery tests cover nested paths, sorting, ignores-by-extension,
  symlinks, case collisions, missing roots/entries, and path safety.
- Compiler/runtime/debug tests cover the strict/recoverable matrix and prove
  invalid commands are omitted while valid surrounding commands execute.
- Generator tests cover atomic failure, recoverable output, development
  reporting, split output, and freshness checks.
- Devtools/Vite tests and smoke screenshots cover scope/status/dirty refresh.
- Extension tests prove managed-root discovery, union navigation, and isolated
  shared test catalog behavior.
- Cleanup guards reject all superseded configuration, mode, source-format, and
  generated-file names.

## Rebase Impact

Branches importing old generated modules, old smoke story wrappers, old Vite
modes, or reading `scripts`/`sourceFormat` must rebase and adopt the new scope
configuration and generated catalog modules. No compatibility window is
provided.
