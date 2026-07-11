# Contract Change Request

> Status: authority model superseded by `interaction-vn-runtime-presentation-authority.md`.

> Superseded note: save-slot thumbnail and concrete app path details in this
> CCR are historical. Current save-slot storage, preview storage, and Game A /
> harness wiring are defined by
> `docs/ccr/unified-media-save-slots-and-thumbnails.md`.

## Requested Change

Add public interaction-shell contracts for title/overlay UI flow, capability
snapshots, settings, UI asset references, and save slot summaries. Extend
`ContentManifest` with additive fields used by the vertical-slice interaction
shell.

## Affected Packages

- `packages/contracts`
- `packages/game-flow-machine`
- `packages/media-save`
- `packages/ui-kit`
- `apps/game`

## Why Existing Contract Is Insufficient

The previous vertical slice entered Navi directly and kept interaction controls
inside harness code. The UI/interaction branch needs shared vocabulary for title
entry, VN toolbar actions, active overlay/pause section, save/load summaries, UI asset
references, and settings shells before feature branches add concrete pages. Without those
contracts, app adapters, ui-kit surfaces, save storage, and game-flow capability
logic would each invent their own shape.

## Proposed Shape

- `GameMode` adds `title` while preserving existing playable modes.
- `GameOverlayKind` names title, VN, pause, and confirmation overlays.
- `GameUiAction` names shell-level UI actions such as new game, save/load,
  backlog, settings, auto/skip, and return title.
- `GameInteractionContext` carries current mode, active overlay, pause section, input lock,
  active-story flags, and stable-stop hints.
- `InteractionCapabilitySnapshot` is derived by `game-flow-machine` and consumed
  by UI surfaces.
- `SettingsSnapshot` is an empty additive shell for future persistent settings.
- `SaveSlotSummary` stores text-only save previews for lists and load menus.
- Save data remains the runtime restore payload. Slot summaries are derived by
  `media-save` from `SaveData` instead of being stored inside `SaveData`.

## Runtime Ownership

- `game-flow-machine` owns mode, active overlay, pause section, and capability policy.
- `apps/game/src/interaction/**` adapts the current vertical slice runtime to
  that public flow model.
- `media-save` owns slot persistence, migration, summaries, list, load, and
  delete operations.
- `ui-kit` owns pure title, overlay host, VN command bar, backlog, save/load,
  settings, and pause menu surfaces.
- `VerticalSliceScenario` remains fixture/debug assembly and must not redefine
  overlay/action/capability/save-slot shapes.

## Compatibility And Migration

Slot summaries can be regenerated from save data story backlog when a slot is
normalized. UI skin assets remain app-local configuration and are not shell
contract fields.

## Fixtures And Tests

- `packages/contracts/src/index.test.ts` covers interaction, overlay,
  capability, settings, and save slot summary schemas.
- `packages/game-flow-machine/src/index.test.ts` covers title flow, overlay
  stack, capability matrix, and exploration save behavior after VN ends.
- `packages/media-save/src/index.test.ts` covers save summary derivation,
  summary listing, and deletion.
- `apps/game/src/interaction/useVerticalSliceSaveAdapter.test.ts` covers
  vertical-slice save collection without leaking interaction navigation state.
- `tests/smoke/vertical-slice.spec.ts` covers title to Navi to VN, toolbar,
  backlog, save/load confirmation, and pause menu.

## Rebase Impact

Branches building VN interaction UI should consume these contract shapes instead
of defining local action, overlay, capability, or slot-summary types.
Branches adding production settings or screenshot previews must add follow-up
task cards and CCRs if they expand public save/settings contracts.
