# Contract Change Request

## Requested Change

Standardize Pixi presentation wait semantics across `.nani` parser IR,
runtime compiler output, StoryEngine presentation waits, and app/Pixi task
completion wiring.

## Affected Packages

- `packages/contracts`
- `packages/nani-parser`
- `packages/nani-runtime-compiler`
- `packages/story-engine`
- `packages/pixi-presenter`
- `apps/game`

## Why Existing Contract Is Insufficient

Pixi presentation commands now run through an async presenter task lifecycle, but
StoryEngine previously only had a timer-shaped `presentationWait` record. That
left `wait!` tied to app-level timeouts instead of real renderer completion and
made manual continue unable to express Naninovel-style Complete On Continue.

The parser also classified colon-bearing command args with a hand-maintained
parameter key list. That made resource ids such as `bg:harness` fragile and
forced parser-level command knowledge that belongs in the catalog-aware
compiler.

## Proposed Shape

- `CommandIR.args` preserves ordered command tokens as value, param, and flag
  entries with raw token text.
- Parser keeps legacy `primary`, `params`, and `flags` for compatibility, but
  compiler decisions use ordered args plus command catalog metadata.
- `NaniCommandDefinition.execution` declares whether a command is
  `story-control`, `pixi-presentation`, `gameplay`, or `declared-only`.
- `StoryPresentationWait` gains `commandIndex`, `stageRevision`, and
  `expectedTasks`.
- `StoryPresentationWaitTask` identifies Pixi work by `kind`, `target`, and
  `revision`.
- Runtime compiler canonicalizes Pixi timing to `durationMs`, `wait`, `lazy`,
  and `easing`; `time` remains seconds-based and V-Ronpa `duration` remains a
  compatibility input.
- `wait!` blocks only explicit Pixi presentation commands. Empty expected task
  sets complete immediately; expected task completion resumes StoryEngine to the
  next text, choice, end, or wait stop.
- Manual advance during `presentationWait` settles matching Pixi work to the
  terminal snapshot and resumes the story.

## Compatibility And Migration

`CommandIR.primary`, `params`, and `flags` remain available during the migration
window. Downstream compiler code should prefer `args`.

Save data continues storing terminal Pixi snapshots only. Active Pixi tasks,
tween progress, transient effects, and wait plans are not persisted.

Naninovel async track commands such as `@async`, `@await`, `@sync`, and `@stop`
are catalog-declared but execution-boundary-out-of-scope for this runtime; the
compiler emits diagnostics instead of silently pretending to support multi-track
story control.

## Fixtures And Tests

- Parser tests cover ordered args, colon-like primary values, flags,
  `if/unless`, inline commands, unknown commands, and local label references.
- Compiler tests cover catalog-aware primary resolution, `time -> durationMs`,
  `wait!`/`!wait`, `lazy`, expression timing, declared-only diagnostics, and
  `@shake loop!` boundary diagnostics.
- StoryEngine tests cover `presentation-wait`, `PRESENTATION_COMPLETE`, and
  resume after presenter completion.
- Pixi reducer/tests cover wait task descriptors for actor transitions,
  screen/filter effects, transient effects, and weather transitions.
- App transaction/tests cover propagation of Pixi wait descriptors.

## Rebase Impact

Branches touching `.nani` parser output, command catalog entries, runtime
compiler normalization, StoryEngine stop reasons, Pixi task snapshots, or
vertical-slice story advancement must rebase and route Pixi wait behavior
through `StoryPresentationWait.expectedTasks` rather than app-local timers.
