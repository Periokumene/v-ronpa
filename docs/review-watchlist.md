# Architecture Review Watchlist

Review changes for these drift risks:

- flow context gaining derived interaction or save-operation state;
- app or shell code writing runtime facts back into flow;
- apps defining runtime-port lookalikes or spreading `useVnRuntime()`;
- dispatch/runtime importing presenter, or presenter interpreting RuntimeCommand;
- save code stripping waits instead of returning checkpoint rejection;
- restore ignoring game, entry, or script revision identity;
- entry-level source/revision fields, single-file runtime definitions, or a
  second endpoint parser reappearing beside the catalog linker;
- cross-script preparation mutating Story/Pixi/UI/media before its atomic commit;
- Devtools inferring executed scripts from fixed points, viewed files, or React
  renders instead of `VnStoryRuntime.executedScriptPaths`;
- per-script Preview authority, diagnostics, identity, or update badges leaking
  between catalog records;
- Game A reimplementing candidate validation, host commit/rollback/session
  settlement, or Pixi script preparation instead of using shared packages;
- entry identity, entry start, or catalog order being declared outside
  `asset.config.mjs` and generated outputs;
- Pixi presenter remounting when a per-script preload plan or catalog record changes;
- persistent-media desired state drifting from command volume/stop semantics;
- lifecycle reset, accepted restore, or unmount bypassing runtime-exclusive
  port-wide media disposal;
- multiple AssetRegistry instances, provider resolver chains, or silent ID overrides;
- Game A product content containing CHECKPOINT/debug/test branches;
- app-specific pause behavior, fixed ports, or active docs describing superseded paths.

Canonical current-state references are under `docs/architecture/`. Relevant
change records are `game-a-multi-nani-boundary-convergence-hard-cut.md`,
`game-a-multi-nani-runtime-hard-cut.md`, `interaction-vn-runtime-presentation-authority.md`,
`unified-media-save-slots-and-thumbnails.md` (except its superseded database
names), and `save-data-v7-vn-persistent-media.md`.

## Open Review TODOs

- [ ] Resolve the Settings v2 `preferFullscreen` placeholder. It currently has
  no browser effect by design. A future task must choose exactly one path:
  connect it to an explicit user-gesture-driven Fullscreen API flow, or remove
  it from the public Settings contract through the contract change process. Do
  not add opportunistic fullscreen behavior to the document browser policy.

- [ ] Reintroduce AUTO/SKIP browser coverage as an independent test-only Nani
  entry. The former `vn-auto-skip.spec.ts`, Harness showcase branch, and
  `voiceSmoke` timing hook were removed on 2026-07-17 because real-time waits
  became unstable under WebGL contention. The replacement must use a
  deterministic clock, must not add commands or branches to product Nani or
  the general Harness showcase Nani, and must independently cover AUTO
  advance, manual takeover, overlay cancellation, SKIP-to-choice, Pixi wait
  settlement, and voice completion/failure. Existing headless unit coverage
  remains active while this browser item is open.
