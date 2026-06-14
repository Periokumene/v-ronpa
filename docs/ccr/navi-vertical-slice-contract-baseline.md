# Contract Change Request

## Requested Change

Add the minimum Navi vertical-slice contract fields needed before subsystem
worktrees fan out:

- `AabbBounds` for simple walkable room limits.
- `PlayerPose` for serializable first-person position and camera angles.
- `WorldMapDef.walkBounds?` for harness-ready map bounds.
- `NaviRuntimeState.playerPose?` for director-owned exploration pose.
- `InteractableDef.action` variant `change-map` for scene transitions.

## Affected Packages

- `packages/contracts`
- `packages/gameplay`
- `packages/navi-director`
- `apps/game` harness fixtures

## Why Existing Contract Is Insufficient

The first playable slice must validate first-person exploration, map switching,
and VN overlay return paths from independent worktrees. Without a public pose,
walk bounds, and map-change action, the R3F, gameplay, and Navi director lines
would each need to invent local shapes or reopen `apps/game` and contracts
during subsystem work.

## Proposed Shape

`AabbBounds` stores `{ min: Vector3, max: Vector3 }`. `PlayerPose` stores
`{ position: Vector3, yaw: number, pitch: number }`, with `yaw` and `pitch`
defaulting to `0`.

`WorldMapDef.walkBounds?` is optional for compatibility with existing fixtures.
`NaviRuntimeState.playerPose?` is optional because older saves and harness
states may only track the active map.

`change-map` is a director-owned interactable action:

```ts
{ type: "change-map"; mapId: string; spawnId?: string; pose?: PlayerPose }
```

## Fixtures And Tests

- Update contract tests for `walkBounds`, `change-map`, and `playerPose`.
- Update gameplay exploration tests so map changes remain director-owned.
- Update Navi director tests so map changes update Navi state without mutating
  gameplay state.
- Add harness fixture maps for `academy-hall` and `classroom`.

## Rebase Impact

Subsystem worktrees for `gameplay`, `navi-director`, `r3f-adapter`, `ui-kit`,
`pixi-presenter`, and `story-engine` should rebase onto the new baseline and
must not change these contracts again without a new CCR.
