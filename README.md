# v-ronpa

V-Ronpa is a browser-first mystery game baseline inspired by visual novel,
3D exploration, and class-trial style debate loops.

This repository is intentionally contract-first. The first milestone freezes
package boundaries, public schemas, fixtures, and harness gates so later Codex
worktrees can develop subsystem packages in parallel without reshaping the
shared foundation.

## Quick Start

```bash
corepack enable pnpm
pnpm install
pnpm validate:baseline
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm --filter @v-ronpa/game-a dev
pnpm --filter @v-ronpa/game-harness dev
```

## Workspace Shape

- `apps/game-a`: VN-first framework app for continued visual novel development. It owns a separate content manifest, inline VN script source, and `/game-a/**` public assets; it mounts VN shell/Pixi adapter surfaces through `AssetRegistry` runtime asset ids only and does not connect Navi, Trial, R3F, or `media-save`.
- `apps/game-harness`: integrated showcase game and smoke/gate target for VN, Navi, Trial, Pixi, R3F, save/load, media, settings, and debug surfaces.
- `packages/app-vn-session`: headless VN entry/session layer for parsing already-loaded `.nani` source, compiling `RuntimeScript`, stepping StoryEngine/story-play state, choice/input/wait helpers, and session-local restore snapshots.
- `packages/app-vn-dispatch`: headless RuntimeCommand routing/transaction helpers plus VN media/UI/dialog reveal/dialog audio planners.
- `packages/app-vn-shell`: React VN shell, `VnRuntimeDispatcher`/`PixiLayer` mounting, reusable settings adapter, and shell action/save-load helpers; app-specific overlay pages stay in apps.
- `packages/contracts`: Zod schemas and public content/runtime contracts.
- `packages/nani-parser`: handwritten `.nani` lexer/parser and AST/IR contract.
- `packages/story-engine`: story reducer, variables, choices, waits, emitted RuntimeCommands, and backlog.
- `packages/game-flow-machine`: XState top-level mode machine.
- `packages/gameplay`: exploration, inventory/evidence, character, trial domain logic.
- `packages/navi-director`: Navi walk, interaction, inventory, and VN2D overlay state flow.
- `packages/trial-director`: Trial segment, presentation profile, truth bullet, timeout, and evidence flow.
- `packages/media-save`: Dexie/Howler/HTMLVideo persistence and media adapters.
- `packages/pixi-presenter`: Pixi canvas adapter for VN/trial 2D effects.
- `packages/r3f-adapter`: R3F adapter for 3D exploration and trial stage.
- `packages/ui-kit`: Radix/CSS-ready DOM HUD, dialog, tabs, inspector primitives.

See [docs/architecture/system-guide.md](docs/architecture/system-guide.md) for
the full architecture and [AGENTS.md](AGENTS.md) for agent-facing rules.
