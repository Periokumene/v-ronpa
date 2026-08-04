# Playwright Metal Parallel Smoke Optimization

## Base Branch

- `integration/v-ronpa-baseline`

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-07-17`
- Updated: `2026-07-17`
- Completed Commit: `TBD`

## Goal

Remove the dominant Harness smoke bottlenecks without weakening behavioral or
visual coverage: select hardware Metal on macOS, pause hidden render loops,
split the monolithic Harness scenario, qualify two-worker execution, and keep
a safe one-worker fallback for unqualified WebGL backends.

## Context

- SwiftShader made the always-running hidden R3F canvas consume roughly seven
  CPU cores; ANGLE Metal reduced the observed GPU-process load to a small
  fraction of that value.
- The prior Harness monolith replayed Navi and the VN entry before reaching its
  second branch and took several minutes with trace recording.
- Two concurrent Metal-backed Harness instances completed three repeated runs
  without renderer or business failures. The only observed failures were the
  now-removed favicon 404 console errors.
- Alternating black previews were reproduced with byte-identical PNG files and
  pure DOM screenshots, so they belong to the image-viewing path rather than
  source assets, WebGL readback, or smoke concurrency.

## Constraints

- Preserve fresh development servers and the product/test Nani separation.
- AUTO/SKIP browser coverage remains disabled and tracked in the review
  watchlist; this task does not recreate it in the general Harness script.
- Keep state assertions and at least one screenshot for each distinct WebGL
  rendering path. Only unasserted screenshots that duplicate the same shader
  path at scalar intensity variants may be removed.
- No contract, `.nani` IR, package manifest, lockfile, or dependency changes.

## Allowed Paths

- `apps/game-a/**`
- `apps/game-harness/**`
- `packages/app-vn-shell/**`
- `packages/pixi-presenter/**`
- `packages/r3f-adapter/**`
- `tests/smoke/**`
- `scripts/playwright-config.test.ts`
- `scripts/generate-assets.mjs`
- `scripts/generate-assets.test.ts`
- `scripts/validate-assets.mjs`
- `scripts/validate-game-a-production.mjs`
- `playwright.config.ts`
- `docs/architecture/harness-gates.md`
- `docs/architecture/worktree-flow.md`
- `docs/review-watchlist.md`
- `docs/tasks/playwright-metal-parallel-smoke-optimization.md`
- `docs/tasks/smoke-nani-isolation-and-webgl-serialization.md`

## Forbidden Paths

- `packages/contracts/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `package.json`
- `pnpm-lock.yaml`

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Qualified hardware backend | Config test requires `--use-angle=metal` on macOS |
| Safe cross-platform concurrency | Config test requires two macOS workers and a one-worker fallback elsewhere |
| Hidden R3F does not burn continuous frames | Unit helper plus smoke `data-r3f-rendering=paused` outside interactive Navi |
| Hidden Pixi does not tick continuously | Presenter lifecycle unit test plus smoke `data-pixi-rendering=paused` |
| Harness failures are isolated | Independent Navi/Trial, VN/save-load, and Pixi specs can run separately |
| Visual coverage remains meaningful | Representative Navi, Trial, VN, weather, filter, character, and cleanup screenshots plus the rain-motion pixel assertion |
| Server/config contamination is absent | Existing config test retains `reuseExistingServer: false` |

## Regression Requirements

- Normal: R3F active and Pixi paused in Navi; the inverse is true in VN.
- Boundary: initial title state pauses both renderers, and destroyed Pixi ignores
  later activation.
- No-op: switching Pixi activity does not remount or discard prepared assets.
- Automation: run the split Harness specs together with two workers and repeat
  the renderer-heavy subset concurrently.

## Dependency Changes

None.

## Required Gates

```bash
pnpm exec vitest run scripts/playwright-config.test.ts packages/r3f-adapter/src/stages.test.ts packages/pixi-presenter/src/index.test.ts
pnpm typecheck
pnpm test
pnpm validate:assets
pnpm validate:contracts
pnpm validate:boundaries
pnpm validate:ccr
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm exec playwright test --headed
pnpm exec playwright test tests/smoke/harness-pixi.spec.ts tests/smoke/game-a-vn.spec.ts --headed --repeat-each=3
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/playwright-metal-parallel-smoke-optimization.md
```

## Screenshot Reduction Rationale

The former monolith wrote about forty full-page screenshots. Most were not
snapshot-compared and repeated the same renderer at different intensity
parameters. Those files were redundant because every checkpoint still has DOM
state assertions, exact character-token assertions remain intact, and the
kept screenshots cover every distinct renderer/effect class. The two in-memory
rain frames remain because they are the only screenshots used by a programmatic
motion assertion. The reduced suite keeps representative Navi, Trial, VN,
rain, snow, sun/blur, inner-background, layered-character, atom override,
glitch persistence/composition, weather coexistence, and final cleanup images.

## Merge Target

- `integration/v-ronpa-baseline`

## Review Packet

- Full `pnpm validate:baseline` passed on the final worktree: 503 repository tests, 312 contract
  subset tests, all validation/cleanup gates, both production builds, and seven
  Playwright smoke tests.
- Default headless Metal smoke completed seven tests with two workers in 33.5
  seconds; the Pixi visual flow took 26.5 seconds.
- The renderer-heavy Pixi flow and Game A VN flow passed three repetitions each
  with two workers (six tests in 55.2 seconds). Two Pixi instances overlapped
  without WebGL failures.
- Representative screenshots are under `test-results/harness-navigation-*.png`,
  `test-results/harness-vn-choice.png`, and `test-results/harness-pixi-*.png`.
- The first standalone production-content check was intentionally discarded:
  it was invoked before Vite had replaced TypeScript's incremental `dist`.
  The correctly ordered Game A production build and its embedded content check
  passed; no validator weakening or compatibility behavior was added.

## Rollback Notes

No data migration exists. Reverting restores continuous hidden rendering,
serial smoke, the monolithic Harness replay, and default trace capture.

## Done When

- Unit, type, build, validation, full smoke, and repeated two-worker gates pass.
- Screenshot evidence is inspectable and distinct renderer paths remain covered.
- `package.json`, `pnpm-lock.yaml`, contracts, and `.nani` IR are unchanged.
