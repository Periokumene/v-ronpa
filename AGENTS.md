# AGENTS.md

## Working Agreements

- Keep root guidance short; link to detailed docs instead of expanding this file.
- Treat `packages/contracts`, `packages/presentation-contracts`, and `.nani` IR as public API.
- Do not modify shared contracts from a module task without adding a Contract Change Request under `docs/ccr/`.
- Keep gameplay/state logic independent from React, R3F, Pixi, DOM, Dexie, and Howler.
- Treat `navi` and `trial` as the only primary playable modes; keep VN2D/VN3D as substates or presentation profiles.
- Keep Navi flow in `packages/navi-director` and Trial flow in `packages/trial-director`.
- Keep R3F and Pixi code inside adapter packages or `apps/game` harness code.
- DOM UI owns text-heavy menus, dialogs, inventory, and accessibility-sensitive interactions.
- Pixi owns VN/trial 2D effects, portrait staging, filters, particles, and fast debate overlays.
- R3F owns 3D exploration, round-table trial staging, camera rigs, and 3D interaction hotspots.

## Commands

- Install: `pnpm install`
- Typecheck: `pnpm typecheck`
- Project build: `pnpm build`
- Unit tests: `pnpm test`
- Contract validation: `pnpm validate:contracts`
- Boundary checks: `pnpm validate:boundaries`
- Task path checks: `BASE_REF=integration/v-ronpa-baseline pnpm validate:task-boundaries -- --task docs/tasks/<name>.md`
- Subsystem gate: `BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/<name>.md`
- Baseline gate: `pnpm validate:baseline`
- App dev server: `pnpm --filter @v-ronpa/game dev`
- Playwright smoke: `pnpm test:smoke`
- App production build: `pnpm --filter @v-ronpa/game build`

## Done When

- Relevant unit tests pass.
- `pnpm typecheck` passes.
- Contract snapshots are updated intentionally.
- Visual changes include Playwright screenshot evidence when they affect harness scenes.
- Diff stays inside assigned paths, unless the task explicitly includes a CCR.
- `package.json` and `pnpm-lock.yaml` stay unchanged unless the task card explicitly allows dependency changes.
- Subsystem branches run `validate:subsystem` with `BASE_REF=integration/v-ronpa-baseline`.

Detailed workflow: [docs/architecture/worktree-flow.md](docs/architecture/worktree-flow.md).
