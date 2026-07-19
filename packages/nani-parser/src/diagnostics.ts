import type {
  NaniParserDiagnostic,
  NaniParserDiagnosticCode,
  SourceLocation,
  TextSpan
} from "./types";

export type NaniDiagnosticSink = NaniParserDiagnostic[];

export interface NaniDiagnosticTarget {
  readonly span: TextSpan;
}

export function reportNaniDiagnostic(
  sink: NaniDiagnosticSink,
  loc: SourceLocation,
  code: NaniParserDiagnosticCode,
  severity: NaniParserDiagnostic["severity"],
  message: string,
  target: NaniDiagnosticTarget
): void {
  if (target.span.start < 0 || target.span.end <= target.span.start) {
    throw new Error(
      `Nani parser diagnostic invariant failed: ${code} has no non-empty source span ` +
        `[${target.span.start}, ${target.span.end}).`
    );
  }
  sink.push({ code, severity, message, loc, span: target.span });
}

export function firstNonEmptyDiagnosticSpan(...candidates: Array<TextSpan | undefined>): TextSpan {
  const span = candidates.find((candidate) => candidate && candidate.end > candidate.start);
  if (!span) throw new Error("Nani parser diagnostic invariant failed: no non-empty source anchor.");
  return span;
}
