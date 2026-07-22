# VN Runtime Ports

The VN runtime public boundary is capability-shaped. `VnRuntimeShellPort` owns
story/UI actions and facts, including Auto/Skip control;
`VnPresentationPort` owns terminal Pixi presentation; `VnLifecyclePort` owns
start/reset/checkpoint/restore; and `VnDiagnosticsPort` owns diagnostic
observation. These four ports are the complete product boundary returned by
`useVnRuntime()`.

The lifecycle port is asynchronous at transactional boundaries. `startStory()`
and `restoreVnState()` return `Promise<Result>` after catalog validation and
target presentation preparation. A cross-script navigation holds the existing
runtime state under the `cutscene` input lock, follows at most 32 consecutive
static endpoints, and commits once. Checkpoints are rejected during that window.
`VnStoryRuntime.executedScriptPaths` records the scripts that produced the
current state and is the only execution-history authority used by Devtools.

Read-only runtime inspection is deliberately absent from the root entry.
Harnesses import `useVnRuntimeWithDebug()` and `VnRuntimeDebugSnapshot` from
`@v-ronpa/app-vn-runtime/debug`. That same explicit entry exposes headless Nani
inspection and materialization, but no product action is duplicated there.
The product hook and debug wrapper are separate modules: product composition
never delegates through the debug hook or pays the snapshot clone/freeze cost.

Media handles, restore plans, wait keys, voice gates, timers, operation tickets,
cross-script navigation coordination, and transaction
helpers are internal. Canonical BGM/looping-SFX desired state is checkpoint data,
but live handles, one-shots, voice/bleep gates, movies, cursors, and fades are not.
Lifecycle reset is a hard reset of the runtime-exclusive media ports; there is no
per-call media-retention option. Root exports are explicit, and no compatibility
re-export exists. See [VN integration](app-vn-integration.md) and
[presentation pipeline](presentation-pipeline.md). The development-only source
workflow is specified in [Nani devtools](vn-devtools.md).
