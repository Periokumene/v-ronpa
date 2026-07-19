import {
  parseScenario,
  type NaniParserDiagnostic,
  type TextSpan
} from "@v-ronpa/nani-parser";
import {
  compileRuntimeScript,
  type RuntimeCompilerDiagnostic
} from "@v-ronpa/nani-runtime-compiler";

export interface NaniDiagnostic {
  message: string;
  severity: "info" | "warning" | "error";
  span: TextSpan;
  source: "nani";
  code: string;
}

export function computeNaniDiagnostics(sourceText: string, scriptPath: string): NaniDiagnostic[] {
  const parsedDocument = parseScenario({ sourceText, scriptPath });
  const compiledScript = compileRuntimeScript(parsedDocument);

  return [
    ...parsedDocument.diagnostics.map(toNaniDiagnostic),
    ...compiledScript.diagnostics.map(toNaniDiagnostic)
  ];
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

function toNaniDiagnostic(
  diagnostic: NaniParserDiagnostic | RuntimeCompilerDiagnostic
): NaniDiagnostic {
  return {
    message: diagnostic.message,
    severity: diagnostic.severity,
    span: diagnostic.span,
    source: "nani",
    code: diagnostic.code
  };
}
