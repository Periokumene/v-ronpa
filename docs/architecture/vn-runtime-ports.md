# VN Runtime Ports

The VN runtime public boundary is capability-shaped. `VnRuntimeShellPort` owns
story/UI actions and facts; `VnPresentationPort` owns terminal Pixi presentation;
`VnLifecyclePort` owns start/reset/checkpoint/restore; `VnDiagnosticsPort` owns
diagnostic observation; `VnRuntimeDebugPort` is explicit non-product inspection.

Media handles, restore plans, wait keys, voice gates, timers, and transaction
helpers are internal. Canonical BGM/looping-SFX desired state is checkpoint data,
but live handles, one-shots, voice/bleep gates, movies, cursors, and fades are not.
Lifecycle reset is a hard reset of the runtime-exclusive media ports; there is no
per-call media-retention option. Root exports are explicit, and no compatibility
re-export exists. See [VN integration](app-vn-integration.md) and
[presentation pipeline](presentation-pipeline.md).
