# Worktree Flow

Run `pnpm setup:worktree-env` once per worktree. `.env.worktree` stores one base
port. `resolveWorktreeAppRuntimeEnv()` applies stable offsets:

- `game-harness`: base + 0
- `game-a`: base + 1

Both Vite configs and Playwright use this resolver and `strictPort: true`; apps
must not add fixed-port exceptions. Do not commit `.env.worktree`, `.local-state`,
`test-results`, or `playwright-report`.

Automated Playwright gates do not reuse an existing server even when its port
responds: launch flags such as `VITE_ENABLE_TEST_ENTRIES=1` are part of the
test environment and cannot be inferred from HTTP readiness. Stop a manually
started server before running smoke on the same worktree port.

On macOS the smoke configuration selects ANGLE Metal and permits two workers;
other platforms fall back to one worker. Do not override this with a global
worker count unless the target WebGL backend has been qualified. Use
`--trace on` only for a focused failing scenario, not for the default full
gate.

Contract changes require a CCR. Concrete worktree work requires a task card.
Behavior changes require narrow unit tests first and Playwright evidence when an
app or visual surface changes. Finish with the task-specific gate and
`pnpm validate:baseline`.
