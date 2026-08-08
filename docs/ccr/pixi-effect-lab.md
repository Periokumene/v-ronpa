# Contract Change Request: Pixi Effect Lab

> Status: accepted by the explicit implementation request on 2026-08-07.

## Requested Change

Add nine peer semantic Nani effect commands: transient `impact`, `afterimage`, `shutter`, and `flicker`; persistent `vignette`, `staticFilter`, `waterVeil`, `signalMask`, and `pulse`. The development lab is demonstration content only and introduces no production wrapper or shared command family.

## Why Existing Contract Is Insufficient

The fixed command catalog, RuntimeCommand normalizers, Pixi stage schemas, render-hint union, and presentation task kinds cannot represent these effects without typed additions. Existing `glitch` and `glitchFilter` remain valid and cannot safely stand in for the new semantic authoring controls.

## Proposed Shape

- Add independent semantic command definitions and strict normalizers. Time is authored in seconds and normalized to `durationMs`; random commands carry a finite decimal seed.
- Store persistent terminal controls in screen-filter, weather, or actor-filter snapshots. Keep transient phase, captured textures, particles, masks, and clocks presenter-private.
- Add render hints and task kinds only for the four finite effects. Persistent effects reuse screen-filter or actor-transition tasks.
- Keep `PixiStageSnapshot.version` at 6 because additions are optional fields with defaults and no existing field changes meaning.

## Runtime Ownership

- Compiler validates authoring and emits renderer-independent RuntimeCommand values.
- Pixi Stage Model owns pure reduction, hints, terminal snapshots, and wait descriptors.
- Pixi Presenter owns shaders, captured textures, procedural geometry, time phases, resize, and disposal.
- Product apps observe effects only through the existing VN presentation and diagnostics boundaries.
- SignalMask requires an explicit active-character target, has no region control, and applies once to the complete outer actor composition. Actor transition is its only transition authority.
- Presenter implementations are independent leaf controllers with semantic uniforms and effect-specific shader programs. Pulse and Afterimage own separate bounded history textures.

## Compatibility And Migration

Existing scripts, saves, and command behavior remain valid. Older version-6 snapshots parse with the new optional fields absent. Restore applies persistent terminal controls with empty presenter history; transient effects are not restored.

## Safety And Scope

The development-only lab includes an explicit high-frequency flicker warning and a skip path. Product adoption requires a separate photosensitivity review. No dependency or App asset-manifest change is included.

## Tests And Gates

Contract snapshots, compiler normalization/rejection, stage reduction/save semantics, presenter ordering/lifecycle, Game A build, visual smoke, boundary checks, and the task subsystem gate are required.
