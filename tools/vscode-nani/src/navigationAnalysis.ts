import {
  parseScenario,
  parseStaticNaniEndpoint,
  type ParseScenarioResult,
  type TextSpan
} from "@v-ronpa/nani-parser";
import {
  compileRuntimeScript,
  type CompileRuntimeScriptResult,
  type RuntimeCompilerDiagnostic
} from "@v-ronpa/nani-runtime-compiler";
import type { NaniProjectDiagnostic } from "@v-ronpa/nani-project";
import type { NaniDiagnostic } from "./diagnostics";
import type { NaniPosition, NaniRange } from "./documentContext";

export interface NaniDocumentAnalysis {
  readonly sourceText: string;
  readonly parsed: ParseScenarioResult;
  readonly compiled: CompileRuntimeScriptResult;
  readonly diagnostics: readonly NaniDiagnostic[];
}

export interface NaniNavigationScript {
  readonly scriptPath: string;
  readonly sourceUri: string;
  readonly sourceText: string;
  readonly labels: Readonly<Record<string, TextSpan>>;
}

export interface NaniNavigationIndex {
  readonly catalogId: string;
  readonly currentScriptPath: string;
  readonly scripts: ReadonlyMap<string, NaniNavigationScript>;
}

export interface NaniCatalogAnalysis {
  readonly navigation: NaniNavigationIndex;
  readonly diagnosticsByScriptPath: ReadonlyMap<string, readonly NaniDiagnostic[]>;
  readonly projectDiagnostics: readonly NaniProjectDiagnostic[];
}

export function analyzeNaniDocument(sourceText: string, scriptPath: string): NaniDocumentAnalysis {
  const parsed = parseScenario({ sourceText, scriptPath });
  const compiled = compileRuntimeScript(parsed);
  return {
    sourceText,
    parsed,
    compiled,
    diagnostics: [
      ...parsed.diagnostics.map(toNaniDiagnostic),
      ...compiled.diagnostics.map(toNaniDiagnostic)
    ]
  };
}

export function resolveNavigationTarget(
  rawEndpoint: string,
  navigation: NaniNavigationIndex
):
  | {
      script: NaniNavigationScript;
      label?: string;
      labelSpan?: TextSpan;
    }
  | undefined {
  const parsed = parseStaticNaniEndpoint(rawEndpoint, navigation.currentScriptPath);
  if (!parsed.ok) return undefined;
  const script = navigation.scripts.get(parsed.endpoint.scriptPath);
  if (!script) return undefined;
  if (!parsed.endpoint.label) return { script };
  const labelSpan = script.labels[parsed.endpoint.label];
  if (!labelSpan) return undefined;
  return { script, label: parsed.endpoint.label, labelSpan };
}

export function offsetRange(sourceText: string, span: TextSpan): NaniRange {
  return {
    start: offsetPosition(sourceText, span.start),
    end: offsetPosition(sourceText, span.end)
  };
}

export function offsetPosition(sourceText: string, offset: number): NaniPosition {
  const safe = Math.max(0, Math.min(offset, sourceText.length));
  let line = 0;
  let lineStart = 0;
  for (let index = 0; index < safe; index += 1) {
    if (sourceText.charCodeAt(index) !== 10) continue;
    line += 1;
    lineStart = index + 1;
  }
  return { line, character: safe - lineStart };
}

function toNaniDiagnostic(
  diagnostic: ParseScenarioResult["diagnostics"][number] | RuntimeCompilerDiagnostic
): NaniDiagnostic {
  return {
    message: diagnostic.message,
    severity: diagnostic.severity,
    span: diagnostic.span,
    source: "nani",
    code: diagnostic.code
  };
}
