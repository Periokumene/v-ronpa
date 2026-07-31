# Game A Title Surface

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/game-a-title-surface`

## Worktree Environment

Run `pnpm setup:worktree-env`; do not commit generated environment or Playwright output.

## Thread Startup Prompt

Implement this card without changing public contracts, dependencies, or product Nani. Preserve unrelated working-tree edits.

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-08-01`
- Updated: `2026-08-01`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/game-a-title-surface.md`

## Goal

Replace the placeholder Game A title panel with the supplied 1280x720 Daydream Parade title art and a stable six-entry DOM menu that preserves the existing start, load, and settings flows.

## Context

- The accepted source image is `/Users/periokumene/Downloads/vn-0.png` with SHA-256 `a417e172122a3521e466a6fef01a57459704a7bed6351380bd720759ce9c5f44`.
- The image already contains the final title logo, character, and scene; it must be copied unchanged as `backgrounds/title.png`.
- Game A already owns the Fusion Pixel font, title surface slot, AssetRegistry, capability model, and UI hover/click audio delegation.

## Constraints

- Preserve the full 16:9 source composition with black letterboxing on other aspect ratios.
- Use semantic DOM buttons and the existing Game A pixel font; do not recreate the logo or art in HTML/CSS.
- Keep `new-game`, `open-load`, and `open-settings` behavior unchanged.
- Gallery, media, and exit are focusable visual entry points only and must not dispatch actions or alter game state.
- Keep the menu label position fixed when the hover/focus `>` prefix appears.
- Do not add dependencies, routes, public UI actions, contracts, or Nani changes.

## Allowed Paths

- `apps/game-a/public/game-a/backgrounds/title.png`
- `apps/game-a/src/generatedAssets.ts`
- `apps/game-a/src/contentManifest.ts`
- `apps/game-a/src/contentManifest.test.ts`
- `apps/game-a/src/ui/**`
- `tests/smoke/game-a-alice.spec.ts`
- `docs/tasks/game-a-title-surface.md`

## Forbidden Paths

- `packages/contracts/**`
- `packages/app-vn-shell/**`
- `packages/ui-kit/**`
- `apps/game-harness/**`
- `apps/game-a/src/nani/**`
- `package.json`
- `pnpm-lock.yaml`

## Contracts

- Honor the existing `TitleViewModel`, `TitleActions`, `GameUiAction`, and `InteractionCapabilitySnapshot` without extension.
- Resolve the title image through the one app-owned ContentManifest and AssetRegistry.
- Retain existing title test IDs and add only app-local IDs for the three placeholders.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Canonical title image resolution | Manifest and Game A UI asset resolver tests |
| Six-entry title menu | Game A surface unit tests |
| Existing title actions | Unit dispatch assertions |
| Placeholder no-op behavior | Unit assertions that no action is dispatched |
| Missing-image resilience | Resolver diagnostic and renderable black fallback unit case |

## Regression Requirements

Required regression cases:

- Normal path: resolved title art renders with six labels in the specified order; start, load, and settings dispatch their existing actions.
- Boundary path: a missing title asset reports a diagnostic while the title menu remains renderable on black.
- Loading path: start remains labelled `开始故事`, is disabled, and exposes busy state while VN presentation is preparing.
- No-op path: gallery, media, and exit clicks do not dispatch or leave title mode.

Test placement:

- App unit/component tests: `apps/game-a/src/ui/GameASurfaces.test.tsx`
- Manifest tests: `apps/game-a/src/contentManifest.test.ts`

## Dependency Changes

None. Do not edit `package.json` or `pnpm-lock.yaml`.

## CCR Triggers

- A new shared `GameUiAction`, Title shell field, or manifest schema becomes necessary.
- The allowed paths cannot provide complete behavior regression coverage.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm generate:assets
pnpm vitest run apps/game-a/src/contentManifest.test.ts apps/game-a/src/ui/GameASurfaces.test.tsx
pnpm validate:assets
pnpm typecheck
pnpm validate:boundaries
pnpm --filter @v-ronpa/game-a build
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/game-a-title-surface.md
pnpm validate:baseline
```

## Programmatic Acceptance

- The focused unit tests cover every regression case above.
- Generated assets are fresh and `bg:title` resolves to `/game-a/backgrounds/title.png`.
- Typecheck, asset/boundary validation, Game A build, subsystem, and baseline gates pass.

## Product-Owner Tuning

Title typography, placement, spacing, and motion are tuned with the product
owner in the live preview. This is not a task gate and adds no persistent test
or evidence requirement.

## Review Packet

- Added the unchanged 1280×720 title image, registered `bg:title`, resolved it through the app-owned registry, and replaced the placeholder title panel with the six-entry DOM menu.
- Source and copied asset share SHA-256 `a417e172122a3521e466a6fef01a57459704a7bed6351380bd720759ce9c5f44`.
- Passed before the final human-tuning pass: focused UI/manifest Vitest (25), full Vitest (749), asset validation, typecheck, boundary validation, task-boundary validation, and Game A production build/content validation.
- Title tuning remains human-in-the-loop and non-gating by product-owner decision.
- Title transitions remain authored and unconditional; the title CSS does not add a `prefers-reduced-motion` branch.
- Residual product scope is intentional: gallery, media, and exit remain visual-only entry points.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Revert the app-local title asset/config/resolver/surface/CSS/test changes and regenerate assets. No save migration, contract rollback, or Nani cleanup is required.

## Done When

- Tests and required gates pass.
- Diff stays within the allowed paths and preserves unrelated edits.
