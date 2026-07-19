# Nani Exact Source Diagnostics

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/nani-exact-source-diagnostics`

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-07-18`
- Updated: `2026-07-18`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/nani-exact-source-diagnostics.md`

## Goal

Make original-source UTF-16 spans the only authority for all `.nani` parser and
compiler diagnostics, then reduce the VS Code extension to a thin range adapter.
The migration is an atomic hard cut with one required parsed-document API and
one exact diagnostic-range authority.

## Context

- `ScenarioIR`, `RuntimeScript`, runtime commands, saves, command semantics, and
  generated script revisions remain unchanged.
- The parser returns a required `NaniSourceMap` beside `ScenarioIR`; the compiler
  accepts that parsed document and emits diagnostics with required spans.
- `ignored-promoted-primary` and unsupported runtime UI targets move from the
  extension into the compiler without adding new validation rules.
- See `docs/adr/0005-nani-source-provenance.md`,
  `docs/ccr/nani-source-diagnostic-provenance.md`, and
  `docs/architecture/nani-source-diagnostics.md`.

## Constraints

- Keep `CommandIR.args` as the compiler's sole binding authority.
- Do not add provenance to public IR, runtime commands, or saves.
- Do not introduce a CST, Tree-sitter, LSP, second grammar, or language-service
  package.
- Preserve parser recovery, compiler normalization, diagnostic ordering, and
  runtime command emission/skip behavior.
- Delete old parser ports, bare-IR compiler input, and extension heuristics in
  the same change.

## Allowed Paths

- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `packages/app-vn-session/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-runtime/**`
- `apps/game-a/**`
- `apps/game-harness/**`
- `scripts/**`
- `tools/vscode-nani/**`
- `docs/**`
- `README.md`
- `package.json`
- `pnpm-lock.yaml`
- `.gitignore`
- Ignore/config files needed for Extension Host test artifacts

## Forbidden Paths

- `packages/contracts/**`
- Runtime command, save, content-manifest, and asset-registry schemas
- Renderer, Navi, Trial, Pixi, R3F, Dexie, and Howler implementations
- Game or harness behavior outside compile-call migration and tests

## Contracts

- `ScenarioIR`, `CommandIR`, `NaniValue`, and `SourceLocation` keep their current
  shapes and semantics.
- `RuntimeScript`, `RuntimeCommand`, generated assets, script revisions, and save
  data remain byte/semantically stable.
- Parser and compiler diagnostics require stable code, severity, message, coarse
  `SourceLocation`, and exact half-open UTF-16 `TextSpan`.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Exact parser ranges | Parser tests slice original LF/CRLF/Unicode source by every diagnostic span |
| Exact compiler ranges | Binding and validation tests locate command names, args, values, and list items |
| Runtime parity | Corpus and compiler snapshots keep identical `ScenarioIR` and `RuntimeScript` |
| Single diagnostic owner | Cleanup validation rejects extension semantic probes and range heuristics |
| Real editor behavior | VS Code Extension Host tests assert `document.getText(diagnostic.range)` |
| No stale diagnostics | Rapid-edit Extension Host test rejects results from old document versions |

## Regression Requirements

- Normal path: parse and compile every repository `.nani` source with unchanged
  IR/runtime output and resolvable source references.
- Boundary path: CRLF, BOM, tabs, emoji, combining characters, repeated tokens,
  quoted/escaped values, inline commands, text IDs, and rich text.
- Rejection path: unknown command/param, bad value/list item, missing label,
  duplicate label/text ID, unclosed delimiter, ignored promoted primary, and
  unsupported UI target.
- No-op path: warning-only commands still emit; malformed commands recover and
  later statements still parse.
- Serialization path: generated script revision, assets, dependencies, and
  preload metadata do not change.

Test placement:

- `packages/nani-parser/src/**/*.test.ts`
- `packages/nani-runtime-compiler/src/**/*.test.ts`
- `tools/vscode-nani/src/**/*.test.ts`
- `tools/vscode-nani/test/**` for Extension Host cases
- `scripts/nani-semantic-golden.test.ts` and the semantic/diagnostic fixtures
  under `scripts/fixtures/` for repository-corpus and diagnostic parity
- Existing app/session/generator regression tests at their current paths

## Dependency Changes

Allowed only for the VS Code Extension Host test runner. Add exact development
dependencies for `@vscode/test-cli`, `@vscode/test-electron`, and Mocha types;
update `pnpm-lock.yaml`. No production or parser/compiler dependency is allowed.

## CCR Triggers

- The parser result and compiler input are breaking public API changes covered
  by `docs/ccr/nani-source-diagnostic-provenance.md`.
- Stop if implementation would alter `ScenarioIR`, `RuntimeScript`, saves, or
  require optional provenance/a second API.

## Required Gates

```bash
pnpm vitest run packages/nani-parser packages/nani-runtime-compiler
pnpm --filter v-ronpa-nani test
pnpm test:extension
node scripts/generate-assets.mjs --check
pnpm --filter v-ronpa-nani check-types
pnpm --filter v-ronpa-nani build:prod
pnpm --filter v-ronpa-nani package:vsix
pnpm validate:nani-diagnostics-cleanup
pnpm validate:nani-diagnostics-quality
pnpm typecheck
pnpm build
pnpm test
pnpm validate:contracts
pnpm validate:assets
pnpm validate:boundaries
pnpm validate:ccr
pnpm validate:app-cleanup
pnpm validate:vn-runtime-cleanup
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
pnpm validate:baseline
BASE_REF=integration/v-ronpa-baseline pnpm validate:task-boundaries -- --task docs/tasks/nani-exact-source-diagnostics.md
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/nani-exact-source-diagnostics.md
```

## Programmatic Acceptance

- All diagnostics have non-optional exact spans and stable codes.
- No extension diagnostic path searches source text or parses a diagnostic message.
- All existing runtime/compiler snapshots and generated assets are unchanged.
- Focused, Extension Host, package, boundary, contract, and baseline gates pass.
- The source-map benchmark stays within the documented regression threshold.

## Manual Acceptance

- Inspect one parser error, one compiler error, and one CRLF/emoji case in the
  Extension Host and confirm the underline covers only the offending lexeme.
- Inspect the final diff for optional/legacy APIs and duplicated semantic rules.

## Validation Evidence

- The versioned semantic golden covers all five repository `.nani` files and the
  Harness TypeScript template; six stored baseline corpus projections are deeply
  equal. Structured diagnostic goldens additionally freeze all 12 parser codes
  and all 6 compiler codes, including loc, ordering, span, and sliced lexeme.
- Focused parser/compiler tests pass: 6 files, 98 tests. Full repository tests pass:
  68 files, 572 tests. Existing extension unit tests pass: 50 tests.
- VS Code 1.99.3 Extension Host tests pass: 6 tests, including CRLF/Unicode,
  duplicate-command occurrence, UI list-item, rich-text, and stale-version cases.
- An isolated Extension Development Host visual smoke confirmed that the editor
  underlines only `not-a-color`, `fast`, and `hud` for parser, compiler, and
  CRLF/Chinese/emoji-adjacent diagnostics respectively; no visual snapshot is
  required because extension UI did not change.
- Playwright smoke passes: 7 tests. The packaged VSIX contains eight intended files
  and excludes test sources, fixtures, caches, and test dependencies.
- Deterministic catalog and recovery stress checks pass for 50,000 catalog cases
  and 20,000 invalid-input fuzz cases, covering 53,324 exact diagnostics and
  230,987 structural refs.
- The warmed alternating 50-run benchmark measured the real opening corpus at
  0.516 ms before and 3.216 ms after (+2.700 ms), and a synthetic 10,000-line
  corpus at 69.404 ms before and 78.923 ms after (+9.519 ms, +13.716%). The
  opening corpus stays below the 5 ms absolute condition and the synthetic corpus
  stays below the 20% relative condition; neither crosses both blocking limits.
- Focused, generated-asset, typecheck, build, contract, asset, boundary, CCR,
  cleanup, application build, Extension Host, smoke, baseline, task-boundary, and
  subsystem gates all pass on this branch.

## Review Packet

- Changed files and removed legacy symbols.
- Focused/full gate output, performance comparison, and VSIX file inspection.
- Runtime parity and exact-range regression summary.
- Residual risks, if any, with no compatibility workaround.

## Merge Target

- `integration/v-ronpa-baseline` as one atomic public-API migration.

## Rollback Notes

Revert the atomic merge. No save, content, asset, or generated-script migration
is required because their public shapes and outputs are unchanged.

## Done When

- Required tests and gates pass.
- Old APIs, heuristics, active documentation, and duplicate semantic checks are removed.
- Parser/compiler/extension share one exact-source diagnostic standard.
