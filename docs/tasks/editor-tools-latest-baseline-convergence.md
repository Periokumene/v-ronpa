# Editor Tools Latest Baseline Convergence

## Base Branch

- `integration/v-ronpa-baseline`
- Pinned base commit: `a7bb0091234f7796df3db93a7bfe3f0ae948e300`
- Preserved pre-rebase tip: `a787a565aaa5e3adab48d17d61bf3c826326c20d`
- Preserved pre-rebase tree: `00b5658a3b3bb235cb39a5b48b34c91be3b9565a`

## Branch Name

- `codex/editor-tools`
- Temporary reconstruction branch: `codex/editor-tools-rebase-work`
- Local recovery ref: `backup/editor-tools-pre-rebase-20260718`

## Status

- State: `Ready`
- Owner: `Codex`
- Created: `2026-07-18`
- Updated: `2026-07-18`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/editor-tools-latest-baseline-convergence.md`

## Goal

Reconstruct `codex/editor-tools` as a direct linear descendant of the pinned
latest local baseline while preserving the accepted Nani debug workbench tree,
then perform an explicit semantic convergence audit across code, tests,
documentation, generated outputs, and cleanup guards.

## Context

- `docs/tasks/nani-debug-workbench-hard-upgrade.md`
- `docs/ccr/vn-runtime-debug-boundary-hard-cut.md`
- `docs/architecture/vn-devtools.md`
- `docs/architecture/worktree-flow.md`
- `AGENTS.md`

The current editor-tools tree already contains the latest baseline through merge
commit `3001389`, but its feature history begins at the older remote baseline
`67a1c5d`. The old merge had 24 overlapping paths and 13 explicit conflict
paths. Replaying the pre-merge commits would reintroduce obsolete intermediate
assumptions, so this task uses a tree-preserving transplant followed by a
separately reviewable convergence phase.

## Constraints

- Resolve integration by functional intent, architecture boundaries, and one
  authority, never by conflict-marker removal or line-level concatenation alone.
- Do not lose accepted Editor Tools behavior, resurrect anything removed by the
  latest baseline, or duplicate an implementation already owned by the baseline.
- Do not introduce dual entries, revisions, materializers, test launch paths,
  compatibility forwarding, or old/new runtime ports in parallel.
- Review every convergence change across code, tests, documentation, generated
  outputs, and cleanup guards.
- Generated files must come from their final authoritative generator; do not
  hand-edit generated conflict results.
- The accepted workbench task and runtime debug-boundary CCR remain authoritative.
- Do not use `git rebase --onto a7bb009 67a1c5d`; that range replays baseline
  commits as feature work.
- Keep the result local. Do not push or force-push any ref.

## Execution-Time Convergence Authorization

This task explicitly authorizes additional conflict analysis and the smallest
necessary code, test, documentation, generated-output, or cleanup-guard changes
discovered during reconstruction or verification when they are required to
prevent content loss, removal resurrection, duplicate wiring, multiple
authorities, behavior drift, or documentation drift.

Before making each such change, add a Conflict And Convergence Ledger entry that
records the evidence, baseline intent, Editor Tools intent, chosen authority,
affected paths, and required regression evidence. If an affected path is not
already allowed, update this task card before editing it; never widen scope
silently after the fact.

This authorization does not bypass CCR rules. Any public contract, `.nani` IR,
save shape, or `RuntimeCommand` shape change requires a new CCR before code is
changed. Compatibility or translation layers are not an acceptable conflict
resolution.

## Allowed Paths

- `packages/nani-runtime-compiler/**`
- `packages/layered-character/**`
- `packages/story-engine/**`
- `packages/app-vn-session/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-runtime/**`
- `packages/app-vn-devtools/**`
- `packages/app-vn-shell/**`
- `packages/ui-kit/**`
- `apps/game-a/**`
- `apps/game-harness/src/interaction/**`
- `apps/game-harness/src/harness/scenarios/harness-showcase/**`
- `scripts/**`
- `tests/smoke/**`
- `docs/architecture/**`
- `docs/ccr/vn-runtime-debug-boundary-hard-cut.md`
- `docs/tasks/nani-debug-workbench-hard-upgrade.md`
- `docs/tasks/editor-tools-latest-baseline-convergence.md`
- `docs/nani/**`
- `README.md`
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`
- `playwright.config.ts`

## Forbidden Paths

- `packages/contracts/**`
- `packages/nani-parser/src/types.ts`
- `packages/navi-director/**`
- `packages/trial-director/**`
- `packages/pixi-stage-model/**`
- `packages/pixi-presenter/**`
- `docs/archive/**`

## Contracts

- `VnRuntimeShellPort`, `VnPresentationPort`, `VnLifecyclePort`, and
  `VnDiagnosticsPort` remain the only product VN runtime boundary.
- Harness inspection remains behind `useVnRuntimeWithDebug()` and a read-only
  debug snapshot.
- `SaveableVnState`, `.nani` IR, `RuntimeCommand`, and save schemas do not change.
- Compiler semantic serialization remains the only script-revision authority.
- Product and test script metadata stay isolated and are selected by exact Vite
  modes rather than product runtime query parsing.

## Conflict And Convergence Ledger

| Area | Evidence and intents | Final authority | Paths and regression evidence | Status |
|---|---|---|---|---|
| Game A launch | Baseline introduced launch definitions, character preload, and isolated test modes; Editor Tools introduced a DEV candidate entry | One app launch definition; DEV host may replace only its runtime entry; no URL or start-label override | Game A app, launch, Vite, and smoke tests | Pending audit |
| Script metadata and revision | Baseline split product/test generated metadata; Editor Tools centralized canonical semantic revision | Compiler serializer plus generator/browser digest adapters; generated outputs are regenerated | Compiler, asset generator, Game A script tests | Pending audit |
| Runtime ports | Baseline consumers used product actions; Editor Tools hard-cut debug from the root result | Four canonical product ports; explicit read-only debug entry only | Runtime, Game A, Harness, cleanup tests | Pending audit |
| Pixi and Alice | Baseline added preload readiness, source-pixel outline, and transition hardening; Editor Tools must preserve presenter identity on equivalent updates | Baseline Pixi behavior plus app-owned equivalent-plan reuse; no presenter bypass | Game A character and workbench smoke | Pending audit |
| Playwright isolation | Baseline added separate servers/modes and Metal worker policy; Editor Tools added workbench coverage and Vite cache isolation | Keep both exact-mode servers and cache isolation | Playwright config tests and smoke | Pending audit |
| Production cleanup | Baseline excludes smoke/test markers; Editor Tools excludes devtools/HMR/session markers | Effective union of current markers; no stale legacy names | Production build and cleanup guards | Pending audit |
| Documentation | Baseline updated Harness/test/VS Code workflow; Editor Tools documented the workbench and runtime hard cut | One current call chain with no old dispatcher, query, or debug-port descriptions | Documentation review and freshness guards | Pending audit |

Additional findings must be appended before their implementation.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Direct linear ancestry | Base is an ancestor and the feature range contains no merge commits |
| Tree-preserving transplant | New tree differs from the preserved tip only by this task card before convergence |
| Baseline additions and removals survive | Added-file and deleted-file audit plus targeted tests |
| Single runtime/entry/revision wiring | Unit tests, cleanup guards, typecheck, and manual diff review |
| Workbench behavior survives | Devtools/Game A unit tests and Game A smoke screenshots |
| Baseline character and test isolation survive | Character smoke, Playwright config tests, and production guards |
| Additional convergence stays reviewable | Separate ledger entries and convergence commit diff |

## Regression Requirements

- Normal: product, VN smoke, and character launch definitions start from `/`;
  workbench preview, pin, HMR return, and preload behavior remain functional.
- Boundary: compiler error keeps last-known-good state; removed target and stale
  update do not commit; product builds contain no debug/test markers.
- No-op: semantically unchanged source keeps revision and equivalent character
  plans do not remount Pixi.
- Baseline preservation: dialog opacity, Alice outline/crossfade, isolated smoke
  servers, and Metal worker policy retain their latest-baseline behavior.
- Cleanup: old debug URLs, full reload, root debug port, flattened Harness aliases,
  and deleted baseline files remain absent.

## Dependency Changes

Allowed only as part of the exact preserved Editor Tools tree: the existing
`@v-ronpa/app-vn-devtools` workspace registration and lockfile changes. No new
dependency or package-manifest change may be introduced during convergence.

## CCR Triggers

- Public schemas, product runtime ports beyond the accepted hard cut, `.nani`
  IR, `RuntimeCommand`, save data, or manifest shapes need to change.
- A forbidden path must change to resolve a demonstrated semantic inconsistency.
- A new dependency is required.

## Required Gates

```bash
pnpm vitest run packages/nani-runtime-compiler packages/story-engine packages/app-vn-session packages/app-vn-runtime packages/app-vn-devtools apps/game-a apps/game-harness
pnpm typecheck
pnpm validate:contracts
pnpm validate:command-docs
pnpm test
pnpm validate:assets
pnpm validate:boundaries
pnpm validate:ccr
pnpm validate:app-cleanup
pnpm validate:vn-runtime-cleanup
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:task-boundaries -- --task docs/tasks/editor-tools-latest-baseline-convergence.md
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/editor-tools-latest-baseline-convergence.md
pnpm validate:baseline
```

## Programmatic Acceptance

- The preserved base is a direct ancestor and no merge commit remains in the
  feature range.
- The transplant is tree-equivalent before separately ledgered convergence.
- All task-specific, subsystem, smoke, production, and baseline gates pass.
- Generated files are fresh and no removed capability or file is restored.

## Manual Acceptance

- Exercise workbench expand/collapse/resize, preview, pin, external-save return,
  decision input, and compiler-error last-known-good behavior.
- Inspect current-line/fixed-point behavior and Game A/Pixi resizing.
- Recheck Alice preload, outline, and transition presentation.
- Retain screenshot evidence under ignored test output directories.

## Review Packet

- Old/new commit and tree hashes plus the local recovery ref.
- Tree-equivalence result and final linear-history proof.
- Completed Conflict And Convergence Ledger.
- Changed-files and hard-deletion audit.
- Test, gate, build, smoke, and screenshot evidence.
- Any authorized additional development and residual risks.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

No data migration is involved. Restore the local branch from
`backup/editor-tools-pre-rebase-20260718` if the reconstructed tree or semantic
verification is unacceptable. Do not remove the backup ref during this task.

## Done When

- The local `codex/editor-tools` points to the verified linear result.
- The incorrect baseline upstream is unset and no remote ref was modified.
- All required gates pass and the review packet records the final evidence.
