# Worktree Task Card Template

## Goal

State the concrete outcome.

## Context

Reference relevant docs, packages, fixtures, and previous decisions.

## Constraints

List architectural rules and non-goals.

## Allowed Paths

- `packages/example/**`

## Forbidden Paths

- `packages/contracts/**` unless this task explicitly includes a CCR.

## Contracts

Name public schemas, ports, events, or fixtures this task must honor.

## Tests

```bash
pnpm typecheck
pnpm test
pnpm validate:boundaries
```

Add package-specific commands here.

## Done When

- Tests pass.
- Diff stays inside allowed paths.
- Public contract changes have a CCR.
- Summary includes changed files, verification, and residual risks.
