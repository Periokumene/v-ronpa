import type { TextSpan } from "./types";

type ProjectionKind = "identity" | "span";

export interface SourceProjectionSegment {
  outputStart: number;
  outputEnd: number;
  sourceStart: number;
  sourceEnd: number;
  kind: ProjectionKind;
}

export interface SourcedText {
  text: string;
  span: { start: number; end: number };
  segments: SourceProjectionSegment[];
}

export function identitySourcedText(source: string, span: TextSpan): SourcedText {
  const text = source.slice(span.start, span.end);
  return {
    text,
    span: { start: span.start, end: span.end },
    segments: text.length === 0
      ? []
      : [{
          outputStart: 0,
          outputEnd: text.length,
          sourceStart: span.start,
          sourceEnd: span.end,
          kind: "identity"
        }]
  };
}

export function emptySourcedText(anchor: number): SourcedText {
  return { text: "", span: { start: anchor, end: anchor }, segments: [] };
}

export function appendSourcedUnit(target: SourcedText, text: string, sourceSpan: TextSpan): void {
  appendProjectedText(
    target,
    text,
    sourceSpan,
    text.length === 1 && sourceSpan.end - sourceSpan.start === 1 ? "identity" : "span"
  );
}

export function appendIdentitySourcedText(target: SourcedText, text: string, sourceSpan: TextSpan): void {
  if (text.length !== sourceSpan.end - sourceSpan.start) {
    throw new Error(
      `Identity sourced text length ${text.length} does not match source span [${sourceSpan.start}, ${sourceSpan.end}).`
    );
  }
  appendProjectedText(target, text, sourceSpan, "identity");
}

function appendProjectedText(
  target: SourcedText,
  text: string,
  sourceSpan: TextSpan,
  kind: ProjectionKind
): void {
  if (target.text.length === 0 && target.segments.length === 0) target.span.start = sourceSpan.start;
  const outputStart = target.text.length;
  target.text += text;
  if (text.length > 0) {
    appendProjectionSegment(
      target.segments,
      outputStart,
      outputStart + text.length,
      sourceSpan.start,
      sourceSpan.end,
      kind
    );
  }
  target.span.end = sourceSpan.end;
}

export function concatSourcedText(parts: SourcedText[], anchor = 0): SourcedText {
  if (parts.length === 0) return emptySourcedText(anchor);
  const segments: SourceProjectionSegment[] = [];
  const textParts: string[] = [];
  let outputOffset = 0;
  for (const part of parts) {
    textParts.push(part.text);
    appendShiftedSegments(segments, part.segments, outputOffset);
    outputOffset += part.text.length;
  }
  return {
    text: textParts.join(""),
    span: { start: parts[0]?.span.start ?? anchor, end: parts.at(-1)?.span.end ?? anchor },
    segments
  };
}

export function sliceSourcedText(value: SourcedText, start: number, end = value.text.length): SourcedText {
  const boundedStart = Math.max(0, Math.min(start, value.text.length));
  const boundedEnd = Math.max(boundedStart, Math.min(end, value.text.length));
  return {
    text: value.text.slice(boundedStart, boundedEnd),
    span: spanForSourcedRange(value, boundedStart, boundedEnd),
    segments: sliceProjectionSegments(value.segments, boundedStart, boundedEnd)
  };
}

export function spanForSourcedRange(value: SourcedText, start: number, end: number): TextSpan {
  const boundedStart = Math.max(0, Math.min(start, value.text.length));
  const boundedEnd = Math.max(boundedStart, Math.min(end, value.text.length));
  if (boundedEnd > boundedStart) {
    const first = segmentAt(value.segments, boundedStart);
    const last = segmentAt(value.segments, boundedEnd - 1);
    if (!first || !last) throw missingProjection(boundedStart, boundedEnd);
    return {
      start: projectedUnitStart(first, boundedStart),
      end: projectedUnitEnd(last, boundedEnd - 1)
    };
  }

  if (boundedStart < value.text.length) {
    const next = segmentAt(value.segments, boundedStart);
    if (!next) throw missingProjection(boundedStart, boundedStart);
    const anchor = projectedUnitStart(next, boundedStart);
    return { start: anchor, end: anchor };
  }
  if (boundedStart > 0) {
    const previous = segmentAt(value.segments, boundedStart - 1);
    if (!previous) throw missingProjection(boundedStart, boundedStart);
    const anchor = projectedUnitEnd(previous, boundedStart - 1);
    return { start: anchor, end: anchor };
  }
  return { start: value.span.start, end: value.span.start };
}

