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

R3F may report renderer-local pose, facing, and suggested candidates. Navi
remains authoritative for `activeInteractableId`, `canConfirm`, blocked reason,
and confirm routing.

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
