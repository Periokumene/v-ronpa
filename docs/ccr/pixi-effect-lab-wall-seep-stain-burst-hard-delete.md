# Contract Change Request: Effect Lab Hard Delete

## Status

- State: `Active`
- Date: `2026-08-08`

## Requested Change

Hard-delete the two public Effect Lab commands `@wallSeep` and `@stainBurst`.
Delete their catalog entries, compiler normalizers, Stage schemas/reducers,
render hints and wait kinds, Presenter registrations and implementations, and
all active development demonstrations. No alias, deprecated stub, no-op,
migration, or replacement effect is provided.

## Affected Packages

- `packages/contracts`
- `packages/nani-runtime-compiler`
- `packages/pixi-stage-model`
- `packages/pixi-presenter`
- Game A development Nani content, smoke coverage, generated command docs, and
  active Effect Lab documentation

## Contract Impact

- The Nani command catalog no longer contains the two deleted commands.
- Old scripts receive the ordinary `unknown-command` compiler diagnostic and
  emit no `RuntimeCommand` for either command.
- The finite presentation-task union no longer accepts the removed stain task.
- Weather snapshots no longer accept the removed terminal weather kind or map
  field. The strict Stage schema rejects an old snapshot containing it.
- A manually injected legacy `RuntimeCommand` reaches the generic
  `unsupported-pixi-command` Stage diagnostic and changes no snapshot, hint, or
  wait descriptor.
- `PixiStageSnapshot.version` remains `6`; the deleted effects existed only in
  the current uncommitted Effect Lab work and receive no save migration.

## Compatibility And Rollback

This is a hard cut. Session, dispatch, and presentation ports remain unchanged
because they are generic transport boundaries and contain no effect-specific
behavior. Rollback requires restoring every public and private pipeline link
together; a compatibility-only partial restoration is not acceptable.

## Verification

- catalog absence, strict-schema rejection, and exact compiler rejection tests;
- Stage registry absence and generic unsupported-command behavior;
- Presenter registry, shader-mode, lifecycle, cleanup, isolation, and order tests;
- isolated and composition Nani smoke with empty final snapshots, hints, and tasks;
- generated documentation and active-source residual-name audit.
