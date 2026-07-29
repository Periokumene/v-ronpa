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

`app-vn-runtime` owns one package-private `projectVnRuntimeStep()` authority.
It accepts the previous Story/Pixi/UI/media state, one canonical session step,
profile, route table, and explicit time. It returns stable terminal state plus
transient presentation descriptions. Both live runtime progression and debug
materialization call it; the workbench does not interpret commands or maintain
a second reducer.

Script-scoped Pixi state is converged inside this projection boundary. The
stage model compares `scopeScriptPath` with the final session script path both
before and after command fanout, so local labels retain state while direct or
chained cross-script navigation clears stale state before it can become a
stable checkpoint. Presenters never infer navigation from actor changes.

`pixi-presenter` reconciles already-materialized snapshots and hints. It does
not accept `RuntimeCommand` and does not export the reducer. Renderer lifecycle
tasks are narrowed by `VnPixiPresenterHost` to `PresentationTaskObservation`
before runtime sees them. `observedTasks` are diagnostic display data, never
renderer input.

Restore remounts the story presentation session, reconciles the terminal Pixi
snapshot with `animate: false`, and starts with no task, hint, tween, or phantom
wait state. A saved global character tone therefore restores its target preset
and amount immediately; interpolation progress, remaining time, and internal
easing are not persisted.

A stable checkpoint includes Story, terminal Pixi, terminal UI visibility, BGM,
and looping-SFX intent. It excludes animation progress, render hints/tasks,
dialog reveal, toast payloads, timers, one-shot audio, voice, movies, and media
cursors. Debug preview settles presentation waits and restores only this stable
projection.
