# Nani Development Workbench

## Purpose and boundary

Game A mounts a development-only, read-only Nani workbench beside the game:

```text
VS Code save
  -> directory-discovered Vite snapshot or source event
  -> Node + browser parse/compile/revision check
  -> headless stable-state materialization
  -> shared host transaction + app policy callback
  -> Story/Pixi/UI/persistent-media inspection
```

`app-vn-runtime/debug` owns source inspection, stable anchors, decision traces,
materialization, and materialization provenance. `app-vn-devtools` owns the
reusable controller hook, per-script authority coordinator, HMR impact
classification, latest-wins/serial host transaction, definition rollback,
Dock, tab-session data, and Vite bridge. Game A owns only one story definition
(entry, runtime catalog, and character plans by script path), the lightweight
candidate-plan decorator, `gameId`, flow transition, diagnostics, and layout.
Its product `App` module contains the ordinary game composition only; a
compile-time DEV branch lazy-loads a separate host module which calls the shared
transaction hook and mounts the Dock. `app-vn-shell` owns product interaction
and Pixi script-presentation preparation.
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
semantic revision. Every call selects one explicit materialization mode:

- `fast-current-script` is the Devtools default. It cold-starts Story, Pixi, UI,
  and media from the viewed script, using the entry `startLabel` only for the
  entry initial script and pointer `0` otherwise. Local labels, choices, and
  inputs retain normal session behavior. Cross-script navigation returns
  `fast-cross-script-navigation` without a partial checkpoint.
- `canonical-entry` retains authored-path replay from the entry initial script
  and `startLabel`, including complete-catalog links and tab-local decisions.

Both modes use `stepVnSessionInstruction()` and the live runtime's
`projectVnRuntimeStep()`. Only boot and navigation policy differ; there is no
second interpreter. Materialization never mutates React state, renderers, media
handles, saves, or browser storage.

Canonical materialization means that the same entry, profile, route table, and
choice/input sequence produce the same saveable checkpoint at the same stable
position as normal play. The checkpoint contains Story, terminal Pixi, UI
visibility, BGM intent, and looping-SFX intent. Transient animation, waits,
hints/tasks, StoryText reveal, toasts, one-shots, voice, movies, timers, and playback
cursors are intentionally absent. It follows the same linked catalog endpoints
and tab-local decision trace across scripts, so a later-file target contains all
preceding Story/Pixi/UI/media state.

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

The Vite bridge asks `nani-project` for one complete snapshot. Normal
development contains the production+development union; test modes contain the
shared test catalog and select different explicit entries. Each discovered
record includes scope, source, semantic revision, execution disposition,
diagnostics, asset references, and character preload planning. The DEV wrapper
constructs the complete initial story definition from this snapshot before
mounting runtime, so ordinary cross-file navigation does not depend on Preview
first.

Game A's physical scope roots are `src/nani`, `src/nani-dev`, and
`src/nani-test`. Vite never derives these names independently: scanning,
watching, source-to-logical-path mapping, and dirty-event classification all
consume the `sourceRoot` values from `asset.config.mjs`.

A source edit retains monotonic HMR behavior. The bridge invalidates its virtual
snapshot before awaiting HMR inspection, closing the save/refresh race, while
Node's semantic revision, the browser's independent semantic revision, and
current-script diagnostics establish `verified-local` authority for FastDebug
calculation. Canonical calculation and every adoption still require complete
catalog validation. Every HMR candidate
carries a monotonic update ID, current source, diagnostics, and a server revision.
Parser/compiler diagnostics carry their original half-open UTF-16 `TextSpan`
through the Vite protocol; bridge failures without a source token remain
location-free rather than receiving a guessed span.
The browser independently inspects the exact same source; a digest disagreement
blocks all calculation. A broken catalog endpoint may still permit isolated Fast
calculation, but the shared host transaction validates the full catalog again and
rejects installation without changing the active scene. Receiving an update synchronously freezes the
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
Adding, deleting, or renaming a managed `.nani` sends a catalog-dirty event
instead of mutating the current catalog. Workbench shows a refresh-required
banner and freezes every Preview/adoption while the last-known-good scene keeps
running. The Refresh button reloads the page; startup rescans the directory and
clears dirty state. No generator command or Vite restart is required.

