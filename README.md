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
pnpm validate:nani-diagnostics-quality
pnpm --filter @v-ronpa/game-a build
pnpm --filter @v-ronpa/game-harness build
pnpm --filter @v-ronpa/game-a dev
pnpm --filter @v-ronpa/game-harness dev
```

## Workspace Shape

- `apps/game-a`: VN-first framework app for continued visual novel development. It owns a separate content manifest, Nani entry, and `/game-a/**` public assets; it mounts VN shell/Pixi adapter surfaces through `AssetRegistry` runtime asset ids only, uses `media-save` for unified save slots, and exposes a DEV-only read-only Nani workbench without connecting Navi, Trial, or R3F.
- `apps/game-harness`: integrated showcase game and smoke/gate target for VN, Navi, Trial, Pixi, R3F, save/load, media, settings, and debug surfaces.
- `packages/app-vn-session`: headless VN entry/session layer for parsing already-loaded `.nani` source, compiling `RuntimeScript`, stepping StoryEngine/story-play state, choice/input/wait helpers, and session-local restore snapshots.
- `packages/app-vn-dispatch`: headless RuntimeCommand routing/transaction helpers plus VN media/UI/dialog reveal/dialog audio planners.
- `packages/app-vn-runtime`: canonical product ports, live VN orchestration, stable checkpoint lifecycle, shared pure projection, and an explicit debug-only inspection/materialization entry.
- `packages/app-vn-devtools`: reusable Nani workbench controller, read-only Dock, tab-session state, latest-wins source coordination, and the Vite bridge used only by Game A development builds.
- `packages/app-vn-shell`: React VN shell and Pixi host mounting, reusable settings adapter, shared save-slot controller, and shell action/save-load helpers; app-specific overlay pages stay in apps.
- `packages/contracts`: Zod schemas and public content/runtime contracts.
- `packages/nani-parser`: handwritten `.nani` lexer/parser, public IR, and
  required exact-source provenance sidecar used by compiler diagnostics.
- `packages/nani-runtime-compiler`: catalog-aware binding, validation, and
  RuntimeScript lowering; consumes parser IR and source provenance together,
  with ordered `CommandIR.args` as its sole binding authority, and owns the
  canonical semantic serializer shared by generated and browser revisions.
- `packages/story-engine`: story reducer, variables, choices, waits, emitted RuntimeCommands, and backlog.
- `packages/game-flow-machine`: XState top-level mode machine.
- `packages/gameplay`: exploration, inventory/evidence, character, trial domain logic.
- `packages/navi-director`: Navi walk, interaction, inventory, and VN2D overlay state flow.
- `packages/trial-director`: Trial segment, presentation profile, truth bullet, timeout, and evidence flow.
- `packages/media-save`: Unified Dexie save-slot storage, thumbnail preview storage/policy, Howler audio, and HTMLVideo adapters.
- `packages/pixi-presenter`: Pixi canvas adapter for VN/trial 2D effects.
- `packages/r3f-adapter`: R3F adapter for 3D exploration and trial stage.
- `packages/ui-kit`: Radix/CSS-ready DOM HUD, dialog, tabs, inspector primitives.

See [docs/architecture/system-guide.md](docs/architecture/system-guide.md) for
the full architecture and [AGENTS.md](AGENTS.md) for agent-facing rules.
