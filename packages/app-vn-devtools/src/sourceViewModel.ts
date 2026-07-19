import type { VnDevtoolsSourceLine } from "./types";

export type VnDevtoolsFindMatchKind = "source" | "label" | "command" | "line-number";

export interface VnDevtoolsSourceRange {
  start: number;
  end: number;
}

/**
 * Convert an absolute parser/compiler UTF-16 span into a range local to one
 * rendered source line. CRLF is treated as one line break while offsets remain
 * JavaScript/UTF-16 offsets, so astral characters keep their authored width.
 */
export function resolveVnDevtoolsLineRange(
  sourceText: string,
  lineNumber: number,
  span: VnDevtoolsSourceRange | undefined
): VnDevtoolsSourceRange | undefined {
  if (
    !span
    || !Number.isInteger(lineNumber)
    || lineNumber < 1
    || !Number.isInteger(span.start)
    || !Number.isInteger(span.end)
    || span.start < 0
    || span.end <= span.start
    || span.end > sourceText.length
  ) {
    return undefined;
  }

  const bounds = findLineBounds(sourceText, lineNumber);
  if (!bounds) return undefined;
  const start = Math.max(bounds.start, span.start);
  const end = Math.min(bounds.end, span.end);
  if (start >= end) return undefined;
  return { start: start - bounds.start, end: end - bounds.start };
}

export interface VnDevtoolsFindMatch {
  lineId: string;
  lineNumber: number;
  kinds: readonly VnDevtoolsFindMatchKind[];
  sourceRanges: readonly VnDevtoolsSourceRange[];
}

export interface VnDevtoolsFindResult {
  query: string;
  matches: readonly VnDevtoolsFindMatch[];
  currentMatchIndex: number;
  currentMatch?: VnDevtoolsFindMatch;
}

export type VnDevtoolsSyntaxTokenKind =
  | "plain"
  | "label"
  | "command"
  | "comment"
  | "speaker"
  | "string";

export interface VnDevtoolsSyntaxToken {
  kind: VnDevtoolsSyntaxTokenKind;
  text: string;
}

/**
 * Build IDE-style search metadata without removing or rewriting any source
 * lines. One match represents one visible line and may include several exact
 * source ranges plus metadata-only matches.
 */
export function createVnDevtoolsFindResult(
  lines: readonly VnDevtoolsSourceLine[],
  query: string,
  requestedMatchIndex = 0
): VnDevtoolsFindResult {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery.length === 0) {
    return { query, matches: [], currentMatchIndex: -1 };
  }

  const matches = lines.flatMap((line): VnDevtoolsFindMatch[] => {
    const sourceRanges = findCaseInsensitiveRanges(line.sourceText, normalizedQuery);
    const kinds: VnDevtoolsFindMatchKind[] = [];
    if (sourceRanges.length > 0) kinds.push("source");
    if (line.label?.toLocaleLowerCase().includes(normalizedQuery)) kinds.push("label");
    if (line.command?.toLocaleLowerCase().includes(normalizedQuery)) kinds.push("command");
    if (String(line.lineNumber).includes(normalizedQuery)) kinds.push("line-number");
    return kinds.length === 0
      ? []
      : [{ lineId: line.id, lineNumber: line.lineNumber, kinds, sourceRanges }];
  });

  if (matches.length === 0) return { query, matches, currentMatchIndex: -1 };
  const currentMatchIndex = wrapIndex(requestedMatchIndex, matches.length);
  return {
    query,
    matches,
    currentMatchIndex,
    currentMatch: matches[currentMatchIndex]!
  };
}

export function stepVnDevtoolsFindMatch(
  currentMatchIndex: number,
  matchCount: number,
  direction: 1 | -1
): number {
  if (matchCount <= 0) return -1;
  return wrapIndex((currentMatchIndex < 0 ? 0 : currentMatchIndex) + direction, matchCount);
}

