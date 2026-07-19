# VS Code Nani And Editor Tools Convergence

## Base Branch

- `integration/v-ronpa-baseline`
- Pinned base commit: `a7bb0091234f7796df3db93a7bfe3f0ae948e300`
- First source tip: `codex/vscode-nani-char-completion-preview@c493dc127d3c2e347a0f1c1d3cad25e84ed37c0a`
- Second source tip: `codex/editor-tools@9bc1434cce730a138ae2af4123ca39f49c11e2eb`

## Branch Name

- `codex/v-ronpa-baseline-editor-convergence`

## Status

- State: `In Progress`
- Owner: `Codex`
- Created: `2026-07-19`
- Updated: `2026-07-19`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/vscode-nani-editor-tools-convergence.md`

## Goal

Serially merge the exact-source VS Code Nani preview stack and the source-first
Editor Tools stack into one architecture. Parser/compiler diagnostics, runtime
script semantics, layered-character composition, runtime debug ports, and
generated command documentation each retain exactly one authority.

## Context

- `docs/adr/0005-nani-source-provenance.md`
- `docs/ccr/nani-source-diagnostic-provenance.md`
- `docs/ccr/vn-runtime-debug-boundary-hard-cut.md`
- `docs/architecture/nani-source-diagnostics.md`
- `docs/architecture/vn-devtools.md`
- The source branches overlap in 14 files; the dry merge reports seven textual
  conflict files and 25 conflict hunks.
- Four Editor Tools consumers and one compiler test helper still call the
  removed bare-`ScenarioIR` compiler API.

## Constraints

- Keep `compileRuntimeScript(document: ParsedScenarioDocument)` as the sole
  compiler entry and keep exact UTF-16 spans required on parser/compiler diagnostics.
- Do not add compatibility overloads, deprecated aliases, save migrations,
  session-v1 migration, a second grammar, or a second validation authority.
- Keep the product runtime root limited to shell, presentation, lifecycle, and
  diagnostics; debug inspection remains behind the explicit debug entry.
- Keep the Workbench descriptor registry internal and the Game A host DEV-only.
- Preserve RuntimeScript, RuntimeCommand, save, manifest, and `.nani` IR shapes.
- Preserve both source branch histories with audited merge commits.

## Allowed Paths

- `apps/game-a/**`
- `apps/game-harness/**`
- `packages/app-vn-devtools/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-runtime/**`
- `packages/app-vn-session/**`
- `packages/app-vn-shell/**`
- `packages/layered-character/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `packages/story-engine/**`
- `packages/ui-kit/**`
- `tools/vscode-nani/**`
- `scripts/**`
- `tests/smoke/**`
- `docs/**`
- `README.md`
- `design-qa.md`
- `package.json`
- `pnpm-lock.yaml`
- `playwright.config.ts`
- `tsconfig.json`

## Forbidden Paths

- `packages/contracts/**`
- Save, RuntimeCommand, ContentManifest, AssetRegistry, or `.nani` IR schemas
- Navi, Trial, Pixi, R3F, Dexie, and Howler implementations
- Public Workbench panel/plugin registration APIs
- Compatibility or historical conversion layers

## Contracts

- `ParsedScenarioDocument` and required source spans are the only Nani
  parser/compiler source contract.
- `serializeRuntimeScriptSemantics()` is the only canonical revision input;
  Node and WebCrypto hashing must agree.
- `VnRuntimeDiagnostic` and Workbench wire diagnostics preserve exact spans for
  parser/compiler sources while non-source diagnostics may remain line-only.
- `VnRuntimeShellPort`, `VnPresentationPort`, `VnLifecyclePort`, and
  `VnDiagnosticsPort` remain the product runtime boundary.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Required parsed-document compiler input | Cleanup guard plus compiler, materializer, Vite, and Game A tests |
| One semantic revision authority | Node/WebCrypto parity and formatting-vs-semantic change tests |
| Exact Workbench diagnostics | Protocol, controller, source-view, CRLF, Unicode, duplicate-token, and visual tests |
| Preserved runtime/debug boundaries | Public-surface, cleanup, boundary, production bundle, and smoke tests |
| Preserved preview behavior | VS Code unit and Extension Host hover/completion tests |
| One generated command matrix | Command-doc freshness gate |

## Regression Requirements

- Normal path: valid repository scripts compile, inspect, preview, and produce
  matching server/browser semantic revisions.
- Boundary path: CRLF, emoji, combining characters, repeated same-line
  diagnostics, and overlapping Find/diagnostic ranges retain exact UTF-16 spans.
- Rejection path: invalid compiler input, stale HMR candidates, blocked restore,
  unsupported UI targets, and deleted legacy symbols are rejected.
- No-op path: formatting-only source updates refresh mappings without changing
  revision or reinstalling presentation state.
- Serialization path: Node and WebCrypto SHA-256 digests match and generated
  script metadata remains deterministic.

Test placement:

- `packages/nani-parser/src/**/*.test.ts`
- `packages/nani-runtime-compiler/src/**/*.test.ts`
- `packages/app-vn-runtime/src/**/*.test.ts`
- `packages/app-vn-devtools/src/**/*.test.ts(x)`
- `tools/vscode-nani/src/**/*.test.ts` and `tools/vscode-nani/test/**`
- `scripts/**/*.test.ts`
- `tests/smoke/**`

## Dependency Changes

Allowed only for the dependencies already authorized on the two source branches:
VS Code Extension Host test tooling, `@v-ronpa/layered-character` consumption,
the private `app-vn-devtools` package, and Phosphor icons. Regenerate one combined
lockfile from the merged manifests; do not add further dependencies.

## CCR Triggers

- Any change to `packages/contracts`, `.nani` IR, RuntimeCommand, save data,
  manifest shape, or the four product runtime ports.
- Any compatibility overload, migration layer, or public Workbench plugin API.
- Any dependency beyond those explicitly authorized above.

## Required Gates

```bash
pnpm vitest run packages/nani-parser packages/nani-runtime-compiler packages/app-vn-runtime packages/app-vn-devtools
pnpm --filter v-ronpa-nani test
pnpm test:extension
node scripts/generate-assets.mjs --check
pnpm validate:command-docs
pnpm validate:nani-diagnostics-cleanup
pnpm validate:nani-diagnostics-quality
pnpm validate:vn-runtime-cleanup
pnpm validate:app-cleanup
pnpm typecheck
pnpm build
pnpm test
pnpm validate:contracts
pnpm validate:assets
pnpm validate:boundaries
pnpm validate:ccr
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:task-boundaries -- --task docs/tasks/vscode-nani-editor-tools-convergence.md
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/vscode-nani-editor-tools-convergence.md
pnpm validate:baseline
```

## Programmatic Acceptance

- Both cleanup standards pass simultaneously with no legacy source matches.
- Parser/compiler diagnostics reach VS Code and Workbench without source search,
  message parsing, range approximation, or span loss.
- Product and debug runtimes retain one reducer/dispatch authority and the Game A
  production build excludes all DEV tooling.
- Generated assets, command docs, typecheck, builds, tests, smoke, task-boundary,
  subsystem, and baseline gates pass.

## Manual Acceptance

- Inspect Workbench Problems at 720px, 420px, 320px, and narrow overlay widths;
  confirm the exact offending source token is underlined without obscuring Find.
- Inspect one VS Code parser diagnostic, compiler diagnostic, hover preview, and
  completion preview after the combined merge.
- Review the final diff for deleted-code resurrection and duplicate authorities.

## Review Packet

- Merge topology and resolved-conflict matrix.
- Changed files and deleted legacy symbols.
- Focused/full gate output and ignored screenshot evidence paths.
- Public API and generated-output invariants.
- Residual risks and explicit non-goals.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Revert the convergence and its two source merge commits. No save, runtime script,
manifest, or session migration is required.

## Done When

- Both source histories are present and the integration branch is green.
- Exact spans, script revisions, layered-character composition, runtime debug
  boundaries, and command documentation each have one authority.
- Completed task cards and Design QA evidence are archived, and the local target
  branch is fast-forwarded without pushing.
