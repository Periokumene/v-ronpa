# Pixi Layered Character Source-Pixel Outline

## Base Branch

- `integration/v-ronpa-baseline`

## Status

- State: `Done`

## Dependency Changes

- None.

## Goal

Render a fixed white 8-neighbor one-source-texel outline around each final composed Pixi layered character. Keep the source-pixel rule derived from existing layer metadata, avoid source-sized render textures, and make enablement an explicit app-owned choice.

## Allowed Paths

- `packages/layered-character/**`
- `packages/pixi-presenter/**`
- `packages/app-vn-shell/**`
- `apps/game-a/src/**`
- `apps/game-harness/src/**`
- `scripts/validate-assets.mjs`
- `scripts/validate-assets-character-source-pixel.test.ts`
- `tools/csp-char-unpack/**`
- `tests/smoke/**`
- `docs/architecture/**`
- `docs/ccr/**`
- `docs/tasks/pixi-layered-character-source-outline.md`
- `progress.md`

## Forbidden Changes

- Do not change `packages/contracts`, `.nani` IR or story scripts, saves, ContentManifest shape, or character-pack JSON/PNG payloads.
- Do not add compatibility fields, conversion layers, best-effort unoutlined fallback, dependencies, or source-resolution RenderTextures.
- Keep `package.json` and `pnpm-lock.yaml` unchanged.

## Forbidden Paths

- `packages/contracts/**`
- `apps/game-a/src/**/*.nani`
- `apps/game-harness/src/**/*.nani`
- `package.json`
- `pnpm-lock.yaml`

## Required Behavior

- Derive one square pack-wide source-pixel unit from `abs(localTransform.scale.x) / pixelsPerUnit`, with X/Y and cross-layer relative tolerance `1e-6`.
- Build eight shifted copies of the complete active composition, whiten their combined alpha once, and draw the unmodified composition above it.
- Require `characterOutlineEnabled` through presenter, shell, and app call sites; Game A and Harness both pass `true`.
- Invalid non-empty packs fail validation and render empty with `asset-invalid-character-source-pixel-scale`; empty resolved expressions stay empty without a diagnostic.
- Preserve active-only metadata/texture loading and atomic content replacement.

## Regression Cases

- Source-pixel resolver: Alice/Ema densities, negative scale, zero scale, non-square pixels, cross-layer mismatch, tolerance boundary.
- Presenter: enabled/disabled structure, eight offsets, shared textures, final-group-only filter, resize scaling, atomic replacement, invalid-pack diagnostic, lifecycle cleanup.
- Asset/CSP validation: both shipped packs pass; invalid scale fixtures fail; CSP-generated metadata resolves to one unit per pixel.
- Browser: Game A Alice and Harness Ema show the white final-composition outline without internal seams; both expose the enabled state and no asset diagnostics.

## Required Gates

```bash
cd tools/csp-char-unpack && uv run ruff check . && uv run pytest
pnpm typecheck
pnpm test
pnpm validate:assets
pnpm validate:contracts
pnpm validate:boundaries
pnpm validate:ccr
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/pixi-layered-character-source-outline.md
```

## Manual Acceptance

- Inspect Alice default and multi-layer states plus Ema default and `Pensive1,ArmR3` screenshots.
- Confirm the outline follows the final alpha, contains no body/face/arm seams, and does not alter actor placement or size.
- Confirm the character path does not call `RenderTexture.create` or `generateTexture`.

## Rollback Notes

Reverting this task requires no save migration, character-pack conversion, or generated asset cleanup because runtime content payloads remain unchanged.

## Done When

- All required regression cases and gates pass.
- Visual evidence has been opened and reviewed.
- The diff stays within allowed paths and contains no package or lockfile changes.
