import type { TextSpan } from "@v-ronpa/nani-parser";
import { analyzeNaniDocument } from "./navigationAnalysis";

export interface NaniDiagnostic {
  message: string;
  severity: "info" | "warning" | "error";
  span: TextSpan;
  source: "nani" | "nani-assets";
  code: string;
}

export function computeNaniDiagnostics(sourceText: string, scriptPath: string): NaniDiagnostic[] {
  return [...analyzeNaniDocument(sourceText, scriptPath).diagnostics];
}

export function assertValidNaniDiagnosticSpan(
  diagnostic: NaniDiagnostic,
  sourceLength: number
): void {
  const { start, end } = diagnostic.span;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > sourceLength
  ) {
    throw new Error(
      `Invalid diagnostic span [${String(start)}, ${String(end)}) for source length ${sourceLength}.`
    );
  }
}
