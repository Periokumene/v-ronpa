# CCR: Game A Multi-Nani Boundary Convergence Hard Cut

> Status: accepted for the follow-up subsystem convergence on top of the
> multi-Nani runtime hard cut. This CCR supersedes only the app/Devtools host
> ownership and duplicated entry-locator portions of the earlier CCR.

## Decision

The VN runtime is the sole authority for scripts executed by the current
runtime session. Devtools consumes that read-only history when classifying HMR
updates; it must not infer execution history from React renders or fixed-point
presence.

`app-vn-devtools` owns candidate verification, per-script inspection authority,
serial host transactions, rollback before restore, and settlement after the
new Story session is observable. Game A supplies only story-definition
decoration, the `game-a` restore identity, Flow entry, and diagnostics policy.

`app-vn-shell` owns the Pixi script-preparation adapter. Asset configuration is
the only authority for entry identity, entry start, production catalog
membership, and named test catalog membership; generated modules expose the
ordered catalogs and locators consumed by apps.

## Public Hard Cuts

- `VnStoryRuntime.executedScriptPaths` exposes ordered, unique runtime-owned
  execution history. It is runtime observation, not save data.
- Debug inspection uses `inspectVnDebugScript` and
  `VnDebugScriptInspection`. The former entry-named API is removed.
- `PrepareVnScriptPresentation` receives only `scriptPath`, optional saved Pixi
  state, and `AbortSignal`; the unused preparation reason is removed.
- `VnRuntimeDefinition` is the shared entry/catalog composition shape.
- Devtools update impact is `next-start`, `future-navigation`, or
  `executed-session`. A fixed point selects the response to an executed-session
  update but never changes which scripts affected the session.
- Devtools exposes reusable definition-state and host-transaction hooks. No
  app-local clone of their commit protocol remains.

No deprecated exports, aliases, compatibility adapters, migration, or
forwarding layers are provided.

## Persistence And Non-goals

Manifest v4, SaveData v8, DB v10, and Devtools session v3 remain unchanged.
Executed-script history and debug materialization provenance are not persisted
in saves. This change does not add chapter UI, dynamic endpoints, asset
unloading, or dependencies.

## Acceptance

Package tests must cover runtime execution history across invisible chained
scripts, HMR impact classification with and without fixed points, per-script
inspection authority, host transaction rollback/settlement, and Pixi script
preparation. Browser smoke must prove chapter-02 remains previewable before and
after normal navigation and that an unexecuted-script update does not restore
or mutate the current stage.
