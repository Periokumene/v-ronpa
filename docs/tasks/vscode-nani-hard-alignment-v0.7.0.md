# VS Code Nani 0.7.0 Hard Alignment

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/vscode-nani-hard-alignment-v0.7.0`

## Status

- State: `In Progress`
- Owner: `Codex`
- Created: `2026-08-03`
- Updated: `2026-08-03`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/vscode-nani-hard-alignment-v0.7.0.md`

## Goal

Hard-align the VS Code Nani extension from `vscode-nani-v0.6.1` through the
catalog-discovery v2 baseline, converge project analysis on
`@v-ronpa/nani-project`, complete Cue and staged-text authoring support, and
locally release/install/tag version `0.7.0` without compatibility readers.

## Context

- Baseline tag: `vscode-nani-v0.6.1` (`ee9e80b`).
- Feature audit baseline: `4f8d43a`.
- Audit record: `tools/vscode-nani/docs/alignment-2026-08-03.md`.
- Existing project hard cut: `docs/ccr/nani-catalog-discovery-v2.md`.
- Existing syntax decisions: `docs/ccr/cue-story-text-hard-cut.md` and
  `docs/ccr/nani-inline-staged-text.md`.

## Constraints

- Do not modify `packages/contracts` or the existing `.nani` IR.
- Do not add legacy `outputPath`, per-file script registration, config aliases,
  compatibility schemas, or fallback analysis paths.
- Keep generated runtime assets and `compositions.json` as the only project
  resource authorities.
- Keep preview rendering native, lazy, static, and independent from Pixi,
  Webviews, editor decorations, or app surfaces.
- Do not push commits, branches, tags, or create a remote release.

## Allowed Paths

- `packages/nani-project/**`
- `packages/app-vn-devtools/**`
- `scripts/generate-assets.mjs`
- `scripts/generate-assets.test.ts`
- `scripts/validate-nani-diagnostics-cleanup.mjs`
- `tools/vscode-nani/**`
- `docs/nani/command-catalog.md`
- `docs/tasks/vscode-nani-hard-alignment-v0.7.0.md`
- `docs/archive/completed-tasks/vscode-nani-hard-alignment-v0.7.0.md`

## Forbidden Paths

- `packages/contracts/**`
- `packages/nani-parser/src/types/**`
- Runtime, renderer, app, asset payload, save, or manifest code outside the
  listed integration callers.
- Root `package.json` and `pnpm-lock.yaml`.

## Contracts

- `@v-ronpa/nani-project` owns strict project-config parsing, discovery,
  diagnostic policy, parse/compile/link analysis, and exact diagnostic spans.
- VS Code owns only document overlays, URI/version tracking, native editor
  presentation, and navigation mapping.
- `runtimeAssetOutputPath` is the only generated runtime asset module key.
- Existing `@cue`, `@hideCue`, `[-]`, and `[wait i]` syntax/IR remain unchanged.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Shared multi-entry analysis with unsaved text | `packages/nani-project` and VS Code project-service tests |
| Cue/HideCue authoring | Language facts, completion, Hover, and Extension Host tests |
| Staged-text authoring | Completion, Hover, grammar, parser-backed, and exact-diagnostic tests |
| Hard asset config cut | Project asset loader rejection and real Game A asset tests |
| Character previews | Unit and Extension Host artifact tests plus installed-extension review |
| No duplicate project analysis | Cleanup guard and module-boundary tests |
| Installable 0.7.0 | VSIX inspection, hashes, CLI installation, and annotated tag |

## Regression Requirements

- Normal: Cue/HideCue authoring, four inline tokens, union development catalog,
  isolated multi-entry test catalog, real character Hover/completion previews.
- Boundary: old config keys, invalid scopes/entries, dynamic or invalid staged
  text, invalid/duplicate text IDs, and fatal catalog sources.
- No-op: non-staged compilation and removal-only character candidate behavior
  stay unchanged.
- Wiring: recoverable compiler errors remain runnable, fatal sources are absent
  from navigation, and open unsaved text participates in shared analysis.

Test placement:

- `packages/nani-project/src/**/*.test.ts`
- `tools/vscode-nani/src/**/*.test.ts`
- `tools/vscode-nani/test/**/*.test.cts`

## Dependency Changes

Allowed: edit `tools/vscode-nani/package.json` only to bump the extension
manifest version to `0.7.0`. No dependency entry changes are allowed; the
already-added `@v-ronpa/nani-project` workspace dependency is reused and
`pnpm-lock.yaml` stays unchanged.

## CCR Triggers

No new CCR is expected. Stop if implementation requires changing
`packages/contracts`, `.nani` IR, save data, manifests, or runtime command
semantics.

## Required Gates

```bash
pnpm --filter v-ronpa-nani test
pnpm --filter v-ronpa-nani check-types
pnpm --filter v-ronpa-nani build:prod
pnpm --filter v-ronpa-nani test:extension
pnpm vitest run packages/nani-project packages/nani-parser packages/nani-runtime-compiler tools/vscode-nani
pnpm validate:command-docs
pnpm validate:nani-diagnostics-cleanup
pnpm validate:contracts
pnpm validate:assets
pnpm validate:boundaries
pnpm validate:ccr
pnpm typecheck
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
BASE_REF=integration/v-ronpa-baseline pnpm validate:task-boundaries -- --task docs/tasks/vscode-nani-hard-alignment-v0.7.0.md
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/vscode-nani-hard-alignment-v0.7.0.md
pnpm validate:baseline
```

The final Extension Host candidate must pass three consecutive runs.

## Programmatic Acceptance

- Every required gate passes from a clean release candidate.
- The post-tag audit accounts for every reachable commit.
- Generated outputs are fresh and unchanged; no generated runtime asset
  registry or source IR changes.
- VSIX metadata, packaged bundle, installed bundle, version, and hashes agree.

## Manual Acceptance

- In stable VS Code, reload after installing 0.7.0 and inspect real Game A
  character Hover and completion details.
- Confirm Cue/staged completions and Hover, cross-script navigation, and an
  empty `[char-preview]` error log.
- Confirm no Pixi/Webview/editor-surface preview implementation was added.

## Merge Target

- Local `integration/v-ronpa-baseline` via `--no-ff`; nothing is pushed.

## Rollback Notes

There is no extension-only downgrade path on the current project config.
Rollback requires restoring the repository to the 0.6.1 configuration and
reinstalling the 0.6.1 VSIX together.

## Done When

- Implementation, regression coverage, all gates, VSIX inspection, local
  installation, installed-bundle verification, merge, and annotated tag pass.
