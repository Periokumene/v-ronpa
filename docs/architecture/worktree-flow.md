# Worktree Flow

## Phase 1: Contract Baseline

Create or update the integration baseline with:

- public schemas
- package dependency directions
- ports and adapters
- fixtures
- harness gates
- AGENTS guidance
- task card templates

Reusable task-card templates live in `docs/templates/`. Concrete assigned
worktree task cards live in `docs/tasks/`.

## Phase 2: Integration Baseline

Merge the contract branch into an integration branch. Future module worktrees
start from that branch.

## Phase 3: Subsystem Worktrees

Preferred fan-out:

- `nani-parser`
- `story-engine`
- `story-play`
- `gameplay`
- `navi-director`
- `trial-director`
- `pixi-presenter`
- `r3f-adapter`
- `ui-kit`
- `harness`

See `docs/architecture/subsystem-fanout.md` for the first fan-out table.

Each worktree gets a strict task card. Worktrees should not share writable
paths unless the task card explicitly says so.

After creating or checking out a worktree, run:

```bash
pnpm setup:worktree-env
```

This creates the ignored `.env.worktree` consumed by Vite and Playwright for
per-worktree dev server ports. Do not commit generated environment, local
state, Playwright result, or report files.

Task cards must include:

- `Status`
- `Base Branch`
- `Branch Name`
- `Allowed Paths`
- `Forbidden Paths`
- `Contracts`
- `Dependency Changes`
- `Required Gates`
- `Review Packet`

`Status` is the lifecycle field used for queue and archive management. Allowed
states are `Draft`, `Ready`, `In Progress`, `Blocked`, `Review`, `Done`, and
`Archived`. When a task is merged, move its card from `docs/tasks/` to
`docs/archive/completed-tasks/`, set `State` to `Archived`, and fill
`Completed Commit`.

Before review, run:

```bash
BASE_REF=integration/v-ronpa-baseline pnpm validate:subsystem -- --task docs/tasks/<name>.md
```

This gate checks task path boundaries, CCR requirements, dependency direction,
TypeScript, contract tests, unit tests, app build, and smoke evidence.

## Phase 4: Contract Change Request

When a module needs a public contract change, stop and add a CCR under
`docs/ccr/`. The CCR must explain:

- requested contract change
- affected packages
- why the old contract cannot satisfy the task
- fixtures and tests to add or update
- expected migration or branch rebase impact

`pnpm validate:ccr` always compares against a base ref. Subsystem worktrees
should use `BASE_REF=integration/v-ronpa-baseline`; missing base refs must not
silently skip CCR checks.

## Phase 4.5: Dependency Changes

Dependency changes are forbidden by default. A task card must mark
`Dependency Changes` as `Allowed` before editing `package.json` or
`pnpm-lock.yaml`. Dependency direction is enforced by
`scripts/validate-boundaries.mjs` using the shared workspace dependency matrix.

## Phase 5: Fresh Review

Reviewer gate order:

1. contract compatibility
2. path boundary
3. tests and screenshots
4. implementation quality
5. residual risk
