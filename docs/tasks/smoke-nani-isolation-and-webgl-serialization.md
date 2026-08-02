# Smoke Nani Isolation And WebGL Serialization

## Base Branch

- `integration/v-ronpa-baseline`

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-07-17`
- Updated: `2026-07-17`
- Completed Commit: `TBD`

Concurrency-only supersession: the one-worker policy in this completed task
was replaced after a dedicated backend/concurrency audit by
`playwright-metal-parallel-smoke-optimization.md`. Its product/test Nani
isolation, fresh-server rule, and AUTO/SKIP review item remain current.

## Goal

Hard-separate Game A product Nani from test-only Nani and generated metadata,
make Playwright refuse existing development servers, serialize the current
WebGL smoke suite, and remove the temporarily disabled AUTO/SKIP browser path.

## Constraints

- Product Nani remains under `apps/game-a/src/nani/**`; test-only Nani lives
  under `apps/game-a/src/nani-test/**` and is reachable only through
  `VITE_ENABLE_TEST_ENTRIES=1`.
- No compatibility alias for the old test script path or test launch id.
- AUTO/SKIP unit coverage remains active; only the timing-sensitive browser
  suite is disabled pending a deterministic, independent test entry.
- No contracts, `.nani` IR, dependencies, package manifests, or lockfile changes.

## Allowed Paths

- `apps/game-a/**`
- `apps/game-harness/**`
- `tests/smoke/**`
- `scripts/generate-assets.mjs`
- `scripts/generate-assets.test.ts`
- `scripts/validate-assets.mjs`
- `scripts/validate-game-a-production.mjs`
- `scripts/playwright-config.test.ts`
- `playwright.config.ts`
- `docs/architecture/harness-gates.md`
- `docs/architecture/worktree-flow.md`
- `docs/review-watchlist.md`
- `docs/tasks/smoke-nani-isolation-and-webgl-serialization.md`
- `progress.md`

## Forbidden Paths

- `packages/contracts/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `package.json`
- `pnpm-lock.yaml`

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Product and test Nani are separate | Generator/app tests prove separate source roots, metadata exports, and launch definitions |
| Production output excludes tests | Game A production validation rejects the complete test namespace |
| Existing servers cannot contaminate smoke | Playwright config test requires `reuseExistingServer: false` for every server |
| WebGL pages do not run concurrently | Playwright config test requires one worker |
| AUTO/SKIP browser suite is disabled cleanly | Playwright list excludes it; Harness has no automation branch or voice-smoke hook; review TODO records re-entry criteria |

## Regression Requirements

- Normal: dedicated character test Nani launches and exercises Alice states.
- Boundary: production output contains no test script path, id, or checkpoint.
- No-op: unknown/non-enabled test entry still uses the product launch definition.
- Automation: Playwright lists only the five active smoke scenarios and uses one worker.

## Dependency Changes

None.

## Required Gates

```bash
pnpm vitest run scripts/generate-assets.test.ts scripts/playwright-config.test.ts apps/game-a/src/gameAScripts.test.ts
node scripts/generate-assets.mjs --check
pnpm validate:assets
pnpm typecheck
pnpm validate:boundaries
pnpm --filter @v-ronpa/game-a build
node scripts/validate-game-a-production.mjs
pnpm exec playwright test --list
pnpm exec playwright test tests/smoke/game-a-alice.spec.ts --project=game-a
```

## Review Packet

- Include the active Playwright test list and configuration assertions.
- Include the dedicated Alice test-entry screenshot evidence.
- Keep the AUTO/SKIP browser reintroduction item open in
  `docs/review-watchlist.md` until it has a deterministic clock and independent
  test-only Nani.

Current implementation evidence:

- Product metadata contains only `game-a/opening.nani`; test metadata is
  generated separately from `apps/game-a/src/nani-test/**`.
- The focused generator/config/Game A/Harness suite passes 14 tests.
- Repository tests pass: 64 files and 499 tests; contract validation passes 312 tests.
- Fresh-server, one-worker Playwright lists and passes five active scenarios in
  6.7 minutes. The Harness monolith accounts for 6.1 minutes; the Game A
  scenarios complete in 4.0, 8.3, and 18.5 seconds.
- Game A and Harness production builds, generated assets, asset validation,
  typecheck, boundaries, CCR, app/VN cleanup, and production test-content
  exclusion all pass.
- Headed audit screenshots confirm the dedicated character entry and Alice
  rendering. Alternating WebGL readback loss remains a capture artifact rather
  than runtime state loss and is outside this task's concurrency scope.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting restores the old mixed generated metadata, product-script Alice
smoke path, reusable development servers, concurrent WebGL execution, and the
timing-sensitive AUTO/SKIP browser suite. No save or content migration exists.

## Done When

- Required focused tests and builds pass.
- Browser evidence uses only test-only Nani.
- The review TODO is explicit and the disabled browser path has no runtime
  fixture residue.