export function removeSourcedRanges(value: SourcedText, ranges: Array<{ start: number; end: number }>): SourcedText {
  if (ranges.length === 0) return value;
  const output = emptySourcedText(value.span.start);
  let cursor = 0;
  for (const range of ranges) {
    appendSourcedText(output, sliceSourcedText(value, cursor, range.start));
    cursor = range.end;
  }
  appendSourcedText(output, sliceSourcedText(value, cursor));
  if (output.text.length === 0) output.span.end = value.span.end;
  return output;
}

export function appendSourcedText(target: SourcedText, source: SourcedText): void {
  if (!source.text) return;
  const outputOffset = target.text.length;
  if (!target.text) target.span.start = source.span.start;
  target.text += source.text;
  appendShiftedSegments(target.segments, source.segments, outputOffset);
  target.span.end = source.span.end;
}

function appendShiftedSegments(
  target: SourceProjectionSegment[],
  source: SourceProjectionSegment[],
  outputOffset: number
): void {
  for (const segment of source) {
    appendProjectionSegment(
      target,
      outputOffset + segment.outputStart,
      outputOffset + segment.outputEnd,
      segment.sourceStart,
      segment.sourceEnd,
      segment.kind
    );
  }
}

function sliceProjectionSegments(
  segments: SourceProjectionSegment[],
  start: number,
  end: number
): SourceProjectionSegment[] {
  if (end <= start) return [];
  const output: SourceProjectionSegment[] = [];
  for (const segment of segments) {
    const overlapStart = Math.max(start, segment.outputStart);
    const overlapEnd = Math.min(end, segment.outputEnd);
    if (overlapEnd <= overlapStart) continue;
    const sourceStart = segment.kind === "identity"
      ? segment.sourceStart + overlapStart - segment.outputStart
      : segment.sourceStart;
    const sourceEnd = segment.kind === "identity"
      ? segment.sourceStart + overlapEnd - segment.outputStart
      : segment.sourceEnd;
    appendProjectionSegment(
      output,
      overlapStart - start,
      overlapEnd - start,
      sourceStart,
      sourceEnd,
      segment.kind
    );
  }
  return output;
}

function appendProjectionSegment(
  segments: SourceProjectionSegment[],
  outputStart: number,
  outputEnd: number,
  sourceStart: number,
  sourceEnd: number,
  kind: ProjectionKind
): void {
  if (outputEnd <= outputStart) return;
  const previous = segments.at(-1);
  if (
    previous &&
    previous.kind === kind &&
    previous.outputEnd === outputStart &&
    (
      (kind === "identity" && previous.sourceEnd === sourceStart) ||
      (kind === "span" && previous.sourceStart === sourceStart && previous.sourceEnd === sourceEnd)
    )
  ) {
    previous.outputEnd = outputEnd;
    if (kind === "identity") previous.sourceEnd = sourceEnd;
    return;
  }
  segments.push({ outputStart, outputEnd, sourceStart, sourceEnd, kind });
}

function segmentAt(
  segments: SourceProjectionSegment[],
  outputOffset: number
): SourceProjectionSegment | undefined {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const segment = segments[middle];
    if (!segment) return undefined;
    if (outputOffset < segment.outputStart) high = middle - 1;
    else if (outputOffset >= segment.outputEnd) low = middle + 1;
    else return segment;
  }
  return undefined;
}

function projectedUnitStart(segment: SourceProjectionSegment, outputOffset: number): number {
  return segment.kind === "identity"
    ? segment.sourceStart + outputOffset - segment.outputStart
    : segment.sourceStart;
}

function projectedUnitEnd(segment: SourceProjectionSegment, outputOffset: number): number {
  return segment.kind === "identity"
    ? segment.sourceStart + outputOffset - segment.outputStart + 1
    : segment.sourceEnd;
}

function missingProjection(start: number, end: number): Error {
  return new Error(`Sourced text projection is missing output range [${start}, ${end}).`);
}
