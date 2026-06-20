# Contract Change Request

## Requested Change

Remove `@v-ronpa/presentation-contracts` as a public contract package and
downshift its presenter memory helper into `pixi-presenter` as internal runtime
trace code.

## Affected Packages

- `packages/contracts`
- `packages/pixi-presenter`
- `apps/game`

## Why Existing Contract Is Insufficient

`presentation-contracts` mixed public-sounding names with presenter runtime
implementation details. Its `PresentationSnapshot` contained current visual
observations, applied command history, and active performs, which made it easy to
confuse with the future saveable stage snapshot model. The snapshot/save system
needs `packages/contracts` to remain the only public schema source.

## Proposed Shape

- `packages/contracts` remains the only public schema contract package for
  presentation command wire shapes.
- `@v-ronpa/presentation-contracts` is removed from workspace references,
  dependency manifests, gates, and architecture docs.
- Pixi keeps an internal `PresenterTrace` recorder for tests and presenter
  inspection. It records applied commands, current visible background/portrait
  observations, and active performs.
- `PresenterTrace` is not a save shape, not a Stage snapshot, and not imported by
  `SaveData` or StoryEngine.

## Runtime Ownership

- `PresentationCommand` remains owned by `packages/contracts`.
- Pixi-specific presenter trace types live inside `packages/pixi-presenter`.
- App code continues consuming `PixiPresenterPort` from `pixi-presenter`.
- Future saveable stage snapshots must be introduced through a separate CCR in
  `packages/contracts`.

## Compatibility And Migration

This is an internal package cleanup. No save data, `.nani` IR, command catalog,
StoryRuntimeSnapshot, or content manifest shape changes are introduced.

## Fixtures And Tests

- `packages/pixi-presenter/src/internal/presenterTrace.test.ts` covers the
  migrated presenter trace behavior formerly tested in `presentation-contracts`.
- `packages/pixi-presenter/src/index.test.ts` covers the narrowed public Pixi
  presenter port.
- Workspace gates ensure no imports, package references, or boundary rules still
  refer to `@v-ronpa/presentation-contracts`.

## Rebase Impact

Branches importing `@v-ronpa/presentation-contracts` must rebase and import
runtime presenter types from `pixi-presenter`, or use `PresentationCommand` from
`contracts` for public wire shapes.
