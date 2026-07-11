# CCR: Pause Section Navigation

## Requested Change

Replace pause overlay history with one active pause section. LOG, SAVE, LOAD,
and SETTINGS are sibling tabs inside the pause surface, not nested overlays.

## Contract And Port Changes

- `GamePauseSection` names `backlog`, `save`, `load`, and `settings`.
- `GameOverlayKind` retains only title load/settings overlays.
- `GameInteractionContext` exposes `activeOverlay` and `pauseSection` instead of `overlayStack`.
- `canOpenPause` replaces `canOpenPauseMenu`; `open-pause` replaces `open-pause-menu`.
- Flow uses `OPEN_PAUSE(section)` and `RESUME`; no push/pop compatibility API remains.

## Interaction Semantics

- Escape opens the first enabled section in LOG, SAVE, LOAD, SETTINGS order.
- Selecting a tab replaces the active section without navigation history.
- Close or Escape resumes the originating VN, Navi, or Trial mode in one step.
- A pending load confirmation consumes Escape first and keeps pause navigation locked.

## Compatibility

This is a development hard cut. Old overlay ids, stack fields, capability names,
actions, and flow events are rejected; no aliases or migrations are provided.

## Acceptance

- Game A and Harness share the same routing and flow semantics.
- Repeated tab switching never increases navigation depth.
- Title load/settings continue to behave as independent overlays.
- Unit, contract, and Playwright tests cover direct close/resume.
