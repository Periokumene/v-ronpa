# Nani Debug Workbench Hard Upgrade

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/editor-tools`

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-07-18`
- Updated: `2026-07-18`
- Completed Commit: `59aea0c7c4a7740f83f0b0c47c8bb035e9b9989c`
- Archive Target: `docs/archive/completed-tasks/nani-debug-workbench-hard-upgrade.md`

## Goal

Deliver a DEV-only, read-only Game A Nani workbench with stable-state preview,
semantic source hot updates, automatic return to a pinned target, runtime state
inspection, and a hard cleanup of all former debug-start and duplicate runtime
interfaces.

## Context

- `docs/ccr/vn-runtime-debug-boundary-hard-cut.md`
- `docs/architecture/vn-runtime-ports.md`
- `docs/architecture/app-vn-integration.md`
- `docs/architecture/presentation-pipeline.md`
- `docs/architecture/asset-pipeline.md`
- `AGENTS.md`

## Constraints

- No compatibility aliases, `vnStart` conversion, full-reload fallback, save
  migration, debug URL, source editor, authored fixture, or command sandbox.
- Product runtime and debug materialization share Story/session/dispatch/model
  semantics; no second interpreter or reducer is allowed.
- Game A is the only v1 workbench host. Harness receives canonical-port cleanup
  and full regression coverage only.
- `@wait` stays catalog-stubbed; no `.nani` syntax, IR, RuntimeCommand, or save
  schema change is allowed.
- Debug code and markers must not enter the Game A production bundle.

## Allowed Paths

- `packages/nani-runtime-compiler/**`
- `packages/layered-character/**`
- `packages/story-engine/**`
- `packages/app-vn-session/**`
- `packages/app-vn-dispatch/**`
- `packages/app-vn-runtime/**`
- `packages/app-vn-devtools/**`
- `packages/app-vn-shell/**`
- `packages/ui-kit/src/surfaces/InspectorLite.tsx`
- `packages/ui-kit/src/surfaces/InspectorLite.test.tsx`
- `packages/ui-kit/src/surfaces/types.ts`
- `apps/game-a/**`
- `apps/game-harness/src/interaction/**`
- `apps/game-harness/src/harness/scenarios/harness-showcase/**`
- `scripts/**`
- `tests/smoke/**`
- `docs/ccr/vn-runtime-debug-boundary-hard-cut.md`
- `docs/tasks/nani-debug-workbench-hard-upgrade.md`
- `docs/architecture/**`
- `docs/nani/command-catalog.md`
- `README.md`
- `AGENTS.md`
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`
- `playwright.config.ts`
- `progress.md`

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
  `VnDiagnosticsPort` are the only product root boundary.
- `SaveableVnState` remains the only checkpoint installed by the workbench.
- `scriptRevision` remains `sha256:<hex>` over canonical runtime-script
  semantics.
- `VnDebugTargetAnchor` and decision traces are debug-only APIs, not contracts
  or save data.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Product/debug port hard cut | Runtime, Game A, and Harness unit/type tests |
| Canonical semantic revision | Compiler/generator Node-browser golden tests |
| Single-instruction and terminal projection parity | Story/session/runtime tests |
| Stable target materialization and branch decisions | Runtime debug tests |
| Nani source update without page reload | Devtools Vite plugin/controller tests |
| Read-only resizable Dock and pinned/current markers | Devtools tests and Playwright screenshot evidence |
| Atomic Game A preview/auto-return | Game A integration and smoke tests |
| No production or legacy leakage | Boundary, cleanup, and production-dist guards |
| Harness remains functional | Harness build and VN/Navi/Trial smoke coverage |

## Regression Requirements

- Normal: dialogue, label, Pixi/UI/persistent-media targets materialize to the
  same checkpoint as normal runtime execution.
- Branch: one enabled choice auto-resolves; multiple choices and input request a
  Dock decision and rematch semantic identity.
- Boundary: deleted target, cycle/max steps, transient-only target, expression
  error, gameplay event, compiler error, and stale update never partially commit.
- Revision: source-location/comment edits are stable; command/label semantics
  change revision; Node and browser digests match.
- HMR: only configured `.nani` files emit monotonic custom updates; no full page
  reload; latest update wins.
- Cleanup: no root debug port, old launch/test query, override, reload plugin, or
  Harness flattened VN alias remains.

## Dependency Changes

Allowed: create `@v-ronpa/app-vn-devtools`, register its project reference and
workspace dependencies, and update `pnpm-lock.yaml`. No new third-party editor
or runtime dependency is allowed.

## CCR Triggers

The public VN runtime boundary change is covered by
`docs/ccr/vn-runtime-debug-boundary-hard-cut.md`. Any discovered need to change
contracts, `.nani` IR, command status, or save data stops the task for a separate
CCR.

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
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/nani-debug-workbench-hard-upgrade.md
```

## Programmatic Acceptance

- All task-specific and full gates pass.
- The production Game A bundle contains no workbench or smoke markers.
- Stable materialization never writes save/session storage checkpoints.
- App and Harness consume one runtime boundary.

## Manual Acceptance

- Open, resize, collapse, search, select, preview, pin, manually advance, edit
  source, observe automatic return, exercise a decision, and inspect diagnostics.
- Inspect screenshots for both Dock and game/Pixi resizing.
- Confirm compiler errors retain the last successful running scene.

## Review Packet

- Changed-files and hard-deletion summary.
- Test/gate output and screenshot paths.
- Materialization parity and rejection coverage.
- Production isolation evidence and residual deferred items.

## Completion Evidence

- The accepted final tree was transplanted without content changes onto local
  baseline `a7bb0091234f7796df3db93a7bfe3f0ae948e300`; the preserved pre-rebase tip
  is `a787a565aaa5e3adab48d17d61bf3c826326c20d`.
- `pnpm validate:baseline` passed with 400 contract/subsystem tests, 612 full
  unit tests, both production builds, cleanup guards, and 8 Playwright smoke
  cases.
- The task-specific subsystem gate against `integration/v-ronpa-baseline`
  passed.
- Independent post-fix review found no remaining blocker after verifying host
  acceptance linearization, same-plan Pixi identity, and initial source/revision
  race defenses.
- Workbench expanded, collapsed, overlay, stable preview, Game A VN, and Alice
  layered-character screenshots are retained under the ignored `test-results/`
  evidence directory.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting removes the new devtools package and restores the former runtime API.
No data migration exists; saves remain revision-gated.

## Done When

- Code, tests, docs, cleanup guards, builds, smoke, visual evidence, and the
  subsystem gate all pass with no compatibility layer left behind.
