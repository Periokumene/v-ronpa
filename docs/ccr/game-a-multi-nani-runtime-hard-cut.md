# CCR: Game A Multi-Nani Runtime Hard Cut

> Status: accepted for the single-entry, multi-script VN subsystem upgrade.
> This CCR supersedes current-architecture claims that VN entries own one source
> file or that cross-script `@goto` is unsupported. Historical schema records
> remain historical and are not migration requirements.

## Decision

Game A exposes one VN entry, `vn:game-a-main`, backed by an ordered runtime
script catalog. The catalog contains renderer-agnostic records with
`scriptPath`, `sourceText`, and the semantic `scriptRevision`. Static Nani
endpoints are linked against that catalog before installation.

This change is a hard cut:

- `ContentManifest` is version 4 and `SaveData` is version 8.
- Game A and the harness use new v10 database namespaces.
- Manifest v3, SaveData v7, old database contents, old Devtools sessions, and
  the former single-script runtime API are rejected or ignored. They are never
  migrated, converted, aliased, forwarded, or copied.
- `scriptRevision` is an integrity token for current script content, save
  pointers, and Devtools candidates. It is not a historical conversion key.
- Pixi `revision` and HMR `updateId` remain in-process transaction counters.

## Public Contract Changes

### Entry and catalog

`VnEntryDef` becomes:

```ts
type VnEntryDef = {
  id: string;
  title: string;
  initialScriptPath: string;
  startLabel?: string;
  profile: "vn2d" | "vn3d";
  assetRefs: AssetRef[];
};
```

The runtime boundary introduces:

```ts
type VnRuntimeScriptSource = {
  scriptPath: string;
  sourceText: string;
  scriptRevision: string;
};

type VnRuntimeScriptCatalog = readonly VnRuntimeScriptSource[];
```

Catalog paths are unique. An entry identifies the experience and its initial
pointer; a catalog record identifies executable script content.

### Save state

`SaveableVnState` owns one script pointer:

```ts
type SaveableVnState = {
  entryId: string;
  script: { scriptPath: string; scriptRevision: string };
  story: SaveableStorySnapshot;
  pixiStage: PixiStageSnapshot;
  ui: VnUiSnapshot;
  media: PersistentMediaSnapshot;
};
```

`SaveableStorySnapshot` omits `currentScriptPath`. Restore validates game,
entry, registered script, revision, and instruction pointer before preparing
presentation resources or mutating runtime state.

### Runtime lifecycle and presentation

`VnLifecyclePort.startStory()` and `restoreVnState()` are asynchronous Result
transactions. Runtime creation receives one entry, one catalog, and an optional
renderer-agnostic `prepareScriptPresentation` callback. The runtime owns
catalog lookup, cancellation, stable-stop rules, and atomic commit.

Pixi presentation adds idempotent incremental character preparation. Repeated
and concurrent requests share prepared/in-flight work. A failed preparation
may leave reusable resource cache entries, but must not partially commit Story,
Pixi, UI, media, or the instruction pointer.

## Endpoint Grammar and Linking

The only supported static forms are:

```nani
@goto #LocalLabel
@goto game-a/chapter-02.nani
@goto game-a/chapter-02.nani#Start
@choice "Continue" goto:game-a/chapter-02.nani#Start
```

- `#Label` resolves in the current script.
- Cross-script endpoints use a registered full logical path ending in `.nani`.
- A missing label targets pointer 0; a present label must match exactly.
- `@goto` and `@choice goto:` use the same parser, linker, diagnostics, and
  runtime request.
- Relative paths, wildcards, expressions, malformed endpoints, unknown paths,
  and unknown labels are link errors. A Devtools candidate with these errors
  is blocked while the last-known-good catalog remains installed.
- Devtools authorizes a saved record only after matching Node/browser semantic
  revisions and relinking the complete candidate catalog. The generated source
  remains last-known-good content and need not be byte-identical to a newer
  verified save.
- `@end` completes the entry. Catalog order never implies navigation.

## Runtime Transaction Rules

Local jumps remain synchronous Story execution. Cross-script jumps stop with a
navigation request. The runtime resolves and prepares the target record,
switches the pure session while preserving variables/backlog/current text and
Story Play mode, clears choices and waits, then continues until a visible text,
choice, wait, or final end stop.

One user operation permits at most 32 consecutive cross-script requests. A
loop failure leaves the pre-operation runtime state unchanged. Navigation uses
the existing `cutscene` input lock, is not a stable stop, rejects checkpoints,
and treats repeated advance as a no-op. Reset, restore, unmount, and catalog
replacement invalidate late preparation results.

## Asset and App Ownership

The `asset.config.mjs` production script list is the sole source of catalog
membership. Generation emits sources, per-script revisions, asset references,
preload plans, and link diagnostics. Game A builds one app-owned manifest and
one registry from the deduplicated union of every production script plus
app-owned UI and bleep assets.

Game A owns one `GameAStoryDefinition`, not a drifting launch/plan pair. The
canonical runtime resets after final `@end`, then the existing flow machine
receives `RETURN_TITLE`. The harness exercises the same API with a one-record
catalog.

## Non-goals

- No legacy schema, storage, session, runtime, launch-definition, or manifest
  compatibility layer.
- No chapter browser, relationship graph, automatic next script, relative
  endpoint, wildcard, dynamic endpoint, `@gosub/@return`, or resource unloading.
- No second manifest, registry, resolver, runtime completion state, or page.
- No dependency changes.

## Acceptance

The task is accepted only when contract/linker, Story/Session, Runtime, Pixi,
save/load, Devtools, Game A E2E, and single-script harness regressions cover
normal and failure/no-op paths; generated docs and assets are current; visual
evidence covers the script selector, chapter-02 viewing/preview/restore; and the
full subsystem and baseline gates pass.
