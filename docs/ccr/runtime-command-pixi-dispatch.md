# Contract Change Request

## Requested Change

Remove public `PresentationCommand` wire shapes and make routed `RuntimeCommand`
records the direct Pixi presenter reduction input.

## Affected Packages

- `packages/contracts`
- `packages/pixi-presenter`
- `apps/game`

## Why Existing Contract Is Insufficient

`RuntimeCommand` is already the compiled `.nani` dispatch bridge. Keeping a
second public `PresentationCommand` contract requires command semantics such as
duration, targets, backgrounds, and character staging to be translated into a
parallel wire shape before Pixi can consume them. That extra public contract can
drift from `commandCatalog` and makes future Naninovel parameter support harder
to audit.

This supersedes the `PresentationCommand` ownership statement in
`docs/ccr/presentation-contracts-cleanup.md`. Archived task documents remain
historical records of the older design.

## Proposed Shape

- `packages/contracts` no longer exports `PresentationCommandSchema` or
  `PresentationCommand`.
- `RuntimeCommand` remains the only cross-package command stream.
- `createVnRuntimePresentationTransaction` continues using `VnOutputRouteTable`
  to select Pixi-routed commands.
- `pixi-presenter` exports `reducePixiRuntimeCommand`, which consumes a routed
  `RuntimeCommand` and returns `PixiStageSnapshot`, `PixiStageRenderHint`, and
  Pixi diagnostics.
- `PixiStageRenderHint` is a Pixi presenter type, not a contracts wire shape.
- Pixi-routed commands that are not yet consumed, or that lack Pixi-consumable
  required params, return diagnostic no-op output instead of writing fallback
  stage ids.

## Compatibility And Migration

This is a public contract deletion. Callers must stop importing
`PresentationCommand` and must construct `RuntimeCommand` records or use the
parser/compiler/StoryEngine pipeline. No save data migration is required:
`SaveData` already stores `PixiStageSnapshot`, not command streams.

## Fixtures And Tests

- Contract tests stop validating presentation command wire shapes.
- Pixi presenter tests cover `RuntimeCommand` reduction for background,
  portraits, transient hints, unsupported command diagnostics, unsupported param
  diagnostics, and unresolved expression diagnostics.
- App transaction tests cover direct RuntimeCommand-to-Pixi fanout, gameplay
  fanout, and unresolved expression fail-closed behavior.

## Rebase Impact

Branches using `reducePixiStageCommand`,
`runtimeCommandToPixiPresentationCommand`, or `PresentationCommand` must rebase
onto `reducePixiRuntimeCommand` and route-filtered `RuntimeCommand` fanout.
