# CSP Character Authoring v2 And Alice Hard Cut

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/csp-character-v2-alice-hard-cut`

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-07-27`
- Updated: `2026-07-27`

## Goal

Make CSP authoring v2 the sole authoritative import contract, replace production `alice` with the new adult design, import
the prior design as `alice-kid`, and hard-cut Game A scripts and tests to the new lower-camel vocabulary.

## Constraints

- Do not change `packages/contracts`, `.nani` IR, dependencies, `package.json`, or `pnpm-lock.yaml`.
- Do not add a v1 compatibility layer, migration aliases, save migration, Git LFS source, or tracked import receipt.
- Keep source clips and immutable runs inside ignored `tools/csp-char-unpack/workspace/`.
- `alice-kid` is indexed and statically validated but is not referenced by production Nani or browser smoke.
- App asset promotion is an exact replacement boundary using accepted immutable runs.

## Allowed Paths

- `tools/csp-char-unpack/**`
- `apps/game-a/public/game-a/characters/alice/**`
- `apps/game-a/public/game-a/characters/alice-kid/**`
- `apps/game-a/src/nani/**`
- `apps/game-a/src/nani-test/**`
- `apps/game-a/src/generatedAssets.ts`
- `apps/game-a/src/generatedTestScripts.ts`
- `apps/game-a/src/contentManifest.test.ts`
- `apps/game-a/src/devtools/gameACandidateStory.test.ts`
- `scripts/validate-assets.mjs`
- `scripts/validate-assets-character-source-pixel.test.ts`
- `scripts/nani-semantic-golden.test.ts`
- `scripts/fixtures/nani-semantic-golden.json`
- `tests/smoke/game-a-alice.spec.ts`
- `tools/vscode-nani/**`
- `docs/tasks/csp-character-v2-alice-hard-cut.md`

## Forbidden Paths

- `packages/contracts/**`
- `packages/nani-parser/src/types/**`
- `package.json`
- `pnpm-lock.yaml`

## Contracts

- Tool preset v2, `AUTHORING.md`, the tool validator, and tool regression tests jointly define the public authoring
  contract.
- Existing layered-character schemas and resolver semantics remain unchanged.
- `gameAVnEntry.assetRefs` continues to reference only production `alice`.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Fixed `/root`, flat groups, body/effect ordering, numeric variants, visibility rules | Tool unit rejection tests |
| Lower-camel token generation and resolver-valid default | Tool unit tests and both pack validators |
| Exact body anchor and 700/100 render defaults | Tool unit tests and generated `character.json` |
| Per-group variant coverage including effect | QA sheet tests and accepted run `qa-metrics.json` |
| Kid is an exact renamed/repositioned old Alice | 25-sprite RGBA comparison report during review |
| Adult production expressions resolve without diagnostics | Asset generation, validation, unit tests, and browser smoke |
| Kid is indexed but not production-preloaded | Content manifest unit test and generated preload plan |
| Crossfade and outline remain visually stable | Playwright checkpoints and screenshots |

## Regression Requirements

- Normal: body-only and extensible groups; optional effect; source-order draw order; exact anchor/render overrides.
- Rejection: missing/wrong root, invalid body, order violations, nesting, invalid names/variants/default visibility, collisions,
  boundary properties, invalid source-pixel scale, and removed CLI options.
- Lifecycle: required character ID, immutable successful/failed runs, list, dry-run/apply prune, preserved source archive.
- Project: real adult and kid packs resolve; production preload excludes kid; VS Code real-pack completion/preview follows
  the lower-camel vocabulary while generic uppercase fixtures remain valid.
- Browser: adult default, face-only, one-arm, two-arm, and final combinations render; crossfade has no white pulse, color
  pulse, seam, clipping, or missing HMR textures.

## Dependency Changes

None.

## CCR Triggers

No CCR is required because schemas and `.nani` IR do not change. Stop if implementation requires either.

## Required Gates

```bash
cd tools/csp-char-unpack
uv run ruff check .
uv run pytest
node scripts/validate-vronpa-pack.mjs <alice-pack>
node scripts/validate-vronpa-pack.mjs <alice-kid-pack>

cd ../..
pnpm generate:assets
pnpm validate:assets
pnpm typecheck
pnpm test
pnpm --filter @v-ronpa/game-a build
pnpm exec playwright test tests/smoke/game-a-alice.spec.ts --project=game-a-character --workers=1
pnpm validate:boundaries
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/csp-character-v2-alice-hard-cut.md
```

## Manual Acceptance

- Inspect default contact sheets and all adult/kid variant sheets for face alignment, arm occlusion, effect coverage, and
  transparent/cropped edges.
- Inspect browser screenshots for default and multi-layer states at final stage scale and anchor.
- Confirm `alice/assets/layers/MAIN/**` and all old uppercase Alice tokens/effect references are absent.
- Confirm `alice-kid` is discoverable but absent from the production preload plan.

## Review Packet

- Accepted adult run:
  `tools/csp-char-unpack/workspace/outputs/alice/20260726T171103836121Z-fa8d76e2aae3`
  (`fa8d76e2aae3c9633d36175929aa17179761b9221e13c9412b45934ba297a56a`).
- Accepted kid run:
  `tools/csp-char-unpack/workspace/outputs/alice-kid/20260726T171119850780Z-af7c6f7a01f3`
  (`af7c6f7a01f34a2045167dbd02530981d4b02bbaf15441d1475a051b1f8db843`).
- Kid comparison: all 25 mapped sprites are exact RGBA matches to the replaced pack; canvas placement delta is
  `(+100,+400)`.
- Browser evidence:
  - `test-results/game-a-alice-outline-default.png`
  - `test-results/game-a-alice-outline-multilayer.png`
  - `test-results/game-a-alice-transition-first-frame.png`
  - `test-results/game-a-alice-transition-mid-frame.png`
  - `test-results/game-a-alice-transition-end-frame.png`
- Browser command uses the repository's dedicated `game-a-character` Playwright project; `game-a` is intentionally bound
  only to `game-a-vn.spec.ts`.

## Rollback Notes

Reverting restores the old production Alice pack and script revision. Saves from either side of this hard cut are not
migrated and may fail revision validation by design.

## Done When

- Both locked source hashes build to accepted v2 runs and the kid pixel comparison is exact.
- Application assets are exact mirrors of those runs.
- Generated assets, script revision, and preload plan are current.
- Required static, unit, build, browser, boundary, and subsystem gates pass with screenshot evidence.
