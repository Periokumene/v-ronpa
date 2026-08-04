# Pinp Formal VN Surface

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `ai/pinp-vn-surface`

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-08-04`
- Updated: `2026-08-04`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/pinp-vn-surface.md`

## Goal

Implement `@pinp` as a non-blocking, saveable DOM VN Surface with shared shell
semantics, Game A styling, App-relative image AssetIds, fade transitions, and
cross-script cleanup.

## Context

- Contract authority: `docs/ccr/pinp-vn-surface-save-v10.md`, superseded for
  asset/serialization fields by `docs/ccr/app-relative-asset-protocol-v5.md`.
- Pinp follows cue as a formal Surface outside `RUNTIME_UI_GROUPS`.
- Runtime state remains renderer-independent; resolved URIs and transition
  clocks are excluded from SaveData.

## Constraints

- Pinp must consume the shared AssetId/image-capability policy and must not own
  an independent ID-generation rule.
- Do not add a Pixi pinp path, wait descriptor, public command segmentation
  model, Surface actions, or project-specific state API.
- Preserve unrelated workspace changes and keep save thumbnails Pixi-only.

## Allowed Paths

- `packages/contracts/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `packages/story-engine/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-runtime/**`
- `packages/app-vn-shell/**`
- `packages/ui-kit/**`
- `packages/media-save/**`
- `apps/game-a/**`
- `apps/game-harness/**`
- `tests/smoke/**`
- `scripts/nani-semantic-golden.test.ts`
- `scripts/fixtures/nani-semantic-golden.json`
- `docs/nani/command-catalog.md`
- `docs/ccr/pinp-vn-surface-save-v10.md`
- `docs/tasks/pinp-vn-surface.md`
- `progress.md`

## Forbidden Paths

- `package.json`
- `pnpm-lock.yaml`
- Asset generator naming or ID policy outside command asset collection.
- Existing unrelated files under `temp/**`.

## Contracts

- Implemented `@pinp` command and opaque `assetId` semantics.
- `VN_UI_SURFACE_IDS` includes `pinp`; `RUNTIME_UI_GROUPS` remains unchanged.
- `VnUiCheckpoint.pinp` is a stable object or null.
- Current combined contract: SaveData v11 and App database namespace v13.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Parse and compile pinp | Parser/compiler tests for defaults, opaque IDs, and invalid forms |
| Reduce and transition state | Dispatch tests for show, replace, hide, settle, and no-op |
| Save and restore | Contract/runtime/app adapter tests for v11 and AssetId rehydration |
| Cross-script lifecycle | Runtime coordinator/projection tests |
| Shared and Game A DOM rendering | ui-kit, shell, Game A tests and screenshots |
| Missing or broken images | Runtime diagnostic and Surface placeholder tests |

## Regression Requirements

- Normal path: show a texture with default and custom geometry, then hide it.
- Boundary path: reject invalid geometry/effect and preserve previous state.
- No-op path: hide an empty pinp without changing state.
- Serialization path: save the target terminal state without URI or transition.
- Navigation path: preserve local navigation and clear at script boundaries.
- Visual path: verify Harness default and Game A customized surfaces.

## Dependency Changes

None. Do not edit `package.json` or `pnpm-lock.yaml`.

## Required Gates

```bash
pnpm test
pnpm typecheck
pnpm validate:contracts
pnpm validate:boundaries
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pinp-vn-surface.md
```

## Programmatic Acceptance

- Public schemas and generated script fixtures intentionally reflect the new command.
- Package tests cover one normal and one rejection/no-op path per public behavior.
- Typecheck, contract validation, boundary validation, builds, and smoke pass.

## Manual Acceptance

- Pinp is centered by default, approximately one fifth of playfield height, and
  uses a weak border with fade entry/exit.
- Game A pinp is above dialog/cue and below command bar/choices/blocking overlays.
- Screenshots show the shared and Game A surfaces without input interception.

## Review Packet

- Public contract: implemented App-relative image `@pinp`, formal `pinp` Surface,
  checkpoint object/null semantics, SaveData v11, and App database v13.
- Passed: typecheck; 836 full unit tests; 578 contract tests; command docs,
  assets, boundary, CCR, app/runtime cleanup guards; Game A and Harness builds.
- Passed Pinp browser evidence: Harness default/custom/hide/restore/local decode
  failure and the complete Game A interaction/save/restore smoke when run alone.
- Screenshot evidence:
  `test-results/harness-pinp-default.png`,
  `test-results/harness-pinp-custom.png`,
  `test-results/harness-pinp-restored.png`,
  `test-results/harness-pinp-error.png`, and
  `test-results/game-a-pinp-default.png`.
- Full `pnpm test:smoke` / subsystem smoke stage remains red on three unrelated
  baseline conditions: the unmodified Alice pixel sample receives 41 instead
  of >200; the production test expects absent `draft-home-quarrel.nani` while
  the tracked development source is `home-quarrel.nani`; and the existing Pixi
  active-task assertion stalls only under the two-worker full run but passes
  when the complete Game A smoke is run alone. All 15 other full-run smoke
  cases, including the new Pinp case, pass.
- Pinp delegates AssetId generation to the shared asset project; toast/dialogue
  architecture and Pixi-only save thumbnails remain unchanged.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Revert both governing CCRs atomically. SaveData v9/v10 and database v11/v12 are
intentionally not migrated into current SaveData v11/database v13.

## Done When

- Required tests and gates pass.
- Screenshot evidence is inspected.
- Diff stays within Allowed Paths and retains unrelated workspace changes.
