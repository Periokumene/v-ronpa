# AGENTS.md

## Working Agreements

- Keep root guidance short; link to detailed docs instead of expanding this file.
- Treat `packages/contracts` and `.nani` IR as public API.
- Do not modify shared contracts from a module task without adding a Contract Change Request under `docs/ccr/`.
- Keep gameplay/state logic independent from React, R3F, Pixi, DOM, Dexie, and Howler.
- Treat `vn`, `navi`, and `trial` as primary playable modes; keep VN2D/VN3D as VN presentation profiles or Navi/Trial substates where appropriate.
- Keep Navi flow in `packages/navi-director` and Trial flow in `packages/trial-director`.
- Keep VN session orchestration in `packages/app-vn-session`, VN command fanout in `packages/app-vn-dispatch`, and React VN shell mounting in `packages/app-vn-shell`.
- Keep Pixi command reduction and wait descriptors in `packages/pixi-stage-model`; dispatch/runtime must not import `pixi-presenter`.
- Treat `VnRuntimeShellPort`, `VnPresentationPort`, `VnLifecyclePort`, and `VnDiagnosticsPort` as the only product VN runtime boundary. Harness diagnostics use the explicit debug entry.
- Create saves only through stable VN checkpoints and validate `gameId`, `entryId`, and `scriptRevision` before restore.
- Compose generated assets and `runtime-assets-*` fragments into one app-owned ContentManifest and one AssetRegistry. Providers cannot export registries, resolvers, loaders, or full manifests.
- Keep raw R3F/Pixi renderer code inside adapter packages or `apps/game-harness` harness code; `apps/game-a` may mount canonical VN shell/Pixi host surfaces and use `packages/media-save` ports, but must not import session/dispatch/presenter, `three`, `@react-three/*`, `pixi.js`, `@pixi/*`, Dexie, Howler, Navi, or Trial packages directly.
- Keep app-specific flow/save/overlay wiring in app packages such as `apps/game-harness`; shared VN packages expose shell surfaces and headless dispatch helpers only.
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
- VN app dev server: `pnpm --filter @v-ronpa/game-a dev`
- Harness dev server: `pnpm --filter @v-ronpa/game-harness dev`
- Playwright smoke: `pnpm test:smoke`
- VN app production build: `pnpm --filter @v-ronpa/game-a build`
- Harness production build: `pnpm --filter @v-ronpa/game-harness build`

## Testing And Regression Expectations

- Every behavior-changing task must add or update tests for the changed behavior.
- Do not treat existing green tests as sufficient when the task adds a new public helper, state transition, parser shape, command, selector, presenter behavior, or harness route.
- Prefer the narrowest useful test first: package unit tests for pure logic, contract/snapshot tests for public schemas and IR, and Playwright smoke only when app or visual behavior changes.
- Each task card must name its required regression cases and say where they should live.
- Tests should cover at least one normal path and one boundary, invalid, no-op, or rejection path for each new public behavior.
- Tests should be readable as examples for downstream worktrees; avoid asserting only implementation details when public behavior can be asserted.
- If a task cannot add a needed regression test inside its allowed paths, stop and call that out in the review packet or create a follow-up integration/harness task.

## Done When

- Relevant unit tests pass.
- `pnpm typecheck` passes.
- Required task-specific regression tests are added or intentionally documented as out of scope.
- Contract snapshots are updated intentionally.
- Visual changes include Playwright screenshot evidence when they affect harness scenes.
- Diff stays inside assigned paths, unless the task explicitly includes a CCR.
- `package.json` and `pnpm-lock.yaml` stay unchanged unless the task card explicitly allows dependency changes.
- Subsystem branches run `validate:subsystem` with `BASE_REF=integration/v-ronpa-baseline`.
- Put only concrete worktree task cards in `docs/tasks/`; use `docs/templates/worktree-task-card.md` as the source template.

Detailed workflow: [docs/architecture/worktree-flow.md](docs/architecture/worktree-flow.md).
