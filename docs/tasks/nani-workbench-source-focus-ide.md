# Nani Workbench Source-Focus IDE Upgrade

## Base Branch

- `integration/v-ronpa-baseline`
- Task delta base: `d2aca91d480276cca71c33f4d2329f41d4132f4b`

This task is stacked after the completed Editor Tools convergence and Game A
devtools viewport isolation work on `codex/editor-tools`. Task-boundary and
subsystem validation use the exact stacked-task base above so prior accepted
changes are not attributed to this UI-only upgrade. The final baseline gate
still validates the complete branch.

## Branch Name

- `codex/editor-tools`

## Status

- State: `In Progress`
- Owner: `Codex`
- Created: `2026-07-18`
- Updated: `2026-07-18`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/nani-workbench-source-focus-ide.md`

## Goal

Replace the card/form-oriented Nani Workbench Dock with a source-first IDE
workspace while preserving the existing inspector, materializer, HMR, pinned
checkpoint, atomic restore, Pixi identity, and Game A viewport boundaries.

## Context

- `docs/architecture/vn-devtools.md`
- `docs/tasks/nani-debug-workbench-hard-upgrade.md`
- `docs/tasks/game-a-devtools-viewport-isolation.md`
- Visual reference:
  `/Users/periokumene/.codex/generated_images/019f7438-91b6-7d30-b2d8-e69a55c9ed84/exec-7a71f61f-22b8-4551-883a-69e58a5ac5b3.png`
- `AGENTS.md`

## Constraints

- `app-vn-devtools` remains the only owner of controller, Dock, and view state.
  Game A continues to pass a controller into the DEV-only mount and receives no
  new product DOM, runtime, presenter, or compiler responsibilities.
- Preserve Dock width behavior: default `420px`, range `320–720px`, maximum
  `45vw`; retain the existing small-screen overlay and the app-owned Fidelity /
  Responsive preview boundary.
- Preserve all materialization and commit semantics. Browsing, selecting,
  searching, opening symbols, and resizing panels must not mutate Story,
  checkpoints, Pixi, UI, or media state.
- Session persistence hard-cuts to schema v2. Do not migrate v1 or add a
  compatibility reader.
- Keep the UI, ARIA labels, status messages, and technical diagnostics in
  English for this task.
- Use `@phosphor-icons/react` for visible icons. Do not add character glyph
  icons, custom SVG, inline SVG, CSS art, emoji, Monaco, a virtual list, a
  Worker, or a second source model.
- Internal panels may use a descriptor registry, but this task must not expose a
  public contribution or plugin API.
- Do not modify runtime, materializer, compiler, parser, Pixi, Game A product
  App, Harness, shared contracts, save data, `.nani` IR, or command semantics.

## Allowed Paths

- `packages/app-vn-devtools/**`
- `tests/smoke/game-a-vn.spec.ts`
- `tests/smoke/game-a-alice.spec.ts`
- `scripts/validate-game-a-production.mjs`
- `docs/architecture/vn-devtools.md`
- `docs/tasks/nani-workbench-source-focus-ide.md`
- `design-qa.md`
- `pnpm-lock.yaml`
- `progress.md`

## Forbidden Paths

- `apps/game-a/src/App.tsx`
- `apps/game-a/src/devtools/**`
- `apps/game-a/src/styles.css`
- `apps/game-a/src/ui/**`
- `apps/game-harness/**`
- `packages/app-vn-runtime/**`
- `packages/app-vn-session/**`
- `packages/app-vn-shell/**`
- `packages/nani-runtime-compiler/**`
- `packages/nani-parser/**`
- `packages/story-engine/**`
- `packages/pixi-stage-model/**`
- `packages/pixi-presenter/**`
- `packages/contracts/**`
- root `package.json`
- `docs/archive/**`

## Contracts

- Public additions are limited to `VnDevtoolsPanelId`,
  `VnDevtoolsLayoutState`, `VnDevtoolsController.layout`,
  `VnDevtoolsActions.updateLayout`, and the optional
  `VnDevtoolsStatus.cancellable` flag inside `app-vn-devtools`.
- Remove `filterVnDevtoolsLines`; the single source-find authority returns
  matches and source ranges without filtering the line model.
- The persisted v2 session contains only Dock collapse/width, bottom-panel
  layout, pinned anchor, and decision trace. It never contains source,
  checkpoint, diagnostics, search, selection, or popover state.
- Branch is a transient forced panel; persisted `activePanel` accepts only
  `problems` or `state`.
- The existing DEV-only Game A controller boundary and atomic checkpoint commit
  boundary remain unchanged.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| IDE shell and source-first hierarchy | Component tests and desktop screenshots show six fixed regions with independent source/panel scrolling |
| Session v2 layout persistence | Unit tests cover valid state, height clamps, v1 rejection, malformed panel IDs, and ignored privileged fields |
| IDE Find | Helper and Dock tests cover source/metadata/line matches, exact character ranges, complete source retention, cycling, and empty results |
| Stable selection across source updates | Controller tests prove anchor rematch and current/pinned/previewable fallback without stale line-number guessing |
| Dynamic primary action | Component tests cover Preview, Cancel, disabled Finishing, Resolve decision, and unavailable targets |
| Problems / State / Branch orchestration | Controller and Dock tests prove preview/error/decision auto-open behavior and warning no-focus behavior |
| Accessible symbols and panel resizing | Keyboard, ARIA, focus, separator, Escape, and shortcut tests |
| Game state isolation | Smoke tests prove source-only interactions are no-ops and Story session changes exactly once on successful commit |
| Responsive Dock density | 320px, 420px, 720px, and narrow-overlay screenshots plus component/container-query assertions |
| DEV-only dependency isolation | Game A production build and leakage guard reject Workbench, icon, panel-test-id, HMR, and session markers |

## Regression Requirements

- Normal: select and preview a stable source line from the top action or
  contextual Run-to-line control; State opens and the existing atomic commit
  completes once.
- Search: Find keeps the entire source visible, highlights exact source ranges,
  cycles previous/next, matches label/command/line metadata, and never changes
  the game.
- Navigation: breadcrumb and searchable symbols popover move source focus
  without clearing Find or committing a target.
- Busy: cancellable inspection/update/materialization exposes Cancel; once the
  host accepts a checkpoint the disabled primary action says Finishing and no
  false rollback is offered.
- Branch: choices keep radio semantics and inputs require explicit submission;
  decision cancellation submits no partial state and consecutive decisions keep
  Branch focused.
- Boundary: blocked/error opens Problems, warning only increments its badge,
  unavailable targets disable Preview with an accessible explanation, and copy
  failure is reported rather than showing success.
- Persistence: manual reload restores v2 Dock width, collapse, panel open state,
  active persisted panel, clamped height, pin, and decision trace; Find,
  selection, and popovers reset.
- Responsive: icon-only toolbar at 320px remains operable, the default 420px and
  maximum 720px IDE hierarchy remain legible, and the under-900px overlay keeps
  the game viewport boundary unchanged.
- Existing behavior: HMR latest-wins, last-known-good, Alice preload/expression,
  Pixi identity, fixed checkpoint restore, and Harness smoke remain green.

Test placement:

- Unit/component: `packages/app-vn-devtools/src/**/*.test.ts(x)`.
- App/E2E: `tests/smoke/game-a-vn.spec.ts` and
  `tests/smoke/game-a-alice.spec.ts` only.
- Visual evidence: ignored `test-results/**` screenshots and root
  `design-qa.md` comparison report.

## Dependency Changes

Allowed: add `@phosphor-icons/react@^2.1.10` only to
`packages/app-vn-devtools/package.json` and update `pnpm-lock.yaml`. It supplies
the selected reference's IDE-quality iconography and remains behind Game A's
DEV-only lazy import. No other dependency or root manifest change is allowed.

## CCR Triggers

- A shared runtime/product port, save schema, `.nani` IR, RuntimeCommand,
  compiler/materializer, Pixi presenter, or Game A product boundary must change.
- A public panel contribution API is required.
- Allowed paths cannot safely cover the implementation.
- A dependency other than the already authorized Phosphor package is required.

## Required Gates

```bash
pnpm setup:worktree-env
pnpm vitest run packages/app-vn-devtools apps/game-a
pnpm typecheck
pnpm validate:contracts
pnpm test
pnpm validate:assets
pnpm validate:boundaries
pnpm validate:ccr
pnpm validate:app-cleanup
pnpm validate:vn-runtime-cleanup
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=d2aca91d480276cca71c33f4d2329f41d4132f4b pnpm validate:task-boundaries -- --task docs/tasks/nani-workbench-source-focus-ide.md
BASE_REF=d2aca91d480276cca71c33f4d2329f41d4132f4b pnpm validate:subsystem -- --task docs/tasks/nani-workbench-source-focus-ide.md
pnpm validate:baseline
```

## Programmatic Acceptance

- New pure view-model helpers have readable normal, boundary, rejection, and
  no-op coverage.
- Component tests cover all six Dock regions, shortcuts, ARIA, panels, decisions,
  dynamic primary action, and the three container-width modes.
- Game A smoke covers IDE Find, Symbols, panels, session v2, cancellation,
  commit isolation, and existing HMR/Pixi flows.
- Production scanning proves the Workbench, Phosphor icon runtime, IDE panel
  markers, HMR event, and v2 session key do not enter the production bundle.
- All required gates pass from the recorded stacked-task base.

## Manual Acceptance

- Compare the implementation with the selected source-focus IDE reference at
  `1672x941` with a 720px Dock, then inspect `1280x720` at 420px and 320px plus
  the narrow overlay.
- Inspect ready, preview/State, Find, Symbols, decision/Branch,
  compiler-error/Problems, busy/Cancel, and persisted-reload states.
- Verify font hierarchy, spacing rhythm, palette, Phosphor icons, source density,
  panel proportions, copy, focus rings, and independent scrolling.
- Compare source and implementation in the same visual input. Record each
  P0/P1/P2 iteration in `design-qa.md`; final result must be exactly `passed`.

## Review Packet

- Changed-files summary, including hard-removed legacy view exports.
- Regression matrix with test names and gate outputs.
- Screenshot paths and Design QA iteration history.
- Production-marker scan evidence.
- Residual P3 polish and all explicit non-goals.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting this task removes only the DEV UI, session v2 layout state, tests,
documentation, and Phosphor dependency. It does not require save, Nani,
checkpoint, runtime, Pixi, or product DOM migration.

## Done When

- The Dock reads and operates as a source-first IDE workspace at every specified
  width without changing the game viewport or runtime semantics.
- Tests, production guard, builds, screenshots, Design QA, task gates, and full
  baseline validation pass.
- `design-qa.md` says `final result: passed` and the task card contains final
  evidence and completed commit lineage.