/** Purely presentational lexer. Concatenating token text always reproduces sourceText. */
export function highlightVnDevtoolsSource(sourceText: string): readonly VnDevtoolsSyntaxToken[] {
  if (sourceText.length === 0) return [{ kind: "plain", text: sourceText }];
  const spans: Array<{ start: number; end: number; kind: Exclude<VnDevtoolsSyntaxTokenKind, "plain"> }> = [];

  const comment = sourceText.match(/^\s*;.*$/u);
  if (comment?.index !== undefined) {
    return [{ kind: "comment", text: sourceText }];
  }

  const label = sourceText.match(/^\s*#[^\s]+/u);
  if (label?.index !== undefined) spans.push({ start: label.index, end: label.index + label[0].length, kind: "label" });

  const command = sourceText.match(/^\s*@[^\s]+/u);
  if (command?.index !== undefined) {
    spans.push({ start: command.index, end: command.index + command[0].length, kind: "command" });
  } else {
    const speaker = sourceText.match(/^\s*[^\s:#@][^:]*:/u);
    if (speaker?.index !== undefined) {
      spans.push({ start: speaker.index, end: speaker.index + speaker[0].length, kind: "speaker" });
    }
  }

  for (const match of sourceText.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gu)) {
    if (match.index === undefined) continue;
    spans.push({ start: match.index, end: match.index + match[0].length, kind: "string" });
  }

  const ordered = spans
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .filter((span, index, values) => index === 0 || span.start >= values[index - 1]!.end);
  if (ordered.length === 0) return [{ kind: "plain", text: sourceText }];

  const tokens: VnDevtoolsSyntaxToken[] = [];
  let cursor = 0;
  for (const span of ordered) {
    if (span.start > cursor) tokens.push({ kind: "plain", text: sourceText.slice(cursor, span.start) });
    tokens.push({ kind: span.kind, text: sourceText.slice(span.start, span.end) });
    cursor = span.end;
  }
  if (cursor < sourceText.length) tokens.push({ kind: "plain", text: sourceText.slice(cursor) });
  return tokens;
}

export function findNearestVnDevtoolsLabel(
  lines: readonly VnDevtoolsSourceLine[],
  selectedLineNumber: number | undefined
): VnDevtoolsSourceLine | undefined {
  const labels = lines.filter((line) => line.label !== undefined);
  if (labels.length === 0) return undefined;
  if (selectedLineNumber === undefined) return labels[0];
  return [...labels].reverse().find((line) => line.lineNumber <= selectedLineNumber) ?? labels[0];
}

function findCaseInsensitiveRanges(sourceText: string, normalizedQuery: string): VnDevtoolsSourceRange[] {
  const normalizedSource = sourceText.toLocaleLowerCase();
  const ranges: VnDevtoolsSourceRange[] = [];
  let offset = 0;
  while (offset <= normalizedSource.length - normalizedQuery.length) {
    const start = normalizedSource.indexOf(normalizedQuery, offset);
    if (start < 0) break;
    ranges.push({ start, end: start + normalizedQuery.length });
    offset = start + Math.max(1, normalizedQuery.length);
  }
  return ranges;
}

function findLineBounds(
  sourceText: string,
  requestedLineNumber: number
): VnDevtoolsSourceRange | undefined {
  let lineNumber = 1;
  let lineStart = 0;
  for (let offset = 0; offset < sourceText.length; offset += 1) {
    const codeUnit = sourceText.charCodeAt(offset);
    if (codeUnit !== 0x0a && codeUnit !== 0x0d) continue;
    if (lineNumber === requestedLineNumber) return { start: lineStart, end: offset };
    if (codeUnit === 0x0d && sourceText.charCodeAt(offset + 1) === 0x0a) offset += 1;
    lineNumber += 1;
    lineStart = offset + 1;
  }
  return lineNumber === requestedLineNumber
    ? { start: lineStart, end: sourceText.length }
    : undefined;
}

function wrapIndex(value: number, length: number): number {
  return ((Math.trunc(value) % length) + length) % length;
}
