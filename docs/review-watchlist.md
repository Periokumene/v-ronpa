# Manual Review Watchlist

This file records observations, unresolved design pressure, and future decision
points that must not be auto-implemented by agents.

Entries here are not task cards. An entry may only become implementation work
after a human review explicitly converts it into a `docs/tasks/**` card, ADR, or
CCR. Agents may read and reference this file, but must not automatically fix,
delete, split, or execute entries from it.

## Operating Rules

- Auto Action: Forbidden for every entry unless it has been converted into an
  explicit task card, ADR, or CCR.
- Review cadence is manual. Reviewers decide whether each entry is still true,
  obsolete, ready for design, or ready for implementation.
- Keep entries small enough to review independently.
- Do not use this file as a substitute for `docs/tasks/**`; executable work
  belongs in a task card with allowed paths and gates.

## Entry Template

- ID:
- Title:
- Area:
- Source / Evidence:
- Current Observation:
- Why Not Actionable Yet:
- Auto Action: Forbidden
- Review Cadence:
- Next Review:
- Status: Watching | Needs Decision | Converted | Closed
- Linked Task / ADR / CCR:

## Watchlist Entries

### RW-0001: Inline text tokens `[< ...]` and `[>]`

- ID: RW-0001
- Title: Inline text tokens remain outside the command catalog
- Area: `.nani` text syntax, nani-parser, StoryEngine
- Source / Evidence:
  - `packages/nani-parser/src/index.ts`
  - `packages/nani-parser/src/types.ts`
  - `packages/story-engine/src/index.ts`
  - Existing fixture usage of inline print params and auto-next behavior
- Current Observation: `[< speed:0.8]` and `[>]` are currently parsed as inline
  text tokens using command-like IDs. `[< ...]` is folded into
  `TextIR.printParams`; `[>]` becomes print auto-next behavior in StoryEngine.
  They are not top-level `@` commands and are intentionally not part of
  `commandCatalog`.
- Why Not Actionable Yet: Removing them would break existing text behavior and
  fixtures. Promoting them into the main command catalog would blur the boundary
  between top-level Naninovel commands and inline text tokens. A later dedicated
  inline-token contract may be cleaner if this syntax expands.
- Auto Action: Forbidden
- Review Cadence: Review before the next `.nani` syntax contract expansion.
- Next Review: TBD
- Status: Watching
- Linked Task / ADR / CCR: TBD

### RW-0002: Wildcard command promotion path

- ID: RW-0002
- Title: Decide when `@wildcard-<type>` routes graduate into formal commands
- Area: contracts, StoryEngine, branch-specific VN presentation work
- Source / Evidence:
  - `docs/ccr/vn-command-catalog-runtime-dispatcher.md`
  - `docs/nani/command-catalog.md`
  - `docs/architecture/vn-runtime-dispatcher.md`
- Current Observation: Wildcard commands are deliberate extension points for the
  performance branch and UI branch. They carry `wildcardType`, `routeKey`, and
  generic params, while official Naninovel commands remain explicitly declared.
- Why Not Actionable Yet: It is too early to know which branch-local route keys
  deserve stable command status. Promotion criteria should be based on repeated
  usage, cross-branch need, and contract stability.
- Auto Action: Forbidden
- Review Cadence: Review after each major VN branch merge.
- Next Review: TBD
- Status: Watching
- Linked Task / ADR / CCR: TBD

### RW-0003: VN UI surface architecture

- ID: RW-0003
- Title: Backlog/save-load/settings/auto-skip UI needs a dedicated design pass
- Area: apps/game, future ui-kit, save/media/runtime state
- Source / Evidence:
  - User planning notes for the VN UI/interaction branch
  - `docs/architecture/vn-runtime-dispatcher.md`
- Current Observation: The runtime dispatcher now leaves room for UI actions,
  and the settings persistence baseline is in place. LOG, SKIP, AUTO, SAVE,
  LOAD, and broader style configuration still need a mature product UI pass.
- Why Not Actionable Yet: The work crosses UI layout, runtime controls, save
  data, backlog policy, accessibility, and style presets. It should not be
  inferred from dispatcher scaffolding alone.
- Auto Action: Forbidden
- Review Cadence: Review when opening the VN UI/interaction branch plan.
- Next Review: TBD
- Status: Watching
- Linked Task / ADR / CCR: TBD

