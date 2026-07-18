# ADR 0003: Handwritten Nani Parser With ParserPort

## Status

Superseded by [ADR 0005](0005-nani-source-provenance.md).

## Decision

Implement the first `.nani` parser as a handwritten lexer and recursive descent
parser. Expose `ParserPort`, AST, IR, diagnostics, and source locations as the
public parser contract.

## Rationale

The first contract needs to be small, readable, and easy for AI worktrees to
extend. A future Langium migration remains possible because downstream packages
depend on `ParserPort` and IR, not implementation details.

## Consequences

- The first parser supports only the baseline grammar.
- Parser snapshots become public API evidence.
- Langium migration must preserve the `ParserPort` output contract.

This section records the historical decision. The active parser contract no
longer exposes `ParserPort`; exact source provenance is carried by the required
sidecar described in ADR 0005.
