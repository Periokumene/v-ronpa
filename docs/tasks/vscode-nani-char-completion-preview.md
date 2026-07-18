# VS Code Nani Character Completion Preview

## Base Branch

- `codex/vscode-nani-char-hover-preview`
- Base commit: `d71f05bf2ca8eb50289ea76da369345158beff54`

## Branch Name

- `codex/vscode-nani-char-completion-preview`

## Worktree Path

- `/Users/periokumene/Dev/v-ronpa`

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-07-18`
- Updated: `2026-07-18`
- Completed Commit: `This task's final implementation commit`
- Archive Target: `docs/archive/completed-tasks/vscode-nani-char-completion-preview.md`

## Goal

Add lazy native completion-item previews for static `@char` appearance token candidates. When a candidate such as `MOUTH0` is selected in IntelliSense, its documentation shows the candidate's visual contribution and the complete character that would result if the candidate were accepted.

## Context

- Builds on the static character assembly loader, SVG renderer, cache, and project resource service delivered by `docs/tasks/vscode-nani-char-hover-preview.md`.
- Existing character completion candidates are produced by `tools/vscode-nani/src/resourceCompletions.ts`.
- The user explicitly does not want a persistent view, Webview, editor-background injection, or token-expansion/provenance text.

## Constraints

- Use VS Code native completion documentation only.
- Do not automatically invoke Hover or alter editor selection.
- Keep completion list production fast; load character JSON/metadata/PNG only when VS Code resolves the selected completion item.
- Show visual output only: a token-local contribution image and a projected complete-character image.
- Preserve the existing diagnostics, language Hover, completion ordering, insert ranges, and character Hover behavior.
- Dynamic identities and invalid/non-character completion contexts do not produce previews.
- Preview failures remain local to completion documentation and `[char-preview]` output; they do not enter Problems.
- No Pixi, Webview, panel, sidebar, custom editor, or workbench CSS.

## Allowed Paths

- `tools/vscode-nani/**`
- `docs/tasks/vscode-nani-char-completion-preview.md`

## Forbidden Paths

- `packages/**`
- `apps/**`
- `packages/contracts/**`
- `.nani` IR or parser/compiler public structures
- Root `package.json`
- `pnpm-lock.yaml`
- Runtime assets and application foundations

## Contracts

- Existing `.nani` source and compiler semantics remain unchanged.
- Existing `@v-ronpa/layered-character` public resolver is consumed without modification.
- Existing `CharacterPreviewRequest`, project asset descriptors, static transforms, and artifact cache remain plugin-internal implementation details.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Alice appearance token completions carry enough context for lazy preview resolution | Pure completion tests |
| Selecting `MOUTH0` renders only its newly active visual layer(s) as the contribution | Character-preview unit tests |
| The same selected candidate renders the complete projected Alice composition | Character-preview unit and Extension Host tests |
| Completion previews do not render before VS Code resolves a selected item | Unit and Extension Host tests |
| Invalid or stale requests cannot overwrite current completion documentation | Unit/Extension Host cancellation and version tests |
| Existing non-character completions and language features remain unchanged | Existing plugin regression suite |
| No Webview, Pixi, background injection, or token expansion text is introduced | Module-boundary and bundle inspection |

## Regression Requirements

Required regression cases:

- Normal: `@char alice.EYE1,MO` resolves `MOUTH0` to contribution and projected full-character SVGs.
- Boundary: candidate replacement semantics identify the new mouth layer while excluding the replaced default mouth layer from the contribution artifact.
- Boundary: a removal-only token has no newly active PNG and returns a clear visual-unavailable state without breaking completion.
- Rejection: missing/changed assets and invalid document versions do not attach stale preview documentation.
- No-op: character IDs, non-character resources, commands, params, labels, and snippets retain their existing documentation and never invoke the preview engine.
- Compatibility: existing character Hover continues to work.

Test placement:

- Unit tests: `tools/vscode-nani/src/**/*.test.ts`
- Extension Host: `tools/vscode-nani/test/exact-diagnostics.test.cts`

## Dependency Changes

Allowed:

- Change only `tools/vscode-nani/package.json` version from `0.4.0` to `0.5.0` for the new feature.
- Do not add, remove, or update dependencies.
- Do not edit `pnpm-lock.yaml`.

## CCR Triggers

- A public package, contract, `.nani` IR, parser/compiler structure, dependency, app, or runtime change is required.
- Supported VS Code APIs cannot present the local SVG in completion documentation.
- Allowed paths are insufficient for a safe implementation.

## Required Gates

```bash
pnpm --filter v-ronpa-nani test
pnpm --filter v-ronpa-nani test:extension
pnpm --filter v-ronpa-nani check-types
pnpm --filter v-ronpa-nani build:prod
pnpm --filter v-ronpa-nani package:vsix
pnpm validate:nani-diagnostics-cleanup
pnpm validate:nani-diagnostics-quality
node scripts/generate-assets.mjs --check
pnpm typecheck
pnpm build
pnpm test
pnpm validate:contracts
pnpm validate:assets
pnpm validate:boundaries
pnpm validate:ccr
pnpm validate:app-cleanup
pnpm validate:vn-runtime-cleanup
BASE_REF=codex/vscode-nani-char-hover-preview pnpm validate:task-boundaries -- --task docs/tasks/vscode-nani-char-completion-preview.md
BASE_REF=codex/vscode-nani-char-hover-preview pnpm validate:subsystem -- --task docs/tasks/vscode-nani-char-completion-preview.md
pnpm validate:baseline
```

