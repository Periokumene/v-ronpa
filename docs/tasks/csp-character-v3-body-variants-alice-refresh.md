# CSP Character Authoring v3 Body Variants And Alice Refresh

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/csp-character-v3-body-variants-alice-refresh`

## Status

- State: `Review`
- Owner: `Codex`
- Created: `2026-07-27`
- Updated: `2026-07-27`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/csp-character-v3-body-variants-alice-refresh.md`

## Goal

Make numeric `body/0..N` variants the sole CSP authoring contract, refresh both Alice packs from the accepted v3 sources,
and prove that the shared layered-character runtime needs no body-specific implementation.

## Context

- CSP authoring v2 and the Alice hard cut landed in `b8ef08d`.
- The new sources preserve every existing sprite pixel while moving body drawing layers into `/root/body/0`.
- The shared resolver already replaces any single-choice group through its normal `>` operation.

## Constraints

- Do not add compatibility for the v2 direct-leaf body.
- Do not modify `packages/contracts`, layered-character/Pixi runtime implementation, `.nani` IR, dependencies, production
  Nani, `package.json`, or `pnpm-lock.yaml`.
- Keep source clips and immutable runs in ignored `tools/csp-char-unpack/workspace/`.
- Keep `alice-kid` indexed and statically validated but outside production Nani, preload, and browser smoke.

## Allowed Paths

- `tools/csp-char-unpack/**`
- `apps/game-a/assets/char/alice/**`
- `apps/game-a/assets/char/alice-kid/**`
- `apps/game-a/src/nani-test/character-smoke.nani`
- `apps/game-a/src/generatedTestScripts.ts`
- `scripts/nani-semantic-golden.test.ts`
- `scripts/fixtures/nani-semantic-golden.json`
- `tests/smoke/game-a-alice.spec.ts`
- `tools/vscode-nani/**`
- `docs/tasks/csp-character-v3-body-variants-alice-refresh.md`

## Forbidden Paths

- `packages/contracts/**`
- `packages/layered-character/src/**`
- `packages/pixi-presenter/src/**`
- `apps/game-a/src/nani/**`
- `package.json`
- `pnpm-lock.yaml`

## Contracts

- Tool preset v3, `AUTHORING.md`, validation, and tool regression tests define the public authoring contract.
- `/root/body` is the required backmost numeric group; `body/0` is required, visible, non-transparent, and anchors the
  character.
- Generated body layers use `root/body>0..N` and tokens `body0..bodyN`; only effect receives an off token.
- Existing layered-character schemas and generic resolver semantics remain unchanged.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Strict numeric body contract without v2 fallback | Tool normal/rejection unit tests |
| `body0` default, token, path, anchor, and QA sheet | Tool tests, accepted manifests, generated packs, QA metrics |
| Pixel-stable Alice refresh | 26/26 adult and 25/25 Kid decoded RGBA comparisons |
| Generic runtime compatibility | Pack validator, asset validation, VS Code real-pack preview, browser smoke |
| Production content remains implicit and stable | Unchanged production Nani/revisions/preload plan |
| Explicit authoring works | Test Nani checkpoint and Playwright expression assertion |

## Regression Requirements

- Normal: body-only, body `0..N`, body0 anchor, body QA sheet, mechanical body tokens, effect behavior.
- Rejection: missing/hidden/transparent body0, invalid numbering/visibility, nested body leaf, legacy or mixed direct body
  drawables.
- Unchanged behavior: CLI/lifecycle, source archive, failed-run isolation, other groups, effect off, source-pixel scale.
- Integration: real Alice default and explicit body0 preview, completion discovery, generated test revision/preload, browser
  transitions, HMR preparation, and zero asset diagnostics.

## Dependency Changes

None.

## CCR Triggers

Stop if implementation requires a shared schema, `.nani` IR, runtime API, or dependency change. This task does not require
a CCR.

## Required Gates

```bash
cd tools/csp-char-unpack
uv run ruff check .
uv run pytest
node scripts/validate-vronpa-pack.mjs <alice-v3-pack>
node scripts/validate-vronpa-pack.mjs <alice-kid-v3-pack>

cd ../..
pnpm generate:assets
pnpm validate:assets
pnpm typecheck
pnpm test
pnpm --filter @v-ronpa/game-a build
pnpm exec playwright test tests/smoke/game-a-alice.spec.ts --project=game-a-character --workers=1
pnpm validate:boundaries
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- \
  --task docs/tasks/csp-character-v3-body-variants-alice-refresh.md
```

## Programmatic Acceptance

- Adult pack: 1000×1400, 26 sprites, 5 groups, 28 tokens, stage scale `0.5`, anchor `[500,185]`.
- Kid pack: 1000×1400, 25 sprites, 6 groups, 28 tokens, stage scale `0.5`, anchor `[500,155]`.
- Both packs resolve empty appearance and `body0` without diagnostics and use source-pixel scale 1.
- Old `root/body.png|json` files and `root>body` references are absent.
- Production script revisions and preload expressions remain unchanged; only the test character script explicitly adds
  `body0`.

## Manual Acceptance

- Inspect both contact sheets and every variant sheet for alignment, occlusion, effects, and cropped transparent edges.
- Inspect Playwright default/multilayer and transition screenshots for clipping, white/color pulses, and outline seams.
- Confirm `alice-kid` remains outside the production preload plan.

## Review Packet

- Locked adult source:
  `4efd74bfa901af35c2283347259ac46917afd93bcb386c86cc19140cb5989abc`.
- Locked Kid source:
  `b5183ce13635092061818aae3f5735fbed83dbdd0d939e42dfcd5b4c36fcf8f0`.
- Accepted adult run:
  `tools/csp-char-unpack/workspace/outputs/alice/20260727T154231085715Z-4efd74bfa901`.
- Accepted Kid run:
  `tools/csp-char-unpack/workspace/outputs/alice-kid/20260727T154231169885Z-b5183ce13635`.
- RGBA comparison: adult 26/26 and Kid 25/25 sprites exactly match the replaced v2 packs; body maps from
  `root>body` to `root/body>0`.
- QA review: both contact sheets and every body, face, arm, and effect sheet passed visual inspection. The descriptive PSD
  root/default diff metrics exactly match the accepted v2 runs.
- Regression evidence: tool ruff and 41 tests, VS Code Nani 103 tests, repository 731 tests, typecheck, asset validation,
  Game A production build, boundaries, and subsystem validation passed.
- Browser evidence: full subsystem smoke passed 12/12; the dedicated Alice project passed 3/3 including planned texture
  upload, explicit `body0`, transition stability, and HMR four-texture preparation.
- Screenshots:
  - `test-results/game-a-alice-outline-default.png`
  - `test-results/game-a-alice-outline-multilayer.png`
  - `test-results/game-a-alice-transition-first-frame.png`
  - `test-results/game-a-alice-transition-mid-frame.png`
  - `test-results/game-a-alice-transition-end-frame.png`
- Residual risk: future body variants share the one anchor derived from body0 and must preserve intended alignment in CSP
  canvas coordinates; their generated body QA sheet is the review surface.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting restores the v2 direct-leaf body packs and removes `body0`. Production Nani remains valid on both sides because
it relies on the pack default; the test script revision changes and is not migrated.

## Done When

- Both locked sources build as accepted v3 runs and exact RGBA comparisons pass.
- App assets exactly mirror the accepted runs.
- Tool, project, build, browser, boundary, and subsystem gates pass with screenshot evidence.
- Diff stays inside this task card and no shared runtime or contract implementation changes.
