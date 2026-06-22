# Contract Change Request

## Requested Change

Add `RuntimeCommand`, `RuntimeValue`, and `RuntimeScript` contracts for the
compiled `.nani` runtime bridge. The new bridge makes RuntimeCommand the app
dispatch input instead of StoryEngine-owned downstream streams.

## Affected Packages

- `packages/contracts`
- `packages/nani-parser`
- `packages/nani-runtime-compiler`
- `packages/story-engine`
- `apps/game`
- `packages/pixi-presenter`
- `packages/gameplay`

## Why Existing Contract Is Insufficient

The previous design required StoryEngine to translate `.nani` commands into
downstream-specific shapes before app dispatch. This couples story execution to
Pixi, gameplay, and future director outputs. A compiled `RuntimeCommand` keeps
command semantics stable while letting adapters interpret only the commands they
own.

## Proposed Shape

- `RuntimeCommand` carries normalized command id, canonical name, catalog
  category/source/status, stable command-level params, source location, and
  optional raw source metadata. Stable params use canonical runtime names only;
  raw aliases remain in `sourceCommand`.
- `RuntimeCommand` may carry `condition` and `unless` expressions compiled from
  parser `CommandIR`.
- RuntimeCommand effect durations use `params.duration`; Pixi render hints may
  keep renderer-local `durationMs`, but the app dispatch input remains
  `RuntimeCommand`.
- `RuntimeScript` carries compiled commands, labels, assets, and dependencies.
- StoryEngine state remains saveable story state only. Stepper results carry the
  current step's emitted runtime commands, and save data does not persist command
  streams.
- StoryEngine owns expression evaluation against story variables. The compiler
  preserves expression values and must not silently replace them with defaults.

## Fixtures And Tests

- Contract tests validate `RuntimeCommand` and `RuntimeScript` schemas.
- Compiler tests cover text-to-print, parameter normalization, aliases, defaults,
  expression preservation, canonical-only params, and diagnostics.
- StoryEngine tests cover runtime script stepping, control command consumption,
  expression evaluation, conditional execution, and emitted command deltas.
- App tests cover Pixi and gameplay dispatch from emitted runtime commands,
  including fail-closed handling for unresolved expressions.

## Rebase Impact

Branches must consume `RuntimeCommand` dispatch directly. StoryEngine-owned
downstream command streams are not part of the active contract.
