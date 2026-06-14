# Baseline Tooling Gates

## Base Branch

- `8017a50`

## Branch Name

- `integration/v-ronpa-baseline`

## Worktree Path

- `/Users/periokumene/.codex/worktrees/7c83/v-ronpa`

## Status

- State: `Archived`
- Owner: `Codex`
- Created: `2026-06-14`
- Updated: `2026-06-14`
- Completed Commit: `c678782`
- Archive Target: `docs/archive/completed-tasks/baseline-tooling-gates.md`

## Goal

Promote worktree, contract, dependency, and CCR rules from documentation into
repeatable local gates before subsystem fan-out starts.

## Context

This is a baseline hardening task, not a subsystem implementation task. It
extends the gate scripts and templates that future worktrees will use.

## Constraints

- Do not change public schemas or runtime contracts in this task.
- Keep scripts dependency-free so they work before package installation changes.
- Keep the dependency matrix readable in `scripts/validate-boundaries.mjs`.

## Allowed Paths

- `AGENTS.md`
- `docs/**`
- `package.json`
- `pnpm-lock.yaml`
- `scripts/**`
- `packages/story-engine/package.json`
- `packages/story-engine/tsconfig.json`

## Forbidden Paths

- `packages/contracts/**`
- `packages/presentation-contracts/**`
- `packages/nani-parser/src/types.ts`
- `apps/game/src/**`
- `packages/*/src/**`

## Contracts

- `allowedWorkspaceDeps` in `scripts/validate-boundaries.mjs`
- CCR base diff via `BASE_REF`
- Task card `Allowed Paths` and `Dependency Changes`

## Dependency Changes

Allowed: remove the stale `@v-ronpa/presentation-contracts` dependency from
`@v-ronpa/story-engine` so package dependencies match the boundary matrix.

## CCR Triggers

- Any change to public contract packages.
- Any change that weakens the dependency matrix.

## Required Gates

```bash
BASE_REF=8017a50 pnpm validate:subsystem -- --task docs/archive/completed-tasks/baseline-tooling-gates.md
pnpm validate:baseline
```

## Review Packet

- Boundary script diff.
- Task template diff.
- Gate output.

## Merge Target

- `integration/v-ronpa-baseline`

## Rollback Notes

Rollback is script-only unless the story-engine dependency cleanup has already
been used by a downstream branch.

## Done When

- The matrix validator checks source imports, `package.json`, and tsconfig references.
- Task path validation fails on out-of-scope files.
- CCR validation always uses a base ref.
- Baseline and subsystem one-shot gates pass.
