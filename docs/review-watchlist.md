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
  but BACK, LOG, SKIP, AUTO, SAVE, LOAD, and SETTING surfaces still need a
  mature UI architecture, style configuration strategy, and persistence boundary.
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

### RW-0005: Backlog Jump / Back Navigation Policy

- ID: RW-0005
- Title: Decide whether backlog entries can jump or rewind runtime state
- Area: VN UI, StoryEngine snapshots, save/runtime restore
- Source / Evidence:
  - `docs/tasks/game-interaction-shell.md`
  - `packages/ui-kit/src/surfaces/GameInteractionSurfaces.tsx`
  - `tests/smoke/vertical-slice.spec.ts`
- Current Observation: Backlog is read-only in the interaction shell baseline.
  It displays story entries but does not seek, rewind, or branch-jump.
- Why Not Actionable Yet: Jumping from backlog needs a replay/snapshot policy
  for story variables, presentation commands, gameplay events, and saveable
  side effects. That policy should be reviewed before implementation.
- Auto Action: Forbidden
- Review Cadence: Review before implementing VN BACK or backlog jump behavior.
- Next Review: TBD
- Status: Watching
- Linked Task / ADR / CCR: TBD

### RW-0006: Save Slot Screenshot Preview

- ID: RW-0006
- Title: Decide if save slots should store screenshot thumbnails
- Area: media-save, app runtime capture, storage budgets
- Source / Evidence:
  - `docs/ccr/game-interaction-shell.md`
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
- Area: contracts, ui-kit, media-save, app runtime
- Source / Evidence:
  - `SettingsSnapshot` in `packages/contracts/src/index.ts`
  - `SettingsOverlay` in `packages/ui-kit/src/surfaces/GameInteractionSurfaces.tsx`
- Current Observation: Settings is an empty shell. It does not persist audio,
  text speed, fullscreen, accessibility, input, or language preferences.
- Why Not Actionable Yet: Settings should be designed as a durable product
  surface with migration rules, defaults, reset behavior, and per-project style
  overrides.
- Auto Action: Forbidden
- Review Cadence: Review at the start of the VN UI/interaction branch.
- Next Review: TBD
- Status: Watching
- Linked Task / ADR / CCR: TBD

### RW-0008: Auto / Skip Scheduler

- ID: RW-0008
- Title: Define scheduler ownership for VN auto and skip behavior
- Area: StoryEngine stepping, GameInteractionShell, VN toolbar
- Source / Evidence:
  - `GameUiAction` entries for `toggle-auto` and `toggle-skip`
  - `VnCommandBar` in `packages/ui-kit/src/surfaces/GameInteractionSurfaces.tsx`
- Current Observation: AUTO and SKIP have command bar entries and capability
  flags, but no scheduler or StoryEngine stepping policy is implemented.
- Why Not Actionable Yet: Auto/skip needs timing, input cancellation,
  unread/read text policy, choice-stop policy, and interaction with future
  voice/audio playback.
- Auto Action: Forbidden
- Review Cadence: Review before implementing VN auto or skip runtime behavior.
- Next Review: TBD
- Status: Watching
- Linked Task / ADR / CCR: TBD
