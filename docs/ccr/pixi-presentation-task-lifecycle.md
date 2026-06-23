# Contract Change Request

## Requested Change

Add a Pixi-local `PresentationTask` lifecycle layer for renderer-side async
visual work without changing StoryEngine, story-play, or save data control flow.

## Affected Packages

- `packages/pixi-presenter`
- `apps/game`

## Why Existing Contract Is Insufficient

Pixi transitions, transient effects, and filter/weather fades can continue after
StoryEngine has synchronously advanced to the next print, choice, or end stop.
The previous presenter only owned tweens directly, so app debug views could not
inspect active visual work and future `wait:true` support had no renderer-side
completion source to attach to.

## Proposed Shape

- `pixi-presenter` owns `PresentationTaskController`.
- Task snapshots are Pixi-local debug data with `id`, `kind`, `target`,
  `revision`, `durationMs`, `status`, and `startedAtMs`.
- `PixiPresenterOptions` accepts
  `onTasksChanged?: (tasks: PixiPresentationTaskSnapshot[]) => void`.
- `PixiPresenterPort` does not add a new control-flow API. App code observes
  task snapshots only for debug and future wait integration.
- Same `target + kind` task starts replace the old task; unrelated task targets
  can continue.
- `animate:false`, presenter `clear`, presenter `destroy`, reset, and restore
  settle or cancel active tasks and render the terminal `PixiStageSnapshot`.

## Compatibility And Migration

No public `packages/contracts` schema changes are required. `SaveData` continues
storing terminal `PixiStageSnapshot` state only; active Pixi tasks, transient
hints, tween progress, and effect overlays are not persisted. Loading a save
renders the saved snapshot with animation disabled and an empty active task
list.

This CCR does not complete `wait:true` / `wait!` semantics. Existing
presentation-wait behavior remains timer-based until a later task wires
StoryEngine resume to real Pixi completion.

## Fixtures And Tests

- Unit tests cover `PresentationTaskController` start, completion, cancellation,
  settling, target-level replacement, subscriber notification, and stale handle
  guards.
- Pixi system tests cover task creation and completion for actor transitions
  and transient flash effects.
- App tests keep save/restore plans terminal and verify restored Pixi runtime
  task lists are empty.
- Smoke tests verify the vertical-slice Runtime readout exposes Pixi task debug
  state and returns to `empty` after load/skip terminal rendering.

## Rebase Impact

Branches touching `pixi-presenter` tween/effect code should route new async
visual work through `PresentationTaskController` instead of unmanaged timeouts
or ad hoc completion flags. Branches changing AUTO/SKIP/manual scheduling should
not depend on Pixi task snapshots as gameplay or story state.