### RW-0004: Future VN2D/VN3D route profiles

- ID: RW-0004
- Title: Route profile-specific dispatch remains reserved, not implemented
- Area: apps/game, Pixi, R3F, presentation routing
- Source / Evidence:
  - `apps/game/src/vnOutputRoutes.ts`
  - `docs/architecture/vn-runtime-dispatcher.md`
- Current Observation: `VnOutputRouteTable` accepts a `vn2d` or `vn3d` profile
  parameter, but current routing is fixed and profile-agnostic.
- Why Not Actionable Yet: No concrete VN3D route divergence has been proven yet.
  Implementing profile-specific route rules prematurely may create unused
  complexity or a second routing authority.
- Auto Action: Forbidden
- Review Cadence: Review before the first VN3D presentation task card.
- Next Review: TBD
- Status: Watching
- Linked Task / ADR / CCR: TBD

### RW-0005: Backlog Jump Policy

- ID: RW-0005
- Title: Decide whether backlog entries can jump or rewind runtime state
- Area: VN UI, StoryEngine snapshots, save/runtime restore
- Source / Evidence:
  - `docs/archive/completed-tasks/game-interaction-shell.md`
  - `packages/ui-kit/src/surfaces/GameInteractionSurfaces.tsx`
  - `tests/smoke/vertical-slice.spec.ts`
- Current Observation: Backlog is read-only in the interaction shell baseline.
  It displays story entries but does not seek, rewind, or branch-jump.
- Why Not Actionable Yet: Jumping from backlog needs a snapshot/replay policy
  for story variables, RuntimeCommand fanout, gameplay events, and saveable
  runtime state. That policy should be reviewed before implementation.
- Auto Action: Forbidden
- Review Cadence: Review before implementing backlog jump behavior.
- Next Review: TBD
- Status: Watching
- Linked Task / ADR / CCR: TBD

### RW-0006: Save Slot Screenshot Preview

- ID: RW-0006
- Title: Decide if save slots should store screenshot thumbnails
- Area: media-save, app runtime capture, storage budgets
- Source / Evidence:
  - `docs/ccr/game-interaction-shell.md`
  - `docs/archive/completed-tasks/game-interaction-shell.md`
  - `packages/media-save/src/index.ts`
  - `packages/ui-kit/src/surfaces/GameInteractionSurfaces.tsx`
- Current Observation: Save slots store text summaries only. No canvas or DOM
  screenshot is captured.
- Why Not Actionable Yet: Screenshot previews require a capture authority,
  storage size policy, privacy review, and renderer synchronization between DOM,
  Pixi, and R3F.
- Auto Action: Forbidden
- Review Cadence: Review before adding visual save previews.
- Next Review: TBD
- Status: Watching
- Linked Task / ADR / CCR: TBD

### RW-0007: Complete Settings Persistence

- ID: RW-0007
- Title: Define persistent settings before filling the settings page
- Area: contracts, ui-kit, app runtime
- Source / Evidence:
  - `SettingsSnapshot` in `packages/contracts/src/index.ts`
  - `SettingsOverlay` in `packages/ui-kit/src/surfaces/GameInteractionSurfaces.tsx`
- Current Observation: Closed by `docs/ccr/settings-persistence-baseline.md`.
  Settings now has grouped contracts, app-owned localStorage persistence,
  controlled ui-kit controls, and narrow runtime consumption for VN dialog
  display plus story-play timing.
- Why Not Actionable Yet: Baseline persistence is complete. Future additions
  such as keybinds, accessibility presets, per-project style overrides, or
  richer audio behavior should be reviewed as separate expansions.
- Auto Action: Forbidden
- Review Cadence: Review only when expanding settings beyond the baseline.
- Next Review: TBD
- Status: Closed
- Linked Task / ADR / CCR: `docs/ccr/settings-persistence-baseline.md`

### RW-0008: RuntimeCommand Diagnostics Surfacing

- ID: RW-0008
- Title: Decide how compiler and story step diagnostics surface in app runtime
- Area: nani-runtime-compiler, StoryEngine, apps/game harness, debug UI
- Source / Evidence:
  - `packages/nani-runtime-compiler/src/index.ts`
  - `packages/story-engine/src/index.ts`
  - `apps/game/src/interaction/useVerticalSliceRuntimeAdapter.ts`
