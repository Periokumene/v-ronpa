# Input And Camera Contracts

## Intent

Input and camera state are public gameplay contracts, not renderer details.
Navi, Trial, DOM overlays, Pixi effects, and R3F stages must coordinate through
`InputBindingMap`, `InputLockState`, and `CameraControlMode`.

## Input Actions

`InputAction` is a semantic action list:

- movement and look: `move-forward`, `move-back`, `move-left`, `move-right`,
  `look`
- shared commands: `confirm`, `cancel`, `interact`, `open-inventory`, `pause`
- Trial commands: `select-truth-bullet`, `fire-truth-bullet`

Adapters map devices to actions with `InputBindingMap`. Gameplay reducers
consume actions; they should not depend on raw keyboard or mouse codes.

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

## Camera Modes

`CameraControlMode` describes camera authority:

- `first-person`: Navi walk camera.
- `orbit-debug`: harness-only or editor inspection camera.
- `scripted-focus`: VN3D camera focus and staged discussion.
- `trial-targeting`: debate camera plus truth-bullet targeting overlay.
- `locked`: overlays or cutscenes where player camera control is disabled.

R3F may implement the camera mechanics, but `navi-director` and
`trial-director` decide which mode is active.

