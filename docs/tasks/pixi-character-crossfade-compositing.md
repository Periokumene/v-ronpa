# Pixi Character Crossfade Compositing

## Base Branch

- `integration/v-ronpa-baseline`

## Status

- State: `Done`

## Dependency Changes

- None.

## Goal

Remove the remaining semi-transparent pulse and apparent edge jitter during layered-character token changes by replacing
ordinary sibling source-over blending with an isolated premultiplied-RGBA crossfade, without changing source-pixel outline,
preload, timing, app, contract, or character-pack interfaces.

## Context

The preceding outline-opacity change correctly applies animation opacity after each complete composition has produced its
color and white shell. Its two weighted branch outputs were still composited with ordinary source-over, however. For two
perfectly aligned opaque pixels weighted `1-t` and `t`, that produces alpha `1-t(1-t)` and therefore falls to `0.75` at the
transition midpoint. Expression geometry differences make the same opacity loss look like alignment jitter.

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
- `docs/tasks/pixi-layered-character-source-outline.md`
- `docs/tasks/pixi-character-outline-transition-transaction.md`
- `docs/tasks/pixi-character-outline-crossfade-opacity.md`
- `docs/tasks/pixi-character-crossfade-compositing.md`
- `progress.md`

## Forbidden Changes

- Do not change contracts, `.nani`, generated assets, app interfaces, saves, manifests, registries, character packs,
  dependencies, package manifests, or lockfiles.
- Do not add source-sized render textures, direct additive blending against the stage, per-Sprite outlines, layer-diff
  transitions, compatibility paths, or runtime fallback behavior.

## Required Behavior

- Stable outlined rendering remains one complete composition and one outline Filter; no isolation pass is active.
- A token transition finalizes outgoing and incoming as independent premultiplied branch outputs, weights them by `1-t` and
  `t`, adds them only inside one transparent screen-bounds isolation target, then composites that result normally to the
  actor scene.
- Identical opaque coverage remains alpha `1` for the whole transition. Outgoing-only and incoming-only coverage follows
  `1-t` and `t` respectively.
- Outline-disabled transitions use temporary whole-composition opacity Filters and the same isolated mixer; ordinary
  multi-layer container alpha is not a second compositing implementation.
- The isolation Filter is lazily reused per presentation, detached outside transitions, and destroyed with its actor.
- Skip, rapid replacement, resize, actor alpha, clear, and destroy preserve deterministic settlement and texture ownership.

## Regression Cases

- Normal: enabled transition owns two final branch Filters plus one isolated mixer with `normal`/`add` branch output modes.
- Boundary: exact progress checkpoints `0/0.25/0.5/0.75/1` preserve shared opaque alpha and linearly fade exclusive alpha.
- Alignment: an unchanged layer shares its Texture and world matrix across outgoing and incoming compositions.
- Disabled: transition uses temporary final-output Filters and returns to a filter-free stable state at opacity `1`.
- Lifecycle: rapid replacement reuses the isolation Filter; settle detaches it; actor destruction releases it once without
  destroying Assets-owned textures.
- Browser: Game A Alice transition and multilayer endpoints retain colored interiors, final outlines, placement, and zero
  asset diagnostics.

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
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-character-crossfade-compositing.md
```

## Done When

- Required regressions and gates pass, visual evidence is inspected, and forbidden files remain unchanged by this task.
