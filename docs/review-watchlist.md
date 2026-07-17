# Architecture Review Watchlist

Review changes for these drift risks:

- flow context gaining derived interaction or save-operation state;
- app or shell code writing runtime facts back into flow;
- apps defining runtime-port lookalikes or spreading `useVnRuntime()`;
- dispatch/runtime importing presenter, or presenter interpreting RuntimeCommand;
- save code stripping waits instead of returning checkpoint rejection;
- restore ignoring game, entry, or script revision identity;
- persistent-media desired state drifting from command volume/stop semantics;
- lifecycle reset, accepted restore, or unmount bypassing runtime-exclusive
  port-wide media disposal;
- multiple AssetRegistry instances, provider resolver chains, or silent ID overrides;
- Game A product content containing CHECKPOINT/debug/test branches;
- app-specific pause behavior, fixed ports, or active docs describing superseded paths.

Canonical current-state references are under `docs/architecture/`. Relevant
change records are `interaction-vn-runtime-presentation-authority.md`,
`unified-media-save-slots-and-thumbnails.md` (except its superseded database
names), and `save-data-v7-vn-persistent-media.md`.

## Open Review TODOs

- [ ] Reintroduce AUTO/SKIP browser coverage as an independent test-only Nani
  entry. The former `vn-auto-skip.spec.ts`, Harness showcase branch, and
  `voiceSmoke` timing hook were removed on 2026-07-17 because real-time waits
  became unstable under WebGL contention. The replacement must use a
  deterministic clock, must not add commands or branches to product Nani or
  the general Harness showcase Nani, and must independently cover AUTO
  advance, manual takeover, overlay cancellation, SKIP-to-choice, Pixi wait
  settlement, and voice completion/failure. Existing headless unit coverage
  remains active while this browser item is open.
