# Nani Source Diagnostics

## Ownership

The Nani frontend has one data flow:

```text
original sourceText
  -> nani-parser: ScenarioIR + NaniSourceMap + parser diagnostics
  -> nani-runtime-compiler: RuntimeScript + compiler diagnostics
  -> adapters: convert TextSpan to host ranges or log locations
```

The parser owns lexical/source projection and syntax diagnostics. The compiler
owns command catalog binding, parameter/runtime validation, normalization, and
the promoted-primary/runtime-UI diagnostics. VS Code owns only conversion from
UTF-16 offsets to `vscode.Range` and diagnostic publication.

## Coordinate Standard

- Every exact location is a half-open `[start, end)` span in the original
  JavaScript source string's UTF-16 code units.
- CRLF remains two source code units. Line normalization must never precede span
  calculation.
- `SourceLocation` remains coarse runtime/logging metadata and is not an editor
  range authority.
- Structural source refs use statement, argument, inline-token, text-id, and
  list-item occurrence indices. Each statement map carries its semantic kind;
  the resolver validates ref shape, integer bounds, statement kind, and
  component availability before returning a span. Text search and message
  parsing are forbidden.

## Source Map Boundary

`NaniSourceMap` stores spans only; it does not copy `sourceText`. The parser's
temporary cooked-to-source projection composes quote/escape decoding, inline and
text-id removal, text joining, and rich-text parsing. It is released after the
map and IR are complete. Product code discards the map after compilation.

The map and `ScenarioIR` are created together. The compiler cannot accept a bare
IR, and no production helper manufactures a synthetic source map.

`CommandIR.args` is the compiler's only binding input. `primary`, `params`,
`flags`, `condition`, and `unless` are parser-derived read projections and are
covered by consistency tests, but compiler recovery never reads them. The
normalizer registry declares catalog parameters consumed by each command;
catalog-external convenience fields are not accepted as hidden inputs. Every
implemented command has a specific descriptor and every stubbed command has an
explicit generic descriptor, so no catalog entry can silently fall through.

## Diagnostics

Every parser/compiler diagnostic requires a stable code, severity, message,
coarse location, and exact span. Missing parameters target the command name;
invalid values target their value or list item; an empty `key:` value targets
the whole argument and an empty list item targets its comma. A source-map
invariant failure is an implementation error: editor adapters log it and
publish no guessed range.
Product runtime diagnostics preserve parser/compiler code, severity, coarse
location, and exact span instead of rebuilding a looser mirror type.

## Non-Goals

This model is not a concrete syntax tree, language server, semantic-token model,
or replacement for completion/hover cursor parsing. It adds no validation rule
and changes no IR/runtime/save shape.
