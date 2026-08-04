# Pixi Character Outline Crossfade Opacity

> Superseded in part by [`pixi-character-crossfade-compositing.md`](./pixi-character-crossfade-compositing.md). Full-coverage
> outline generation and post-outline opacity remain current; ordinary source-over branch composition and the filter-free
> disabled transition are historical.

## Base Branch

- `integration/v-ronpa-baseline`

## Status

- State: `Done`

## Dependency Changes

- None.

## Goal

Remove the remaining white/desaturated fade during layered-character token transitions by separating source coverage alpha
from animation opacity, while preserving exact final-composition one-source-pixel outlines and deterministic transition
timing.

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
- `docs/tasks/pixi-character-outline-crossfade-opacity.md`
- `progress.md`

## Forbidden Changes

- Do not change contracts, `.nani`, generated assets, app interfaces, saves, ContentManifest, AssetRegistry, character packs,
  dependencies, package manifests, or lockfiles.
- Do not add per-Sprite outlines, independent silhouettes, source-sized render textures, alpha-mask reconstruction,
  compatibility branches, or runtime fallback behavior.

## Required Behavior

- Every outlined composition is sampled at full source coverage and applies actor/content opacity only to final Filter output.
- Stable state owns one composition Filter; a token transition owns at most two, sharing one GlProgram.
- Historical disabled mode used the same scheduler with no Filter; its transition topology is superseded by
  `pixi-character-crossfade-compositing.md`.
- Skip, rapid replacement, resize, actor alpha, clear, and destroy preserve existing deterministic lifecycle semantics.

## Regression Cases

- Unit: Filter topology, output-opacity shader order, actor/content opacity, crossfade midpoint, shared program, outgoing
  cleanup, disabled topology, source-texel transform, skip, and rapid replacement.
- Browser: Alice token transition checkpoints retain colored interiors and final outlines without a white fading figure.

## Required Gates

```bash
pnpm typecheck
pnpm test
pnpm validate:assets
pnpm validate:contracts
pnpm validate:boundaries
pnpm validate:ccr
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm exec playwright test tests/smoke/game-a-alice.spec.ts --project=game-a --workers=1
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-character-outline-crossfade-opacity.md
```

## Done When

- Required regressions and gates pass, visual evidence is inspected, and forbidden files remain unchanged.
