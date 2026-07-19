# ADR 0005: Nani Source Provenance Sidecar

## Status

Accepted

## Context

The handwritten parser produces the correct semantic IR but destroys exact
source offsets while trimming, splitting, unquoting, unescaping, removing inline
commands/text IDs, and lowering rich text. Compiler diagnostics therefore lack
precise locations and editor tooling maintains an inaccurate second mapping path.

## Decision

Keep the handwritten parser and the `parser -> ScenarioIR -> compiler` boundary,
but make a source-provenance sidecar part of the only parser result and the only
compiler input.

- `TextSpan` is an original-source UTF-16 `[start, end)` range.
- `NaniSourceMap` indexes semantic source parts by statement/argument/token
  occurrence and never copies the complete source text. Statement-kind and
  structural-index checks make forged or corrupt refs invariant failures.
- Parser internals use a short-lived segmented `SourcedText` projection while
  producing cooked values and rich text.
- Parser and compiler diagnostics contain the final exact span; adapters do not
  infer ranges from messages, line numbers, or source searches.
- `ScenarioIR`, runtime commands, runtime scripts, and saves contain no new
  provenance fields.
- `CommandIR.args` is the compiler binding authority; its derived projections
  are not accepted as alternative input.

## Alternatives Rejected

- Optional spans or a `Detailed` API would preserve two standards.
- A compatibility overload from bare IR would allow mismatched/missing source maps.
- Full CST, Tree-sitter, LSP, or a second grammar is unnecessary for semantic
  diagnostic provenance and would increase ownership and synchronization cost.
- Extension-side `indexOf`, regex, or whole-line fallback cannot distinguish
  repeated/cooked tokens and is therefore removed.

## Consequences

- Parser/compiler public APIs change once and all consumers migrate atomically.
- Source mapping has a bounded memory/runtime cost. Deterministic
  catalog/invalid-input stress and the warmed 50-run corpus/synthetic benchmark
  are versioned repository gates rather than one-off review commands.
- Completion, hover, resource discovery, and TextMate coloring remain separate
  cursor/presentation helpers; they are not validation or range authorities.
- ADR 0003 is superseded because its injectable parser abstraction is removed.
