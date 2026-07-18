# Nani Development Workbench

## Purpose and boundary

Game A mounts a development-only, read-only Nani workbench beside the game:

```text
VS Code save
  -> allowlisted Vite source event
  -> Node + browser parse/compile/revision check
  -> headless stable-state materialization
  -> app-owned atomic restore
  -> Story/Pixi/UI/persistent-media inspection
```

`app-vn-runtime/debug` owns source inspection, stable anchors, decision traces,
and materialization. `app-vn-devtools` owns the reusable controller hook,
latest-wins/serial-commit coordination, Dock, tab-session data, and Vite bridge.
Game A owns only the active launch definition (entry plus derived character
preload plan), flow transition, and atomic checkpoint commit.
Its product `App` module contains the ordinary game composition only; a
compile-time DEV branch lazy-loads a separate host module containing the entry
swap/restore transaction and Dock. `app-vn-shell` remains the product interaction
surface. Harness uses the explicit read-only runtime snapshot but does not mount
the workbench.

No workbench package imports Pixi presenter, Howler, Dexie, session orchestration,
or command dispatch directly. The product runtime hook does not call or construct
the debug hook; its explicit debug wrapper lives in a separate module. Game A
loads the transaction host and Dock only behind the development compile-time
branch, and static plus production-dist guards reject both wiring and marker
leakage.

## One execution authority

Inspection parses and compiles the current source and computes its canonical
semantic revision. Materialization starts at the entry's authored start label,
uses `stepVnSessionInstruction()` for Story behavior, and sends each result
through the same `projectVnRuntimeStep()` used by the live runtime. It never
mutates React state, renderers, media handles, saves, or browser storage.

Correct materialization means that the same entry, profile, route table, and
choice/input sequence produce the same saveable checkpoint at the same stable
position as normal play. The checkpoint contains Story, terminal Pixi, UI
visibility, BGM intent, and looping-SFX intent. Transient animation, waits,
hints/tasks, dialog reveal, toasts, one-shots, voice, movies, timers, and playback
cursors are intentionally absent.

The materializer returns a strict result union:

- `ready`: a complete stable checkpoint that the app may commit;
- `decision-required`: one choice group or input request for the Dock;
- `blocked`: a reason, diagnostics, and last stable location, with no partial
  checkpoint eligible for commit.

Presentation waits are settled with animation disabled. Host gameplay events,
expression failures, transient-only targets, invalid revisions, unreachable
targets, active unstable waits, cycles, and the 10,000-instruction limit block
commit. Catalog-stubbed commands retain their formal no-op behavior and mark the
result degraded.

## Anchors and decisions

A target is a serializable `VnDebugTargetAnchor`. Rematching uses explicit text
or choice identity first, then a unique label/type/source/context fingerprint.
Line and ordinal fallback is accepted only inside the same revision. Ambiguous,
deleted, or otherwise stale targets are invalid; the workbench never guesses a
nearby line after an edit.

Choice replay uses explicit choice identity first and a unique text/destination
pair second. One enabled choice is selected automatically. Multiple enabled
choices pause in the Dock. Inputs are prefilled from their authored default but
require explicit submission. Decisions live only in the current browser tab and
are discarded when semantic identity can no longer be proven.

## Source updates and atomic commit

The Vite bridge watches only configured `.nani` files. Its DEV virtual module
provides an initial Node-inspected source, diagnostics, and revision, so a manual
refresh uses the same two-sided verification as a later save. The initial
candidate must also match the app's active `?raw` source byte-for-byte; the Vite
bridge invalidates its virtual snapshot before awaiting HMR inspection, closing
the save/refresh race. Every HMR candidate
carries a monotonic update ID, current source, diagnostics, and a server revision.
The browser independently inspects the exact same source; a source or digest
disagreement blocks the candidate. Receiving an update synchronously freezes the
old source's Preview authority even before React paints its read-only state, so a
consumed update ID cannot be stolen by a stale click.

Newer updates supersede older inspections (whose late results are ignored), abort
older materializations, and invalidate superseded queued host mutations. Long
materializations yield in bounded instruction chunks so browser source events
and Escape cancellation can observe the abort before reaching the host commit
boundary. The browser rejects duplicate or out-of-order update IDs; all host
adoptions and commits share one serial queue. Cancellation is only a ticket up to
host acceptance: after `restoreVnState()` succeeds, that transaction is
irrevocable and finishes observing its new Story session before queued work runs.
Superseded queued work is skipped and the newest valid candidate runs next.
Compiler errors keep the last-known-good running launch and scene.

