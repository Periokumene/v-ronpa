# Contract Change Request: Nani Source Diagnostic Provenance

## Status

Accepted for implementation on `codex/nani-exact-source-diagnostics`.

## Problem

The parser currently loses token offsets while unquoting and splitting command
text. Parser diagnostics retain only a coarse `SourceLocation`, compiler
diagnostics have no source target, and the VS Code extension reconstructs ranges
with message parsing and string search. Those paths disagree for repeated,
escaped, CRLF, Unicode, inline, text-id, rich-text, and list-item inputs.

## Decision

- Preserve `ScenarioIR`, `CommandIR`, `NaniValue`, and `SourceLocation` exactly.
- Add a required sidecar `NaniSourceMap` to the sole `parseScenario` result.
- Require the sole `compileRuntimeScript` entry to consume the parsed document,
  never a bare `ScenarioIR`.
- Require parser and compiler diagnostics to contain stable code, severity,
  message, coarse location, and a half-open UTF-16 source span.
- Make `CommandIR.args` the compiler's only binding input. Derived
  `primary/params/flags` remain IR read projections and are not a fallback.
- Remove `ParserPort`, `defaultParser`, unused `baseUrl`, old generic diagnostics,
  and the compiler's args-missing fallback.
- Provide no overload, adapter, deprecated alias, migration transform, optional
  source map, or optional span.

## Source Model

Offsets address the original JavaScript string in UTF-16 code units and use
`[start, end)`. The source map stores statement, command, argument, value/list
item, text, inline-command, and text-id spans by structural index. Rich-text
diagnostics use the parser's temporary cooked-to-source projection directly. It
does not retain the source string and is discarded after compilation in product
flows. Cooked-to-source projection is an internal parser concern and is not
added to IR or runtime data.

## Compatibility And Migration

This is an intentional hard cut. Every repository consumer changes in the same
atomic merge. There is no historical compatibility promise for the old parser
result, parser port, or bare-IR compiler call.

## Invariants

- Parser recovery and accepted syntax remain unchanged.
- Compiler binding, normalization, label indexing, command emission, and
  diagnostic ordering remain unchanged except that the two existing extension
  semantic warnings move to the compiler.
- Runtime scripts, generated revisions/assets, save data, and contracts do not
  carry source provenance and must not change.

## Evidence

The task requires golden IR/runtime parity, exact-source parser/compiler tests,
real VS Code Extension Host tests, cleanup validation, and all contract,
boundary, build, smoke, and baseline gates. Deterministic catalog/invalid-input
stress and a versioned warmed benchmark keep recovery and performance evidence
reproducible.
