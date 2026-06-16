# Contract Change Request

## Status

- ID: `CCR-0001`
- State: `Accepted`
- Owner: `integration/navi-vn-vertical-slice-0616`
- Created: `2026-06-16`
- Updated: `2026-06-16`
- Originating Worktree: `ai/r3f-first-person`
- Base Branch: `integration/v-ronpa-baseline`
- Archive Status: `Active`
- Archive Target: `docs/archive/ccr/CCR-0001-navi-r3f-interaction-authority.md`

## Summary

Unify the authority boundary for first-person Navi interaction candidates so
R3F can present 3D hotspot feedback without becoming the source of truth for
which interactable can actually be confirmed.

## Requested Change

Add additive contract shapes for Navi interaction sensing, authoritative
candidate views, and confirm requests:

- `InteractionBlockedReason`
- `NaviInteractionSensorReport`
- `NaviInteractionView`
- `NaviInteractionConfirmRequest`
- `InputActionState`

R3F reports renderer-local pose and facing only. Navi remains authoritative for
candidate selection, `activeInteractableId`, `canConfirm`, blocked reason, and
confirm routing.

## Implementation Notes

- R3F emits sensor reports as throttled renderer observations containing pose
  and facing, but no renderer-local interactable candidate.
- Navi validates the report against the active map before assigning
  `activeInteractableId`. Candidate selection, facing, and range rules live in
  `navi-director`, not in the renderer.
- R3F highlights the Navi-authoritative `activeInteractableId`; renderer-local
  candidates are not computed or displayed as confirmable authority.
- Confirm requests from first-person input are converted into
  `NaviInteractionSensorReport` first, then resolved through Navi/gameplay.
- Physical keyboard codes are mapped through `InputBindingMap` by an input
  runtime before reaching R3F. R3F consumes `InputActionState`; adapter-local
  keyboard defaults exist only as compatibility fallback.

## Affected Packages

- `packages/contracts`
- `packages/navi-director`
- `packages/r3f-adapter`
- `apps/game`

## Why Existing Contracts Were Insufficient

The baseline contracts had `PlayerPose`, `WorldMapDef.interactables`,
`InputLockState`, and `CameraControlMode`, but did not define the handoff
between a 3D renderer's local sensing and Navi's authoritative interaction
state. Without a public shape, the highlighted R3F target could drift from the
target Navi confirms.

## Compatibility And Migration

This change is additive. Existing `WorldMapDef`, `InteractableDef`,
`PlayerPose`, `InputLockState`, `CameraControlMode`, and save data remain
valid. No save migration is required.

## Fixtures And Tests

- Contract tests cover sensor report, authoritative view, blocked reason, and
  confirm request shapes.
- Navi director tests prove renderer suggestions are not authoritative and
  input/substate locks block confirmation.
- The vertical-slice smoke test verifies that R3F highlight and confirm output
  flow through Navi state rather than renderer-local action execution.
- The vertical-slice smoke test also covers real first-person movement: semantic
  move input focuses an interactable and semantic interact input confirms it.
