# Contract Change Request

## Title

Runtime UI transition waits

## Status

- State: `Active`
- Task: `docs/tasks/ui-runtime-transition-wait.md`

## Why Existing Contract Is Insufficient

`showUI` and `hideUI` already accepted `time` in compiled params, but the public
contracts did not identify runtime UI targets as a first-class type and
`StoryPresentationWait` only described Pixi work. As a result, UI `wait!` could
not be represented without app-local state or a second waiting mechanism.

## Requested Contract Changes

- Add `RuntimeUiGroup` with the v1 target set `dialog`, `commandBar`, and
  `toastLayer`.
- Mark `showUI/hideUI wait` as consumed by the runtime command catalog while
  keeping unsupported params such as `hideUI allowToggle` diagnosed.
- Split `StoryPresentationWait` by `channel`:
  - `pixi` waits keep Pixi task metadata through `expectedTasks`.
  - `ui` waits carry `targets`, `targetVisible`, `commandId`, `commandIndex`,
    and `durationMs`.
- Keep UI wait state transient. Normal saves do not persist active UI
  transitions, and restore clears UI presentation waits.

## Compatibility

No legacy compatibility path is required for the old app runtime `visible`
shape. Runtime UI state is not public save data. Existing Pixi wait semantics are
preserved through the `pixi` channel with the same task descriptors.

## Regression Evidence

- Contract and compiler tests cover consumed `showUI/hideUI wait` params and
  normalized `durationMs`.
- StoryEngine tests cover UI `wait!`, no-wait UI commands, and invalid UI target
  non-wait behavior.
- Dispatch/runtime tests cover timed fade, reverse interruption, no-target
  multi-surface commands, zero-duration settling, UI wait release, manual/SKIP
  settling, and restore cleanup.
- Shell, ui-kit, game-a, and smoke tests cover mounted fading surfaces and
  presentation opacity consumption.
