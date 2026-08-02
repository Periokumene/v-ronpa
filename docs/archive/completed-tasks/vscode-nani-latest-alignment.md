# VS Code Nani Latest Alignment

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/vscode-nani-latest-alignment`

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-07-17`
- Updated: `2026-07-17`
- Completed Commit: `a7bb0091234f7796df3db93a7bfe3f0ae948e300`
- Completed Tag: `vscode-nani-adapter-baseline-2026-07-17`
- Archive Target: `docs/archive/completed-tasks/vscode-nani-latest-alignment.md`

## Goal

Align the VS Code `.nani` extension with all compiler, runtime, and project-resource changes after `vscode-nani-adapter-baseline-2026-07-03`, package version 0.2.0, install it locally, and mark the merged alignment with a new annotated tag.

## Context

- The shared `naniCommandCatalog`, parser, and runtime compiler remain the language authority.
- Project asset IDs come from the configured generated assets module; layered-character tokens come from `compositions.json`.
- The post-tag audit identified media volume-adjustment forms, unconditional BGM looping, persisted looping media, the 120ms default `@char` transition, and new Alice composition tokens.

## Constraints

- Do not change public contracts, `.nani` IR, parser, compiler, or runtime dispatch.
- Do not duplicate asset ID generation rules in the extension.
- Resource indexing is completion-only and must not reject external or dynamic IDs.
- Do not add a repository-wide warning gate.
- Package metadata may change only for the 0.2.0 extension release and version-derived VSIX packaging; no dependency changes are allowed.

## Allowed Paths

- `tools/vscode-nani/**`
- `apps/game-a/src/nani/opening.nani`
- `apps/game-a/src/nani-test/smoke.nani`
- `apps/game-a/src/gameAScripts.test.ts`
- `apps/game-a/src/generatedTestScripts.ts`
- `docs/tasks/vscode-nani-latest-alignment.md`

## Forbidden Paths

- `packages/contracts/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `packages/app-vn-dispatch/**`
- `pnpm-lock.yaml`
- Any app or harness path not explicitly allowed above.

## Contracts

- Honor `NaniCommandDefinition`, parameter `docs.runtimeSupport`, `RuntimeAssetSchema`, and `LayeredCharacterCompositionsSchema` without modifying them.
- Honor compiler diagnostics and normalized runtime command behavior as bundled workspace dependencies.
- Add only the VS Code command `v-ronpa-nani.refreshProjectAssets`; no public runtime interface changes.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Runtime-valid command and parameter completion | Extension unit tests exclude declared-only commands and declared-not-consumed params |
| Promoted unknown primary detection | Diagnostics tests reject `@flash time:0.05` and accept colon-form asset IDs |
| Generated asset completion | Pure resource-index and completion tests filter IDs by command and parameter |
| Character token completion | Tests cover character selection and comma-separated composition tokens |
| Safe project discovery | Tests cover nearest config, no config, malformed data, and untrusted workspace |
| Script cleanup | Game A script regression compiles flash to 50ms and reports no SFX wait warning |
| Installable 0.2.0 release | Production build, VSIX inspection, CLI installation, version and checksum verification |

## Regression Requirements

- Normal path: trusted workspace discovers the nearest asset config and completes generated IDs and character tokens.
- Boundary path: untrusted, missing, malformed, changed, and deleted project data degrades to core language support.
- Rejection path: ignored colon-form primary params produce an editor diagnostic while real resource IDs do not.
- Compatibility path: handwritten declared-only commands and unsupported params retain shared hover/compiler diagnostics.

Test placement:

- `tools/vscode-nani/src/**/*.test.ts`
- `apps/game-a/src/gameAScripts.test.ts`

## Dependency Changes

- Allowed for the package metadata changes described below.
- Editing `tools/vscode-nani/package.json` is allowed only for version, command contribution, activation, and packaging script metadata.
- Adding, removing, or changing dependencies is not allowed.
- `pnpm-lock.yaml` must remain unchanged.

## CCR Triggers

- Any required change to public contracts, `.nani` IR, parser/compiler output, runtime dispatch, or manifest shape stops this task and requires a separate CCR-backed task.

## Required Gates

```bash
pnpm --filter v-ronpa-nani test
pnpm --filter v-ronpa-nani check-types
pnpm --filter v-ronpa-nani build:prod
pnpm --filter v-ronpa-nani package:vsix
pnpm vitest run packages/nani-runtime-compiler/src/index.test.ts apps/game-a/src/gameAScripts.test.ts
pnpm validate:contracts
pnpm validate:assets
pnpm validate:boundaries
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
pnpm validate:baseline
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
BASE_REF=integration/v-ronpa-baseline pnpm validate:task-boundaries -- --task docs/tasks/vscode-nani-latest-alignment.md
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/vscode-nani-latest-alignment.md
```

## Programmatic Acceptance

- All required gates pass without contract, parser/compiler, runtime, dependency, or lockfile changes.
- VSIX metadata reports 0.2.0 and its installed bundle checksum matches the packaged bundle.
- The post-tag audit accounts for every reachable commit and records the complete effective language delta.

## Manual Acceptance

- Resource discovery remains relative to the current `.nani` project rather than Game A-specific paths.
- Generated assets and compositions remain the only resource authorities.
- VS Code may require one Reload Window after installation; the task must not force-close the editor.

## Review Packet

- Changed files and post-tag audit summary.
- Unit, build, validation, smoke, package, and installation evidence.
- Installed extension version and checksum comparison.
- Residual limitations: raw assets require the existing generator before their IDs appear; unknown resource IDs are not diagnosed.

## Merge Target

- `integration/v-ronpa-baseline` via `--no-ff` merge commit.

## Rollback Notes

- Revert the merge commit and reinstall the retained 0.1.0 VSIX before deleting it if rollback is required.
- No save migration, public contract rollback, or content-manifest migration is required.

## Done When

- Required tests and gates pass.
- Version 0.2.0 is installed and verified in local stable VS Code.
- The merge commit is tagged `vscode-nani-adapter-baseline-2026-07-17`.
- The merged temporary branch is deleted locally and nothing is pushed.