If a revision changes while a fixed point exists, Game A rematerializes that
anchor. Without a fixed point, an inactive runtime adopts the entry for the next
new game; an active runtime keeps the current entry until the developer chooses
a preview target. A semantic no-op source update refreshes line mapping without
reinstalling presentation state.

Game A is the only mutation authority. It installs a successful candidate by:

1. verifying the candidate again and deriving its layered-character preload plan
   from the same compiled script used for its revision;
   an equivalent plan reuses the installed plan reference so source-only or
   non-character changes do not remount Pixi;
2. holding the candidate launch definition and pending checkpoint together;
3. publishing controller acceptance only after async verification completes,
   atomically rendering that entry and plan, then calling `restoreVnState()`
   before paint;
4. rolling back the whole launch definition only if restore rejects before
   mutation;
5. treating successful restore as the non-cancellable linearization point,
   entering VN flow, and waiting for exactly one new presentation session before
   reporting success.

Restore validates game, entry, and revision before mutation. The workbench never
writes the save database, and it never stores checkpoints or source text.

## Dock and game viewport isolation

The desktop host gives a Game A preview cell `minmax(0, 1fr)` and a 420px Dock.
The Dock is resizable from 320px to 720px while capped at 45vw, becomes an
overlay below 900px, and collapses to a small status button. It remains outside
the product interaction shell, so authored UI visibility commands cannot hide
it.

The Dock never owns game dimensions or renderer resize. Game A's DEV host wraps
only the product playfield in an app-local preview frame with two explicit modes:

- `fidelity` is the default editing mode. The logical game viewport remains the
  browser viewport. Opening or resizing the Dock changes only a uniform display
  scale and centered letterboxing; it cannot reflow Story UI, change Pixi host
  geometry, remount the runtime, or alter a checkpoint.
- `responsive` is an intentional multi-resolution test mode. The remaining
  preview cell becomes the logical game viewport at scale 1. Game A DOM surfaces
  use playfield `cqw`/`cqh` units and a named container query, while Pixi reads
  the same playfield host through its existing `ResizeObserver`.

The preview frame, observer, transform, toolbar, and mode state are compiled only
through Game A's lazy DEV module. `GameAAppCore` exposes one optional app-internal
playfield wrapper; when omitted by the product path it emits the original
playfield directly, with no extra DOM, observer, storage, or DEV state. The
generic `app-vn-devtools` package remains unaware of Game A layout, Pixi, and
preview modes.

This separation is intentional: fidelity mode protects authored presentation
while editing Nani, and responsive mode exposes real container adaptation only
when the developer asks to test it. There is no Dock-specific Pixi resize path
and no second viewport state in runtime or saves.

Source browsing, search, label navigation, selection, and inspection are inert.
Only the explicit Preview action or a successful armed fixed-point update can
commit. The Dock distinguishes current execution and the fixed point, supports
keyboard preview and search focus, isolates Escape from the game shell, and can
copy `path:line` for use in the editor.

Parser and compiler diagnostics retain authored line/column locations. Outline
and diagnostic navigation clears an obstructing search when necessary, selects
the source line, and scrolls it into view. Presenter/asset warning or error
diagnostics promote the visible workbench status to `degraded`, including errors
that arrive asynchronously after a stable checkpoint was installed.

Per-tab session storage contains only collapsed state, width, fixed anchor, and
temporary decisions. On browser refresh these values trigger fresh Node/browser
source verification, inspection, and materialization. Source errors or handshake
mismatches after refresh show diagnostics and a neutral game surface rather than
restoring an unverified old visual scene.

## Explicit non-goals

The first version does not provide in-browser source editing, file writes,
editor integration, a command sandbox, real-time snippet replay, authored
fixtures, variable overrides, named route presets, a CLI, semantic debug URLs,
worker execution, persistent checkpoint graphs, host-state transactions, or new
Nani syntax. The wait command remains catalog-stubbed pending its timer and
pacing correctness project.
