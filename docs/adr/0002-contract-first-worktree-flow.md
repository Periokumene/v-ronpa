# ADR 0002: Contract-First Worktree Flow

## Status

Accepted

## Decision

Freeze public contracts and harness gates before subsystem worktrees fan out.
Module worktrees must not edit shared contracts without a CCR.

## Rationale

AI-parallel development is safest when each worktree has a stable contract and
verification signal. This follows Codex best practices: clear context, durable
instructions, scoped tasks, validation, and review.

## Consequences

- Contract changes are slower but explicit.
- Module tasks become easier to review.
- Fresh reviewers can gate contract compatibility before implementation style.
