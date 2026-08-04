# Web Game Browser Baseline Hardening

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- Current integration worktree; no standalone package branch required.

## Status

- State: `Done`
- Owner: `Codex`
- Created: `2026-07-19`
- Updated: `2026-07-19`
- Completed Commit: recorded by Git history
- Archive Target: `docs/archive/completed-tasks/web-game-browser-baseline.md`

## Goal

Give Game A and Harness one shell-owned Chromium browser baseline that removes
web-native interaction and control leakage while preserving text editing,
semantic accessibility, focus visibility, keyboard operation, and page zoom.

## Context

- [System guide](../architecture/system-guide.md)
- [VN app integration](../architecture/app-vn-integration.md)
- [Web game browser policy](../architecture/web-game-browser-policy.md)
- Both playable apps already mount `GameInteractionShell`; adding a
  `web-game-host` package would add dependency/manifest/boundary surface without
  a third consumer.

## Constraints

- One internal `app-vn-shell` policy; no public prop, port, contract, or package.
- Hard update only; no compatibility or migration layer.
- Settings v2 and `preferFullscreen` remain unchanged.
- No focus/background, visibility, auto-pause, unload, history, or fullscreen
  behavior.
- No dependency or lockfile changes.
- Current Chromium is the automated acceptance target.

## Allowed Paths

- `packages/app-vn-shell/**`
- `packages/ui-kit/**`
- `packages/app-vn-devtools/**`
- `apps/game-a/src/devtools/**`
- `apps/game-a/src/ui/**`
- `apps/game-harness/src/styles.css`
- `tests/smoke/**`
- `scripts/web-game-browser-policy.test.ts`
- `docs/architecture/web-game-browser-policy.md`
- `docs/architecture/system-guide.md`
- `docs/architecture/app-vn-integration.md`
- `docs/review-watchlist.md`
- `docs/tasks/web-game-browser-baseline.md`
- `progress.md`

## Forbidden Paths

- `packages/contracts/**`
- `.nani` IR, gameplay, runtime, Pixi, R3F, Navi, and Trial implementation.
- `package.json`, `pnpm-lock.yaml`, package manifests, or dependency graph.
- Focus/background, unload, history, or Fullscreen API behavior.

## Contracts

- Settings v2 is unchanged.
- `VnRuntimeShellPort`, `VnPresentationPort`, `VnLifecyclePort`, and
  `VnDiagnosticsPort` are unchanged.
- No CCR is required because no public schema, port, save data, or `.nani` IR
  changes.

## Observability And Acceptance Matrix

| Capability | Observable Evidence |
|---|---|
| Singleton document policy and cleanup | `webGameDocumentPolicy.test.ts` install, ref-count, cleanup, and previous-marker cases |
| Selection/context-menu editable boundary | Unit event tests plus Game A/Harness smoke DOM assertions |
| File/URL/text drop classification | Unit classification tests and real Chromium `DataTransfer`, `File`, and `DragEvent` smoke |
| Overscroll, fixed colors, and preserved zoom | Computed-style smoke plus static viewport/touch guard |
| No native Settings select/checkbox/range | ui-kit unit source/behavior tests and Harness final-DOM smoke |
| Skinned text/number/search/radio controls | Game A/ui-kit/Workbench tests and screenshots |
| Save image and runtime video hardening | Component tests plus final DOM property smoke |
| No system motion branch | Static drift guard and reduced-motion/forced-colors smoke |
| No policy scope growth | Static listener guard and architecture non-goals |

## Regression Requirements

- Normal path: static game/tool content blocks selection, context menu, native
  drag, file/URL drop, and overscroll chaining.
- Boundary path: text editing keeps selection/context menu/plain-text drop;
  file and URL/HTML drops remain blocked even over an editable field.
- No-op path: duplicate installs share one listener set, duplicate cleanup is
  harmless, and missing `DataTransfer` does not throw.
- UI path: Slider, Switch, and enum stepper cover normal, edge, and disabled
  states without native `select`, checkbox, or range elements.
- Media path: save thumbnails are not draggable and runtime video disables PiP
  and remote playback while remaining inline.

## Dependency Changes

None. Existing Radix Slider and Switch dependencies are reused.

## CCR Triggers

- Any change to Settings v2, a runtime port, save data, or `.nani` IR.
- Any need for public browser-policy configuration.
- Any implementation that requires paths outside this card.

## Required Gates

```bash
pnpm vitest run packages/app-vn-shell/src/webGameDocumentPolicy.test.ts packages/app-vn-shell/src/GameInteractionShell.test.ts packages/ui-kit/src/surfaces/GameInteractionSurfaces.test.tsx packages/ui-kit/src/surfaces/RuntimeUiSurfaces.test.tsx packages/app-vn-devtools/src/VnDevtoolsDock.css.test.ts packages/app-vn-devtools/src/VnDevtoolsDock.test.tsx apps/game-a/src/ui/GameASurfaces.test.tsx scripts/web-game-browser-policy.test.ts
pnpm typecheck
pnpm validate:contracts
pnpm validate:boundaries
pnpm test
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/web-game-browser-baseline.md
```

## Programmatic Acceptance

- Focused unit/static tests, repository tests, typecheck, contracts, and
  boundaries pass.
- Both apps build and the full smoke suite passes on fresh Chromium servers.
- Screenshots cover Harness Settings/forced-color presentation, Workbench
  decisions, Game A Settings/input/save, and runtime media.

## Manual Acceptance

- Trackpad edge navigation/pull-to-refresh feedback is absent in Chromium.
- Forced-color and fixed authored-motion screenshots retain readable text,
  disabled/selected distinction, and visible focus treatment.
- Browser zoom and pinch zoom remain available.

## Review Packet

- Changed one internal shell policy, local scroll/control skins, Settings/media
  DOM, focused tests, Chromium smoke, and current architecture documentation.
- Verification passed: 63 focused tests, 708 repository tests, 472 contract and
  subsystem tests, typecheck, task/boundary/CCR/assets/cleanup gates, both app
  builds, all 9 Playwright smoke scenarios, and the complete subsystem gate.
- Screenshot evidence: `test-results/harness-browser-settings.png`,
  `test-results/harness-browser-forced-colors-reduced-motion.png`,
  `test-results/game-a-workbench-decision-controls.png`,
  `test-results/game-a-runtime-input.png`, `test-results/game-a-save.png`, and
  `test-results/game-a-settings.png`.
- Manual trackpad edge-gesture and browser pinch-zoom checks remain reviewer
  actions; automated DOM/CSS checks confirm zoom was not disabled.
- `preferFullscreen` is the only deliberate Settings browser debt. No contracts,
  dependencies, lifecycle/navigation/fullscreen behavior, or `web-game-host`
  package were added.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Revert the shell policy, UI/media hardening, smoke/static tests, and these docs
together. There is no save migration, settings conversion, contract rollback,
dependency cleanup, or manifest cleanup.

## Done When

- Every required automated gate passes and visual screenshots are inspected.
- Manual-only trackpad/forced-color/focus risks are explicitly reported.
- Diff remains inside Allowed Paths and no public contract/CCR change exists.