Fatal files stay visible in the source index and Problems but never enter the
runnable catalog, and all of their Preview targets are disabled. Recoverable
compiler-command errors stay red and show Recovered/Degraded; the removed line
cannot be previewed, while valid commands can run through normal flow and
FastDebug. Parser errors, duplicate labels, start-label errors, invalid links,
and missing cross-file targets remain fatal. Compiler or catalog-link failures
keep the last-known-good catalog record and scene.

The runtime exposes the ordered, deduplicated script paths that actually
contributed to the current story session. This includes intermediate scripts
crossed without a React render; restore starts a new history containing only
the restored script, and reset clears it. The controller consumes that history
instead of inferring visits from viewed files, fixed points, or React renders.
If the current or an already-executed script changes, an existing fixed point is
rematerialized through the candidate catalog; without a fixed point, the
last-known-good catalog remains installed until the user chooses a Preview
target. A valid update to a script not involved in the current session replaces
only that catalog record for a future goto. Candidate revision authentication
always applies to the updated record, even when the fixed-point target belongs
to another script. A semantic no-op update remaps a fixed anchor only when the
anchor belongs to that record; fixed points in other scripts are unaffected.
After a FastDebug install, only that result's current-script
`executedScriptPaths` participates in fixed-point HMR impact; entry/upstream
paths from the scene that existed before the Fast restore do not trigger replay.

One pure per-script authority coordinator owns installed candidate identities,
expected host identities, inspection/status/diagnostic caches, Preview
authorization, and update badges. Switching `viewedScriptPath` changes
Workbench state only: it never replays,
remaps, or invalidates a fixed point owned by another script. A persisted fixed
point is restored once at controller boot through the complete catalog, even if
the tab reopens while viewing a different script. Once source/revision/catalog
verification succeeds, a failed or stale fixed-point restore does not turn the
verified source into an untrusted single-script mapping.

The shared `useVnDevtoolsHostTransaction()` is the only host mutation mechanism.
It installs a successful candidate by:

1. verifying the complete candidate catalog again, then invoking an app policy
   callback; Game A's callback only derives that script's layered-character plan
   from the already-verified inspection;
   an equivalent plan reuses the installed plan reference so source-only or
   non-character changes do not remount Pixi;
2. holding the candidate catalog record and pending checkpoint together;
3. publishing controller acceptance only after async verification completes,
   rendering that definition, then awaiting `restoreVnState()` without
   a partial Story/Pixi/UI/media commit;
4. rolling back the whole story definition only if restore rejects before
   mutation;
5. treating successful restore as the non-cancellable linearization point,
   entering VN flow, and waiting for exactly one new presentation session before
   reporting success.

`useVnDevtoolsDefinitionState()` owns the active definition, synchronized ref,
pending definition, and rollback owner. Restore validates game, entry, and
revision before mutation. The workbench never
writes the save database, and it never stores checkpoints or source text.

## Source-first IDE workspace

`app-vn-devtools` renders one fixed-height IDE grid rather than a vertically
scrolling form:

```text
file + phase
command strip
Source > #nearest-label > Ln N
independently scrolling full source
resizable Problems / State / transient Branch panel
revision + current + pin + update + message status bar
```

The file bar exposes an accessible, keyboard-operated script listbox. The
controller keeps `viewedScriptPath` separate from the runtime's
`currentScriptPath`; selecting a file changes only inspection state and records
the viewed path in the v4 tab session.

The source is always the main stage and always keeps every authored line in its
original order. IDE Find matches source characters, labels, command metadata,
and line numbers without filtering the source model. Exact source hits carry
character ranges for highlighting; metadata-only hits highlight the line. Find
keeps a local current/total cursor and supports Enter/Shift+Enter cycling.
Symbols are a searchable label popover reached from the current-label
breadcrumb. Neither tool changes Story or clears the other tool's query.

Syntax coloring is a presentational lexer only. Its label, leading-command,
speaker, and string spans concatenate byte-for-byte to `sourceText` and are
never used by inspection, anchors, previewability, or materialization. The
source view keeps contextual Run-to-line controls and uses `content-visibility`
for long scripts without introducing a virtual list, Monaco, Worker, or second
source authority.

