# Game A Devtools Viewport Isolation

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/editor-tools`

## Status

- State: `In Progress`
- Owner: `Codex`
- Created: `2026-07-18`
- Updated: `2026-07-18`
- Completed Commit: `TBD`
- Archive Target: `docs/archive/completed-tasks/game-a-devtools-viewport-isolation.md`

## Goal

Keep the Nani workbench from changing Game A's logical viewport or authored
composition by default, while making the product playfield's DOM UI and Pixi
presentation share one container-size authority when responsive reflow is
explicitly requested.

## Context

- `docs/architecture/vn-devtools.md`
- `docs/architecture/app-vn-integration.md`
- `docs/tasks/nani-debug-workbench-hard-upgrade.md`
- `AGENTS.md`

The current DEV grid shrinks the Game A column while Game A DOM surfaces still
use window `vw`/`vh` and window media queries. Pixi already observes its host
container, so opening or resizing the Dock produces two different geometry
authorities and a distorted composite scene.

## Constraints

- `app-vn-devtools` remains a generic Nani Dock/controller package. It must not
  own Game A viewport dimensions, Pixi resize policy, presentation scale, or
  Game A responsive breakpoints.
- Product Game A must render exactly the same DOM tree when DEV tooling is not
  mounted. The production path may receive a minimal optional playfield-wrapper
  interface, but no DEV wrapper, observer, toolbar, state, storage, or transform.
- Default DEV mode is `fidelity`: the logical viewport follows the browser
  viewport, while the remaining game cell only changes uniform display scale
  and letterboxing.
- Explicit `responsive` mode uses the actual remaining game cell as the logical
  viewport and exists to test multi-resolution reflow.
- Game A DOM layout uses its playfield container as the size authority. Pixi
  continues to use its existing host `ResizeObserver`; do not add Dock-specific
  calls or alternate resize state to the presenter.
- Do not modify Nani/runtime/materialization, saves, compiler, command syntax,
  runtime ports, Pixi model/presenter, or public contracts.
- Do not add dependencies, compatibility layers, or a second viewport authority.

## Allowed Paths

- `apps/game-a/src/App.tsx`
- `apps/game-a/src/styles.css`
- `apps/game-a/src/ui/game-a-ui.css`
- `apps/game-a/src/devtools/**`
- `apps/game-a/src/**/*.test.ts`
- `apps/game-a/src/**/*.test.tsx`
- `tests/smoke/game-a-vn.spec.ts`
- `docs/architecture/vn-devtools.md`
- `docs/architecture/app-vn-integration.md`
- `docs/tasks/game-a-devtools-viewport-isolation.md`
- `progress.md`

## Forbidden Paths

- `packages/app-vn-devtools/**`
- `packages/app-vn-runtime/**`
- `packages/app-vn-shell/**`
- `packages/pixi-stage-model/**`
- `packages/pixi-presenter/**`
- `packages/contracts/**`
- `packages/nani-parser/**`
- `packages/nani-runtime-compiler/**`
- `apps/game-harness/**`
- `package.json`
- `pnpm-lock.yaml`
- `docs/archive/**`

## Contracts

- Product runtime ports and `SaveableVnState` remain unchanged.
- Game A's playfield is the only DOM/Pixi geometry boundary.
- `GameADevViewportMode` is app-local DEV UI state, not a runtime or devtools
  package contract and not persisted in saves.
- The optional `GameAAppCore` playfield wrapper is app-internal and must be a
  zero-DOM, zero-observer path when omitted.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Fidelity mode preserves authored composition | Expanded/collapsed/resized Dock keeps logical playfield and normalized dialog geometry stable |
| Responsive mode uses the game cell | Pure layout tests and Playwright show logical dimensions following the remaining cell |
| DOM and Pixi share one responsive size | Container units/queries plus Pixi canvas and playfield geometry assertions |
| Product path has no DEV burden | Production build marker scan and App structure tests |
| Dock remains generic | Boundary validation and no changes under `packages/app-vn-devtools` |
| Narrow viewport remains usable | Existing overlay breakpoint and screenshot regression |

## Regression Requirements

- Normal: 1280x720 fidelity mode opens the Dock without changing the logical
  1280x720 game viewport; collapsing returns display scale to 1.
- Resize: changing Dock width changes only fidelity display scale/letterbox,
  not logical playfield size or normalized dialog geometry.
- Responsive: switching modes makes logical playfield dimensions equal the
  remaining cell and activates container-based UI breakpoints.
- Boundary: zero-sized or not-yet-measured cells produce finite safe layout;
  mode changes do not restart Story, remount the runtime, or mutate a checkpoint.
- Production: no viewport toolbar, DEV mode marker, observer, or session state is
  bundled into the Game A production output.

## Dependency Changes

None. Do not edit package manifests or `pnpm-lock.yaml`.

## CCR Triggers

- A shared package/public interface, Pixi presenter, runtime port, save schema,
  `.nani` IR, or command shape must change.
- The optional app-internal wrapper cannot preserve the production DOM tree.
- A new dependency is required.

## Required Gates

```bash
pnpm vitest run apps/game-a
pnpm typecheck
pnpm validate:assets
pnpm validate:boundaries
pnpm validate:app-cleanup
pnpm --filter @v-ronpa/game-a build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/game-a-devtools-viewport-isolation.md
pnpm validate:baseline
```

## Programmatic Acceptance

- Layout math is pure, finite, and covered independently from React/DOM.
- DEV fidelity mode preserves one logical viewport across Dock changes.
- Responsive mode is container-relative and matches Pixi's host dimensions.
- Product build contains no DEV viewport controls or mode markers.
- All required gates pass.

## Manual Acceptance

- Compare the same VN checkpoint with Dock collapsed, default width, and maximum
  width; character, inner background, dialog, and command bar composition remain
  proportional in fidelity mode.
- Switch to responsive mode and confirm the UI intentionally reflows with the
  game cell rather than with the outer browser.
- Inspect desktop, narrow overlay, and restored desktop screenshots and confirm
  no new console errors.

## Review Packet

- Boundary and changed-files summary.
- Layout-mode behavior and geometry assertions.
- Unit, build, smoke, subsystem, and baseline output.
- Screenshot paths and visual findings.
- Residual responsive-layout limitations.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Reverting removes the DEV preview frame and container-unit migration. No save,
runtime, script, or asset migration is involved.

## Done When

- Fidelity preview no longer compresses or reflows the authored game scene.
- Responsive preview has one container-size authority across DOM and Pixi.
- Tests, docs, screenshots, builds, and repository gates pass.
