# Contract Change Request: Pixi Effects and `@focus` Hard Delete

## Status

- State: `Active`
- Date: `2026-08-05`

## Requested Change

Delete the public V-Ronpa command `@focus target:string duration:decimal` from
the active command catalog and compiler. No alias, deprecated stub, no-op, or
save migration is provided. An old script containing `@focus` now receives the
ordinary `unknown-command` compiler diagnostic and produces no
`RuntimeCommand`.

At the same time, make Pixi command reduction registry-driven and reorganize
private Presenter effects into explicit weather, persistent-screen, transient,
actor-effect, and Trial-overlay ownership boundaries.

## Affected Packages

- `packages/contracts`
- `packages/nani-runtime-compiler`
- `packages/pixi-stage-model`
- `packages/pixi-presenter`
- `packages/app-vn-dispatch`
- `packages/story-engine`
- active fixtures, generated command documentation, Harness, and smoke tests

## Contract Impact

- `naniCommandCatalog` no longer contains `focus`.
- `@focus` cannot cross the compiler boundary.
- Manually injected unknown Pixi commands retain the generic
  `unsupported-pixi-command` Stage Model diagnostic.
- `bokeh focus:` remains a supported parameter. Navi focus, DOM focus, camera
  focus modes, and `scripted-focus` are unrelated and unchanged.
- `PixiStageSnapshot.version` remains `6`; save data is unchanged because the
  removed command never produced persistent state.

## Compatibility And Rollback

This is a hard cut. Existing active scripts must delete or replace `@focus`
before they compile. Historical archives and older CCRs remain factual records.
Rollback requires restoring the catalog declaration, compiler normalizer,
dispatch route, documentation, and tests together; a compatibility-only stub is
not an acceptable partial rollback.

## Verification

- catalog absence and exact compiler rejection tests;
- Stage registry/catalog bidirectional invariant;
- effect reducer, lifecycle, isolation, restore, and task tests;
- generated command catalog audit excluding historical archives;
- Harness snapshot/readout, motion, cleanup, and visual smoke evidence.
