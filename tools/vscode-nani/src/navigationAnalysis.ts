import {
  parseScenario,
  parseStaticNaniEndpoint,
  type CommandIR,
  type ParseScenarioResult,
  type TextSpan
} from "@v-ronpa/nani-parser";
import {
  compileRuntimeScript,
  linkRuntimeScriptCatalog,
  type CompileRuntimeScriptResult,
  type RuntimeCompilerDiagnostic,
  type RuntimeScriptCatalogDiagnostic
} from "@v-ronpa/nani-runtime-compiler";
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
  readonly projectDiagnostics: readonly RuntimeScriptCatalogDiagnostic[];
  readonly projectionErrors: readonly string[];
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

export function analyzeNaniCatalog(
  catalogId: string,
  currentScriptPath: string,
  entry: { initialScriptPath: string; startLabel?: string },
  records: readonly {
    sourceUri: string;
    analysis: NaniDocumentAnalysis;
  }[],
  options: {
    scopeByScriptPath?: ReadonlyMap<string, "production" | "development" | "test">;
  } = {}
): NaniCatalogAnalysis {
  const analyses = new Map(
    records.map((record) => [record.analysis.compiled.script.scriptPath, record] as const)
  );
  const linked = linkRuntimeScriptCatalog(
    entry,
    records.map((record) => record.analysis.compiled.script)
  );
  const diagnosticsByScriptPath = new Map<string, NaniDiagnostic[]>();
  for (const record of records) {
    diagnosticsByScriptPath.set(
      record.analysis.compiled.script.scriptPath,
      [...record.analysis.diagnostics]
    );
  }
  const projectDiagnostics: RuntimeScriptCatalogDiagnostic[] = [];
  const projectionErrors: string[] = [];
  for (const diagnostic of linked.diagnostics) {
    if (diagnostic.commandIndex === undefined) {
      projectDiagnostics.push(diagnostic);
      continue;
    }
    const record = analyses.get(diagnostic.scriptPath);
    if (!record) {
      projectDiagnostics.push(diagnostic);
      continue;
    }
    let span: TextSpan;
    try {
      span = navigationDiagnosticSpan(record.analysis, diagnostic);
    } catch (error) {
      projectionErrors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    const values = diagnosticsByScriptPath.get(diagnostic.scriptPath) ?? [];
    values.push({
      code: diagnostic.code,
      message: diagnostic.message,
      severity: diagnostic.severity,
      source: "nani",
      span
    });
    diagnosticsByScriptPath.set(diagnostic.scriptPath, values);
  }

  if (options.scopeByScriptPath && catalogId === "development") {
    const productionRecords = records.filter((record) =>
      options.scopeByScriptPath?.get(record.analysis.compiled.script.scriptPath) === "production"
    );
    const productionLink = linkRuntimeScriptCatalog(
      entry,
      productionRecords.map((record) => record.analysis.compiled.script)
    );
    for (const diagnostic of productionLink.diagnostics) {
      if (diagnostic.code !== "endpoint-script-missing" || diagnostic.commandIndex === undefined || !diagnostic.endpoint) {
        continue;
      }
      const endpoint = parseStaticNaniEndpoint(diagnostic.endpoint, diagnostic.scriptPath);
      if (!endpoint.ok || options.scopeByScriptPath.get(endpoint.endpoint.scriptPath) !== "development") continue;
      const record = analyses.get(diagnostic.scriptPath);
      if (!record) continue;
      const values = diagnosticsByScriptPath.get(diagnostic.scriptPath) ?? [];
      values.push({
        code: "development-only-target",
        message: `Navigation target '${endpoint.endpoint.scriptPath}' is valid only in the development catalog and will fail production validation.`,
        severity: "warning",
        source: "nani",
        span: navigationDiagnosticSpan(record.analysis, diagnostic)
      });
      diagnosticsByScriptPath.set(diagnostic.scriptPath, values);
    }
  }

  return {
    navigation: {
      catalogId,
      currentScriptPath,
      scripts: new Map(
        records.map((record) => {
          const analysis = record.analysis;
          return [
            analysis.compiled.script.scriptPath,
            {
              scriptPath: analysis.compiled.script.scriptPath,
              sourceUri: record.sourceUri,
              sourceText: analysis.sourceText,
              labels: labelSpans(analysis)
            }
          ] as const;
        })
      )
    },
    diagnosticsByScriptPath,
    projectDiagnostics,
    projectionErrors
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

function navigationDiagnosticSpan(
  analysis: NaniDocumentAnalysis,
  diagnostic: RuntimeScriptCatalogDiagnostic
): TextSpan {
  const runtime = analysis.compiled.script.commands[diagnostic.commandIndex ?? -1];
  if (!runtime) throw new Error(`Missing runtime command ${String(diagnostic.commandIndex)}.`);
  const statementIndex = analysis.parsed.scenario.statements.findIndex(
    (statement) =>
      statement.kind === "command" &&
      statement.loc.line === runtime.loc.line &&
      statement.loc.column === runtime.loc.column &&
      statement.commandId === runtime.sourceCommand?.rawCommandId
  );
  const statement = analysis.parsed.scenario.statements[statementIndex];
  const source = analysis.parsed.sourceMap.statements[statementIndex]?.command;
  if (!statement || statement.kind !== "command" || !source) {
    throw new Error(`Unable to map navigation command in ${runtime.loc.scriptPath}.`);
  }
  const argumentIndex = navigationArgumentIndex(statement);
  const argument = source.arguments[argumentIndex];
  const span = argument?.valueSpan && argument.valueSpan.end > argument.valueSpan.start
    ? argument.valueSpan
    : argument?.span;
  if (!span) throw new Error(`Unable to map navigation endpoint in ${runtime.loc.scriptPath}.`);
  return span;
}

function navigationArgumentIndex(command: CommandIR): number {
  if (command.commandId === "goto") {
    const index = command.args.findIndex((argument) => argument.kind === "value");
    if (index >= 0) return index;
  }
  if (command.commandId === "choice") {
    const index = command.args.findIndex(
      (argument) => argument.kind === "param" && argument.key.toLowerCase() === "goto"
    );
    if (index >= 0) return index;
  }
  throw new Error(`Command @${command.commandId} has no navigation endpoint argument.`);
}

function labelSpans(analysis: NaniDocumentAnalysis): Record<string, TextSpan> {
  const labels: Record<string, TextSpan> = {};
  for (const [index, statement] of analysis.parsed.scenario.statements.entries()) {
    if (statement.kind !== "label") continue;
    const span = analysis.parsed.sourceMap.statements[index]?.nameSpan;
    if (span) labels[statement.name] = span;
  }
  return labels;
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
