# VN / Game A Architecture Convergence

## Base Branch

- `integration/v-ronpa-baseline`

## Branch Name

- `codex/vn-architecture-convergence`

## Status

- State: `Completed`
- Owner: Codex
- Created: `2026-07-10`
- Completed: `2026-07-10`

## Goal

Land the approved production-grade, no-compatibility convergence of VN saves,
flow/pause authority, runtime ports, headless Pixi planning, shared Pixi assets,
Game A product/test content, worktree wiring, gates, tests, and active docs.

## Locked Constraints

- SaveData v5 and old runtime adapters were removed, not migrated.
- Gameplay state remains a shared top-level save domain.
- Navi/Trial directors were not rewritten and media playback state is not durable.
- `runtime-assets-pixi` remains an AssetRegistry fragment provider.

## Contracts

- CCR: `docs/ccr/save-data-v6-stable-vn-checkpoint.md`
- CCR: `docs/ccr/interaction-vn-runtime-presentation-authority.md`

## Delivered Result

- SaveData v6 identifies game, entry, and semantic script revision and only
  captures stable story, UI, and Pixi terminal checkpoints.
- Flow owns root mode, overlay stack, and resume target; interaction capability is
  synchronously derived instead of written back from runtime effects.
- Shells consume canonical named VN runtime ports; obsolete broad adapters and
  runtime dispatcher surfaces are gone.
- Pure Pixi command reduction lives in `pixi-stage-model`; renderer packages do
  not own runtime command semantics.
- Game A and Harness compose one AssetRegistry through the same provider protocol
  and worktree runtime resolver.
- Game A product `opening.nani` and test-only `smoke.nani` are statically separated.
- Cleanup gates and active architecture documents describe and enforce only the
  final design.

## Regression Coverage

- Flow pause/resume covers VN, Navi, Trial, repeated pause, nested sections, and
  missing resume targets.
- Stable saves succeed while input, movie, pause, UI, and Pixi waits reject.
- Restore rejects game, entry, and script revision mismatches.
- Pixi reducer goldens, task lifecycle, asset provider conformance, Manifest
  composition, production-content exclusion, and worktree ports are covered.
- Browser smoke covers Game A title/VN/pause/save/settings/Pixi/movie and Harness
  VN/Navi/Trial integration, including persisted save previews.

## Required Gates

```bash
pnpm typecheck
pnpm validate:contracts
pnpm test
pnpm validate:assets
pnpm validate:boundaries
pnpm validate:ccr
pnpm validate:app-cleanup
pnpm validate:vn-runtime-cleanup
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm test:smoke
pnpm validate:baseline
```

All listed gates and the browser screenshot inspection passed on the final tree on
`2026-07-10`.
