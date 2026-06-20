# Input And Camera Contracts

## Intent

Input and camera state are public gameplay contracts, not renderer details.
Navi, Trial, DOM overlays, Pixi effects, and R3F stages must coordinate through
`InputBindingMap`, `InputActionState`, `InputLockState`, and
`CameraControlMode`.

## Input Actions

`InputAction` is a semantic action list:

- movement and look: `move-forward`, `move-back`, `move-left`, `move-right`,
  `look`
- shared commands: `confirm`, `cancel`, `interact`, `open-inventory`, `pause`
- Trial commands: `select-truth-bullet`, `fire-truth-bullet`

Input runtimes map devices to actions with `InputBindingMap`, then publish
`InputActionState` snapshots for renderers and directors. Gameplay reducers
consume actions; they should not depend on raw keyboard or mouse codes.

Mouse-look deltas are not represented in `InputActionState` yet. The current
first-person path uses R3F `PointerLockControls` to keep high-frequency look
delta inside the camera rig, then reports the resulting pose and facing through
`NaviInteractionSensorReport`. If mouse, gamepad, and touch look axes need a
shared semantic runtime later, add a new public contract through a CCR instead
of overloading pressed/released action events.

## Input Locks

`InputLockState` describes who owns player input:

- `none`: the active 3D mode may accept exploration or targeting input.
- `dialog`: DOM/VN dialog owns advance and choices.
- `inventory`: inventory/menu surface owns input.
- `trial-targeting`: Trial debate owns truth-bullet aiming and firing.
- `menu`: global menu owns input.
- `cutscene`: scripted playback owns input.

Renderers must receive this value from directors. They must not infer it from
CSS visibility or component-local state.

Global shell overlays use `menu`. The app-level `GameInteractionShell` opens
title load/settings, VN backlog/save/load/settings, and Navi pause menu through
the `GameFlowMachine` overlay stack, then publishes `menu` to the current
`GameInteractionContext`. R3F camera controls and semantic movement must treat
`menu` as locked. Closing the overlay returns authority to the underlying Navi
or Trial director context.

## Camera Modes

`CameraControlMode` describes camera authority:

- `first-person`: Navi walk camera.
- `orbit-debug`: harness-only or editor inspection camera.
- `scripted-focus`: VN3D camera focus and staged discussion.
- `trial-targeting`: debate camera plus truth-bullet targeting overlay.
- `locked`: overlays or cutscenes where player camera control is disabled.

R3F may implement the camera mechanics, but `navi-director` and
`trial-director` decide which mode is active.

## Navi First-Person Interaction Pipeline

The first-person Navi path uses R3F as a sensor and presenter, not as the
gameplay authority:

1. An input runtime consumes `InputBindingMap`, active context, and input locks,
   then publishes `InputActionState` for semantic Navi actions such as
   `move-forward` and `interact`.
2. `ExplorationStage3D` consumes `InputActionState` and mutates Three.js camera
   state inside the R3F frame loop.
   High-frequency camera movement must stay in refs/Three objects and must not
   force broad React app state updates every frame.
3. R3F emits throttled `NaviInteractionSensorReport` values containing map id,
   pose, and facing. It does not compute interactable candidates.
4. `navi-director` validates those reports against the active `WorldMapDef` and
   owns candidate selection, `activeInteractableId`, `canConfirm`, and blocked
   reason.
5. `ExplorationStage3D` highlights the Navi-authoritative
   `activeInteractableId`; renderer-local candidates must not exist as
   confirmable targets.
6. Confirm input sends the latest R3F request payload to Navi first. Navi then
   resolves the authoritative active target through gameplay/map outcomes.

Harness shortcuts may issue explicit pose commands for debugging, but those
commands are not evidence that real player movement is wired. Smoke coverage for
first-person slices should include a true input path: map physical input to
semantic actions, move through `InputActionState`, obtain a Navi-authoritative
active target, and confirm with `interact`.

App harness bridge hooks may connect DOM controls, pointer-lock status, pose
commands, and interact signals to `ExplorationStage3D`, but they must not own
camera pose or compute confirmable interactable candidates.

The ESC pause path is authoritative at the shell layer: if Navi is active and no
VN story is consuming dialog input, ESC opens `pause-menu` and locks input as
`menu`. ESC must not mutate Navi maps, interactable candidates, or camera pose.
