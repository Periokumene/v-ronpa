# Pixi Character Outline Transition Transaction

## Base Branch

- `integration/v-ronpa-baseline`

## Status

- State: `Done`
- Superseded in part by: [`pixi-character-outline-crossfade-opacity.md`](./pixi-character-outline-crossfade-opacity.md) and
  [`pixi-character-crossfade-compositing.md`](./pixi-character-crossfade-compositing.md)

## Dependency Changes

- None.

## Goal

Remove the white-silhouette frame and resource-dependent timing from layered-character token changes by preloading the exact VN-entry expressions, committing character content synchronously, cross-fading ordinary compositions, and applying source-pixel outline filters to complete character compositions.

## Allowed Paths

- `packages/layered-character/**`
- `packages/pixi-presenter/**`
- `packages/app-vn-shell/**`
- `apps/game-a/src/**`
- `apps/game-harness/src/**`
- `scripts/generate-assets.mjs`
- `scripts/generate-assets.test.ts`
- `tools/csp-char-unpack/AUTHORING.md`
- `tools/csp-char-unpack/README.md`
- `tests/smoke/**`
- `docs/architecture/**`
- `docs/ccr/**`
- `docs/tasks/pixi-character-outline-transition-transaction.md`
- `docs/tasks/pixi-layered-character-source-outline.md`
- `progress.md`

## Forbidden Changes

- Do not change `packages/contracts`, `.nani`, saves, ContentManifest shape, AssetRegistry shape, character-pack JSON/PNG, dependencies, package manifests, or lockfiles.
- Do not retain lazy character loading, compatibility aliases, eight-copy silhouettes, per-Sprite outlines, or source-sized render textures.

## Required Behavior

- Generated script metadata contains one deterministic exact character-expression preload plan per VN entry.
- Pixi mount settles pack/metadata/texture validation and GPU upload before stage readiness; failures become cached empty results.
- Runtime character reconciliation is synchronous. Plan misses diagnose and render empty without I/O.
- Token switches cross-fade outgoing/incoming complete compositions; current Filter placement and opacity semantics are owned by the superseding task.
- Game A and Harness gate every VN entry/restore path on the matching stage readiness promise while staying on the initiating surface.

## Regression Cases

- Generator: default/multiple/duplicate/branch/slide/wildcard expressions and stable ordering.
- Presenter: resource dedupe/GPU prepare, strict failure and plan-miss behavior, enabled/disabled topology, cross-fade settlement, transform-aware source texel, rapid supersession, clear/destroy safety, and texture ownership.
- Browser: delayed Game A character resources cannot consume presentation time; Alice and Ema never expose a white-only character frame and retain seam-free final outlines.

## Required Gates

```bash
node scripts/generate-assets.mjs --check
pnpm typecheck
pnpm test
pnpm validate:assets
pnpm validate:contracts
pnpm validate:boundaries
pnpm validate:ccr
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-character-outline-transition-transaction.md
```

## Done When

- Required regressions and gates pass, visual evidence is inspected, and no forbidden payload or dependency file changes.
