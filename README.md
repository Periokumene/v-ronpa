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
pnpm test
pnpm typecheck
pnpm --filter @v-ronpa/game build
pnpm test:smoke
pnpm --filter @v-ronpa/game dev
```

## Workspace Shape

- `apps/game`: browser harness with two primary modes: Navi and Trial.
- `packages/contracts`: Zod schemas and public content/runtime contracts.
- `packages/nani-parser`: handwritten `.nani` lexer/parser and AST/IR contract.
- `packages/story-engine`: command registry, story reducer, performs, backlog.
- `packages/game-flow-machine`: XState top-level mode machine.
- `packages/gameplay`: exploration, inventory/evidence, character, trial domain logic.
- `packages/navi-director`: Navi walk, interaction, inventory, and VN2D overlay state flow.
- `packages/trial-director`: Trial segment, presentation profile, truth bullet, timeout, and evidence flow.
- `packages/media-save`: Dexie/Howler/HTMLVideo persistence and media adapters.
- `packages/presentation-contracts`: renderer-independent presentation ports.
- `packages/pixi-presenter`: Pixi canvas adapter for VN/trial 2D effects.
- `packages/r3f-adapter`: R3F adapter for 3D exploration and trial stage.
- `packages/ui-kit`: Radix/CSS-ready DOM HUD, dialog, tabs, inspector primitives.

See [docs/architecture/system-guide.md](docs/architecture/system-guide.md) for
the full architecture and [AGENTS.md](AGENTS.md) for agent-facing rules.
