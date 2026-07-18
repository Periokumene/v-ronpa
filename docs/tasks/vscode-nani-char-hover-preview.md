# VS Code Nani Character Hover Preview

## Base Branch

- `codex/nani-exact-source-diagnostics`
- Pinned base commit: `42190582c8f2e83f6e4b3717c3c295730d868826`

## Branch Name

- `codex/vscode-nani-char-hover-preview`

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-07-18`
- Updated: `2026-07-18`
- Completed Commit: annotated by `vscode-nani-adapter-baseline-2026-07-18`
- Archive Target: `docs/archive/completed-tasks/vscode-nani-char-hover-preview.md`

## Goal

Add a native VS Code hover that statically assembles the layered character selected by the identity value of an `@char` command. Keep preview parsing, project resources, rendering, caching, and language diagnostics as independent plugin modules.

## Context

- The parent branch provides exact `.nani` source diagnostics and the current VS Code adapter baseline.
- Generated runtime assets remain the authority for mapping character IDs to local layered-character packs.
- `@v-ronpa/layered-character` remains the authority for composition expansion, active layer selection, and stable layer order.

## Constraints

- Preview only character ID and layered appearance expression. Ignore position, animation, transition, tint, and every other `@char` parameter.
- Do not add Pixi, canvas, native image, or webview dependencies.
- Do not publish preview failures as language diagnostics.
- Do not change contracts, `.nani` IR, parser/compiler behavior, runtime assets, apps, or product runtime packages.
- Keep existing completion, documentation hover, and diagnostics behavior unchanged outside the character identity value.

## Allowed Paths

- `tools/vscode-nani/**`
- `docs/tasks/vscode-nani-char-hover-preview.md`
- `pnpm-lock.yaml`

## Forbidden Paths

- `packages/**`
- `apps/**`
- `scripts/**`
- Root `package.json`
- Public contracts and `.nani` IR

## Contracts

- Consume existing layered-character schemas and resolver APIs without modifying them.
- Consume existing parser `CommandIR` and exact source maps without modifying their public shape.
- Preserve `NaniProjectAssetIndex` as the completion-facing resource interface.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Extract static `@char` identities without depending on unrelated parameters | Request-extractor unit tests and compiler parity cases |
| Assemble only active layered-character PNGs | Pack-loader unit tests and active-read assertions |
| Match static layer geometry and color controls | SVG renderer unit/snapshot tests |
| Keep preview isolated from language docs and Problems diagnostics | Hover coordinator and Extension Host tests |
| Keep last valid same-line preview during edits | Preview controller unit and Extension Host tests |
| Invalidate project/pack and disk artifacts safely | Resource watcher and artifact-cache tests |
| Render real Alice compositions | Manual VS Code visual evidence under ignored output directory |

## Regression Requirements

- Normal path: default and multi-token Alice expressions render a 320x420 SVG in native hover.
- Boundary path: dynamic, wildcard, unknown token, missing metadata/PNG, untrusted/non-file resources, cancellation, and obsolete document versions do not guess or publish stale output.
- Isolation path: unrelated invalid parameters do not block preview and preview failures do not enter Problems.
- Compatibility path: command and non-identity parameter hovers retain existing language documentation.
- Cache path: concurrent generation deduplicates; pack changes and newline edits invalidate the appropriate last-valid result.

Test placement:

- Unit tests: `tools/vscode-nani/src/**/*.test.ts`
- Extension Host: `tools/vscode-nani/test/**/*.test.cts`
- Manual evidence: ignored `output/vscode-nani-char-hover-preview/**`

## Dependency Changes

Allowed: add only `@v-ronpa/layered-character: workspace:*` to `tools/vscode-nani/package.json`, its TypeScript project reference, and the corresponding lockfile importer. No renderer or native dependencies are allowed.

## CCR Triggers

- Any public schema, parser/compiler behavior, `.nani` IR, runtime port, or asset-manifest shape must change.
- Any required implementation falls outside Allowed Paths.
- Any dependency beyond the explicitly allowed layered-character package is required.

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
BASE_REF=codex/nani-exact-source-diagnostics pnpm validate:task-boundaries -- --task docs/tasks/vscode-nani-char-hover-preview.md
BASE_REF=codex/nani-exact-source-diagnostics pnpm validate:subsystem -- --task docs/tasks/vscode-nani-char-hover-preview.md
pnpm validate:baseline
```

## Programmatic Acceptance

- Package unit, Extension Host, type, production build, VSIX packaging, contract, asset, boundary, and task-scope gates pass.
- The VSIX contains no Pixi/browser runtime and exposes `v-ronpa-nani.previewCharacterAtCursor` without a default keybinding.
- Generated SVG contains embedded raster data only and no scripts, `foreignObject`, external layer references, or outline approximation.

## Manual Acceptance

- Completed in installed VS Code 0.4.0 against `apps/game-a/src/nani/opening.nani`.
- Alice default rendered with five active layers.
- `EYE1,MOUTH3,ArmL2` and `EYE4,MOUTH5,ArmL4,ArmR2,EFFECT0` rendered with six active layers and visibly distinct assemblies.
- Editing the latter expression to `Missing` retained the previous image, first reported updating, then reported the resolver error explicitly.
- Extension Host coverage verifies command-name and non-identity parameter hovers still show language documentation.

## Review Packet

- Boundary: changes are limited to `tools/vscode-nani/**`, this task card, and the lockfile importer; public contracts, apps, runtime packages, and `.nani` IR are untouched.
- Regression evidence: 84 plugin unit tests, 9 Extension Host tests, 572 repository tests, 367 contract-subsystem tests, and 7 Playwright smoke tests passed.
- Gates: task boundaries, subsystem, baseline, contracts, assets, architecture boundaries, CCR, cleanup, exact diagnostics stress/quality, Game A build, and harness build passed.
- VSIX: `v-ronpa-nani-0.4.0.vsix`, SHA-256 `95e6bf8ff99ea3a4344edfbecbc707af7841d03f95bae961a7e3b03730b01d19`; installed version is 0.4.0.
- Installed bundle matches the packaged build at SHA-256 `3efda4cfd29af55591a472ca130e5eecb63931c10df50c09be41a19227b9e327`.
- Ignored Alice visual evidence:
  - `output/vscode-nani-char-hover-preview/6abdb1452777eb5d565fafd98dcec26ec0626f1f7d3b686f9c15945e3f06a0f2.browser.png` (default)
  - `output/vscode-nani-char-hover-preview/8b91f51e3b75cb2a99ab33b637b425bc87ad637528bb46ec521a51b0d97543ee.browser.png` (`EYE1,MOUTH3,ArmL2`)
  - `output/vscode-nani-char-hover-preview/2520de3a1981164927ba9a3c1c3fc780d929c2389d374ee3844c8b451c3c302a.browser.png` (`EYE4,MOUTH5,ArmL4,ArmR2,EFFECT0`)
- Residual risk: native Hover is static; when a prior image exists, a changed valid expression completes in the background and appears on the next hover invocation.

## Merge Target

- `integration/v-ronpa-baseline` after the parent diagnostics branch is integrated or as an intentional stacked review.

## Rollback Notes

Reinstall `tools/vscode-nani/v-ronpa-nani-0.3.0.vsix`. Cached SVG artifacts in extension global storage are content-addressed and may remain safely; no project, save, asset, or runtime migration is required.

## Done When

- Required tests and gates pass.
- `v-ronpa-nani-0.4.0.vsix` is inspected and locally installed.
- Alice manual evidence is recorded.
- The implementation is committed and tagged with the planned annotated baseline tag.
