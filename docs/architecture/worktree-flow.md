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

## Phase 2: Integration Baseline

Merge the contract branch into an integration branch. Future module worktrees
start from that branch.

## Phase 3: Subsystem Worktrees

Preferred fan-out:

- `nani-parser`
- `story-engine`
- `gameplay`
- `pixi-presenter`
- `r3f-adapter`
- `ui-kit`
- `harness`

Each worktree gets a strict task card. Worktrees should not share writable
paths unless the task card explicitly says so.

## Phase 4: Contract Change Request

When a module needs a public contract change, stop and add a CCR under
`docs/ccr/`. The CCR must explain:

- requested contract change
- affected packages
- why the old contract cannot satisfy the task
- fixtures and tests to add or update
- expected migration or branch rebase impact

## Phase 5: Fresh Review

Reviewer gate order:

1. contract compatibility
2. path boundary
3. tests and screenshots
4. implementation quality
5. residual risk
