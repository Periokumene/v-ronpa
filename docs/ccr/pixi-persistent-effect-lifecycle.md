# Contract Change Request: Unified Pixi Persistent Effect Lifecycle

> Status: accepted by the explicit baseline-integration preparation request on 2026-08-08.

## Requested Change

Apply one observable lifecycle contract to Blur, Bokeh, GlitchFilter, Rain,
Snow, Sun, CharacterTone, Vignette, StaticFilter, WaterVeil, Pulse, and
SignalMask.

## Public Semantics

- A command whose typed terminal values already match is a strict no-op: the
  Stage snapshot reference and revision remain unchanged and no hint or wait
  descriptor is emitted.
- Repeated removal is the same strict no-op.
- Multi-target Blur emits waits only for targets that changed.
- A changed command interrupts from live Presenter values. The replaced task is
  settled before the new transition owns the same kind/target.
- Timed removal continues across unrelated reconciliations. Re-enabling during
  removal reverses from the current live values.
- Restore with `animate:false` applies only terminal state and restores no
  transient history, tween, hint, or task.

## Compatibility

`PixiStageSnapshot.version` remains 6. This branch has not entered the baseline,
so removed temporary SignalMask fields receive no migration or compatibility
parser. Existing actor transition behavior remains unchanged; authors use an
explicit wait command when they need a pure delay.

## Evidence

Contract/compiler rejection tests, Stage no-op/reference tests, Presenter
lifecycle tests, split Game A smoke specs, and the baseline subsystem gate are
required.
