# Architecture Review Watchlist

Review changes for these drift risks:

- flow context gaining derived interaction or save-operation state;
- app or shell code writing runtime facts back into flow;
- apps defining runtime-port lookalikes or spreading `useVnRuntime()`;
- dispatch/runtime importing presenter, or presenter interpreting RuntimeCommand;
- save code stripping waits instead of returning checkpoint rejection;
- restore ignoring game, entry, or script revision identity;
- multiple AssetRegistry instances, provider resolver chains, or silent ID overrides;
- Game A product content containing CHECKPOINT/debug/test branches;
- app-specific pause behavior, fixed ports, or active docs describing superseded paths.

Canonical references are under `docs/architecture/` and the two 2026-07-10 CCRs.