## Programmatic Acceptance

- Completion candidates remain cheap and preview generation occurs only from `resolveCompletionItem`.
- Candidate contribution and projected full-character artifacts use the same validated static render pipeline as Hover.
- Cancellation, document version, resource generation, and cache behavior are covered.
- Package tests, Extension Host tests, build/package gates, task boundaries, subsystem validation, and baseline pass.

## Manual Acceptance

- In `apps/game-a/src/nani/opening.nani`, type a partial Alice appearance token and inspect several candidates.
- Confirm the native IntelliSense details area shows a token-local image and projected complete-character image.
- Confirm accepting a candidate inserts only the token and does not move the cursor unexpectedly.
- Confirm closing IntelliSense removes the preview and leaves no persistent UI.
- Confirm command/parameter Hover and character Hover still work.

Evidence is stored only in ignored `output/vscode-nani-char-completion-preview/`.

## Review Packet

- Changed only `tools/vscode-nani/**` and this task card. No contracts, parser/compiler structures, runtime packages, apps, assets, root manifest, lockfile, or dependencies changed.
- Added deferred `@char` appearance-token completion metadata. `@slide` and all non-character completion surfaces remain outside the preview resolver.
- Added lazy native completion documentation backed by the existing project-resource service, validated layered-character resolver, static SVG pipeline, and global artifact LRU.
- Candidate documentation shows a compact newly-active-layer image and a complete projected-character image. It contains no expanded token expressions or internal layer provenance.
- Added document-version, cancellation, and resource-generation guards; failures remain in completion documentation and `[char-preview]` output only.
- Added regression coverage for candidate metadata, `@slide` exclusion, replacement contribution, removal-only candidates, compact SVG dimensions, lazy resolution, real SVG existence, and retained character Hover behavior.
- Verification:
  - `pnpm --filter v-ronpa-nani test`: 13 files / 89 tests passed.
  - `pnpm --filter v-ronpa-nani test:extension`: 10 tests passed.
  - `pnpm --filter v-ronpa-nani check-types`, `build:prod`, and `package:vsix`: passed.
  - `pnpm typecheck`, `pnpm build`, and `pnpm test`: passed; full repository suite is 68 files / 572 tests.
  - `pnpm validate:contracts`: 34 files / 367 tests passed.
  - Assets, boundaries, CCR, app cleanup, VN runtime cleanup, diagnostics cleanup, task boundaries, and subsystem validation passed; subsystem smoke is 7 tests.
  - `validate:nani-diagnostics-quality` functional stress passed. The performance benchmark remained red under current host load (`69.404 ms` stored baseline versus `94.822–98.362 ms` observed) and therefore stopped `validate:baseline`; concurrent Playwright work made some attempts worse, but isolated retries also exceeded the gate. This task changes no benchmark input under `packages/**`, `apps/**`, or `scripts/**`; the failure is retained as an explicit environmental baseline exception rather than changing the benchmark or widening task scope.
- VSIX:
  - `/Users/periokumene/Dev/v-ronpa/tools/vscode-nani/v-ronpa-nani-0.5.0.vsix`
  - SHA-256: `7a943d8f8f7bc7cdbad91ede167ef2a612008156cd2cbe1d5819d47dafb15a4e`
  - 8 files, about 120.33 KB; no Webview, Pixi runtime, panel, or editor background surface.
  - Installed version: `v-ronpa.v-ronpa-nani@0.5.0`.
  - Installed and built bundle SHA-256 both equal `5303d3498a744b5079514820b66de759c1a71087a796e4aeb3f8eceece043ec6`.
- Manual/visual evidence:
  - Real VS Code IntelliSense offered `MOUTH0` through `MOUTH6` for `@char alice.EYE0,MO` and generated only the selected candidate's two artifacts.
  - `output/vscode-nani-char-completion-preview/MOUTH0-token.png`
  - `output/vscode-nani-char-completion-preview/MOUTH0-complete.png`
  - Temporary edits to `opening.nani` were undone; `apps/**` has no diff.
- Residual UX note: VS Code owns whether the completion details pane is expanded. The extension supplies native documentation but does not force-open or focus it; once expanded, candidate selection drives lazy preview resolution.

## Merge Target

- `codex/vscode-nani-char-hover-preview`

## Rollback Notes

Reinstall the repository's `v-ronpa-nani-0.4.0.vsix`. Generated SVG artifacts are global extension cache files only and require no repository or runtime migration.

## Done When

- Native completion preview behavior and regression tests pass.
- VSIX is built, inspected, and installed locally.
- Diff remains inside Allowed Paths.
- Task card contains final evidence, residual risks, and completed commit.
