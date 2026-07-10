# VN Presentation Pipeline

```text
.nani -> app-vn-session -> app-vn-dispatch -> pixi-stage-model
                                             | snapshot/hints/waits
                                             v
app-vn-runtime -> VnPresentationPort -> VnPixiPresenterHost -> PixiLayer -> pixi-presenter
```

`app-vn-dispatch` and `pixi-stage-model` are headless. Neither imports Pixi,
React, DOM, or `pixi-presenter`. `pixi-stage-model` owns initial snapshots,
`reducePixiRuntimeCommand`, render hints, wait descriptors, normalization, and
reducer diagnostics.

`pixi-presenter` reconciles already-materialized snapshots and hints. It does
not accept `RuntimeCommand` and does not export the reducer. Renderer lifecycle
tasks are narrowed by `VnPixiPresenterHost` to `PresentationTaskObservation`
before runtime sees them. `observedTasks` are diagnostic display data, never
renderer input.

Restore remounts the story presentation session, reconciles the terminal Pixi
snapshot with `animate: false`, and starts with no task, hint, tween, or phantom
wait state.
