# ADR 0004: XState For Game Flow, Reducer For Story Semantics

## Status

Accepted

## Decision

Use XState for top-level game modes and a typed event reducer for StoryEngine
semantics.

## Rationale

Top-level mode transitions benefit from explicit statecharts. Story execution,
fixtures, snapshots, and replay benefit from serializable reducer state.

## Consequences

- XState must not contain renderer objects.
- StoryEngine events must be serializable.
- Save data stores runtime state, not presentation instances.