Parser/compiler diagnostic spans are mapped from absolute candidate offsets to
line-local ranges only after the controller has the exact `sourceText`. The
source view renders diagnostic waves and Find marks as independent layers, so
they may overlap without changing syntax tokens or source characters. Overlap
uses error over warning over information for the underline color. Diagnostics
from assets, media, bridge failures, and other non-source authorities may still
navigate at line granularity when they have a line, but never synthesize an
exact token range.

The bottom tool area uses an internal descriptor registry:

- `Problems` contains the current blocked/error operation plus parser,
  compiler, runtime, and asset diagnostics. Errors and blocked work open it;
  warnings update its count without stealing focus.
- `State` shows compact read-only Story, Pixi, UI, and persistent-media trees.
  An explicit preview opens it before materialization.
- `Branch` is a transient forced panel. It appears only while a choice or input
  decision is pending, preserves native radio/input semantics, and returns to
  the previously persisted State/Problems page after completion.

The primary command reflects actual transaction state: Preview when the selected
line can produce a stable result; Cancel only while inspection, source update,
or pre-acceptance materialization owns an abortable task; disabled Finishing
after the host has accepted a checkpoint; and Resolve decision while Branch
needs focus. The host-acceptance boundary is therefore visible and never
pretends that an accepted restore can be rolled back.

The command strip also owns an always-visible `FastDebug` button with native
`aria-pressed` semantics and an explicit `FAST`/`ENTRY` label. Switching mode
cancels pre-acceptance debug work, clears the fixed point and decision trace, and
changes only the next Preview. It is disabled after host acceptance until the
restore settles; switching never resets or restores the current game scene.

Layout persistence is schema v4 and is a hard cut: v3 and older values are ignored rather
than migrated. A tab stores only collapsed state, Dock width, viewed script path, bottom-panel open
state, persisted State/Problems page, clamped `120–360px` panel height, fixed
anchor, temporary decision trace, and the selected materialization mode. The
first v4 session defaults to FastDebug; later refreshes retain the last mode.
Search, current match, selected line,
Symbols/Find popovers, source, diagnostics, and checkpoints are never persisted.
Selection rematches through its stable anchor when source mapping changes; when
that is impossible it falls back to current, pinned, then the first previewable
line, never the old line number.

The Dock uses Phosphor icons and the existing dark VN tooling palette. Container
queries change command density at 520px and 400px without changing the width
contract: the default remains 504px, the range remains 320–720px, and desktop
width remains capped at 45vw. Below 900px it remains an overlay.

The internal descriptor registry is deliberately not a public plugin API.
Future Harness or host read-only panels may justify a constrained contribution
surface, but the title bar, source rows, runtime state, and mutation actions do
not expose slots pre-emptively.

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

Source browsing, Find, Symbols navigation, selection, panel navigation, and
inspection are inert.
Only the explicit Preview action or a successful armed fixed-point update can
commit. The Dock distinguishes current execution and the fixed point, supports
keyboard preview/Find/Symbols/panel shortcuts, isolates Escape from the game
shell, and can copy `path:line` for use in the editor. Clipboard completion is
reported only after the browser confirms success; failure opens Problems.

Parser and compiler diagnostics retain authored line/column locations and exact
UTF-16 spans. Server/browser copies deduplicate by span as well as code,
severity, and message, so separate tokens on one line stay separate. Symbols
and diagnostic navigation preserve Find, select the source line, scroll it into
view, and leave the exact token underline visible. Presenter/asset warning or error
diagnostics promote the visible workbench status to `degraded`, including errors
that arrive asynchronously after a stable checkpoint was installed.

On browser refresh the v3 session values trigger fresh Node/browser source
verification, full-catalog linking, anchor resolution, and materialization. Source errors
or handshake mismatches after refresh show diagnostics and a neutral game
surface rather than restoring an unverified old visual scene.

## Explicit non-goals

The workbench does not provide in-browser source editing, file writes,
editor integration, a command sandbox, real-time snippet replay, authored
fixtures, variable overrides, named route presets, a CLI, semantic debug URLs,
worker execution, persistent checkpoint graphs, chapter trees, script graphs,
dynamic endpoints, host-state transactions, or new Nani syntax.
