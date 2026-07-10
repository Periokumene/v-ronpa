# Worktree Flow

Run `pnpm setup:worktree-env` once per worktree. `.env.worktree` stores one base
port. `resolveWorktreeAppRuntimeEnv()` applies stable offsets:

- `game-harness`: base + 0
- `game-a`: base + 1

Both Vite configs and Playwright use this resolver and `strictPort: true`; apps
must not add fixed-port exceptions. Do not commit `.env.worktree`, `.local-state`,
`test-results`, or `playwright-report`.

Contract changes require a CCR. Concrete worktree work requires a task card.
Behavior changes require narrow unit tests first and Playwright evidence when an
app or visual surface changes. Finish with the task-specific gate and
`pnpm validate:baseline`.
