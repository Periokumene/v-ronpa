# CCR: Interaction, VN Runtime, And Presentation Authority

## Requested Change

Make flow, VN runtime facts, command planning, Pixi state reduction, renderer
lifecycle, and asset registration single-authority boundaries.

## Contract And Port Changes

- Remove the unused `saving` game mode and unused confirmation overlay kinds.
- Flow owns mode, overlays, and pause history; interaction context and
  capabilities are pure derived values rather than synchronized mutable state.
- `app-vn-runtime` exports capability-scoped shell, presentation, lifecycle,
  diagnostics, and interaction-fact ports.
- `pixi-stage-model` owns the pure RuntimeCommand-to-snapshot reduction.
- `runtime-assets-pixi` implements the AssetRegistry runtime-asset fragment
  protocol and must not create a resolver, registry, or alternate manifest.

## Compatibility

Old adapters, dispatcher names, wildcard exports, flow events, and presenter
re-exports are deleted in the same integration change. No aliases remain.

## Acceptance

- VN, Navi, and Trial resume to the mode that entered pause.
- `app-vn-dispatch` and `app-vn-runtime` do not depend on the Pixi renderer.
- Game A and Harness use the same runtime ports, Pixi host, final manifest
  composition, diagnostics, and task-observation wiring.