- Current Observation: Closed for the vertical-slice harness. Parser, compiler,
  StoryEngine, and transaction diagnostics are surfaced through the app debug
  readout and Inspector Lite. Production reporting, save metadata, or blocking
  overlays remain separate product decisions.
- Why Not Actionable Yet: No longer watching for the accepted harness baseline.
  Reopen with a product-specific task if diagnostics need production UX,
  telemetry, save metadata, or authoring-tool integration.
- Auto Action: Forbidden
- Review Cadence: Review before expanding `.nani` authoring or adding runtime
  script loading beyond the fixed vertical slice fixture.
- Next Review: TBD
- Status: Closed
- Linked Task / ADR / CCR: RuntimeCommand diagnostics surfacing in the accepted
  vertical-slice harness.

### RW-0009: Auto / Skip Scheduler

- ID: RW-0009
- Title: Define scheduler ownership for VN auto and skip behavior
- Area: StoryEngine stepping, GameInteractionShell, VN toolbar
- Source / Evidence:
  - `GameUiAction` entries for `toggle-auto` and `toggle-skip`
  - `VnCommandBar` in `packages/ui-kit/src/surfaces/GameInteractionSurfaces.tsx`
- Current Observation: AUTO and SKIP have command bar entries and capability
  flags. The accepted implementation path is `story-play` as a pure playback
  state machine, with app adapters hosting browser timers and mapping playback
  pacing into presentation commits.
- Why Not Actionable Yet: Closed for the vertical-slice harness. Reopen only if
  future work adds persisted read-history, configurable skip-all/read-only
  policy, or audio/voice readiness contracts.
- Auto Action: Forbidden
- Review Cadence: Review before implementing VN auto or skip runtime behavior.
- Next Review: TBD
- Status: Closed
- Linked Task / ADR / CCR: story-play AUTO/SKIP implementation

### RW-0010: Pixi Presenter Differential Reconcile

- ID: RW-0010
- Title: Decide when Pixi snapshot rendering should move from full redraw to
  differential reconcile
- Area: pixi-presenter, PixiStageSnapshot, VN runtime presentation
- Source / Evidence:
  - `packages/pixi-presenter/src/index.ts`
  - `packages/pixi-presenter/src/stageSnapshot.ts`
  - `apps/game/src/vnRuntimeTransaction.ts`
  - `docs/architecture/presentation-pipeline.md`
  - `docs/architecture/vn-runtime-dispatcher.md`
- Current Observation: Pixi now receives `PixiStageSnapshot` plus transient
  render hints through `reconcile(snapshot, options)`. This protects the public
  app/runtime/save boundary from command-log replay, but the presenter v1 still
  performs coarse full redraw inside the renderer adapter. That is acceptable for
  the current background plus three-slot VN stage, but it can become fragile as
  portraits, filters, particles, Live2D, or trial overlays become richer.
- Why Not Actionable Yet: Current scope only needs stable save/load restoration
  of VN background and portrait slots. A full differential renderer needs a
  deliberate design pass for stage diffing, renderer instance cache, async asset
  swap behavior, hint-lane isolation, hydrate/no-animation rules, and regression
  coverage. Implementing it opportunistically would add complexity before the
  next richer Pixi presentation requirements are known.
- Future Review Questions:
  - Should `pixi-presenter` add a first-class `diffPixiStage(previous, next)`
    helper with background, slot add/remove/update, unchanged-slot, and
    hints-only cases?
  - Should each portrait slot retain a renderer instance cache keyed by
    `slot + characterId + portraitId`?
  - Should new portrait assets load offscreen and atomically swap only after the
    replacement is ready, preserving the old slot during async loading?
  - Should snapshot lane and hint lane be tested as separate paths so
    flash/shake/subtitle hints never rebuild persistent background or portrait
    layers?
  - Should load/hydrate have presenter-level assertions that `animate: false`
    never triggers fadeIn, flash, shake, or trial overlay hints?
  - What tests should prove repeated identical snapshots produce no renderer
    mutation, background-only changes do not rebuild portraits, and single-slot
    changes do not affect other slots?
- Auto Action: Forbidden
- Review Cadence: Review before adding richer Pixi VN staging, Live2D/spine
  portrait handling, persistent trial overlays, or Pixi performance work.
- Next Review: TBD
- Status: Watching
- Linked Task / ADR / CCR: TBD
