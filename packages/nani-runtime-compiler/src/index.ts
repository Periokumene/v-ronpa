import {
  getNaniCommandDefinition,
  type RichTextDocument,
  type RuntimeCommand,
  type RuntimeScript,
  type RuntimeValue
} from "@v-ronpa/contracts";
import type {
  CommandIR,
  NaniSourceMap,
  ParsedScenarioDocument,
  RichTextDocumentIR,
  StatementIR,
  TextIR
} from "@v-ronpa/nani-parser";
import { bindCommand } from "./binding.ts";
import { commandNormalizerFor } from "./normalizers/index.ts";
import type { CommandDiagnosticContext } from "./types";
import {
  createCommandDiagnostic,
  diagnoseExecutionBoundaryParams,
  diagnoseIgnoredPromotedPrimary,
  diagnoseUiTargets,
  diagnoseUnsupportedImplementedParams,
  validateCommandAgainstCatalog,
  type RuntimeCompilerDiagnostic
} from "./validation.ts";
import {
  plainCommandValue,
  plainParamRecord,
  runtimeValue
} from "./values.ts";

export {
  digestRuntimeScriptSemantics,
  serializeRuntimeScriptSemantics
} from "./semantics.ts";
export type {
  RuntimeCompilerDiagnostic,
  RuntimeCompilerDiagnosticCode
} from "./validation";

export interface CompileRuntimeScriptResult {
  script: RuntimeScript;
  diagnostics: RuntimeCompilerDiagnostic[];
}

export function compileRuntimeScript(document: ParsedScenarioDocument): CompileRuntimeScriptResult {
  const diagnostics: RuntimeCompilerDiagnostic[] = [];
  const migratedDiagnostics: RuntimeCompilerDiagnostic[] = [];
  const commands: RuntimeCommand[] = [];
  const labels: Record<string, number> = {};
  const { scenario, sourceMap } = document;

  for (const [statementIndex, statement] of scenario.statements.entries()) {
    if (statement.kind === "label") {
      labels[statement.name] = commands.length;
      continue;
    }

    const command = compileStatement(
      statement,
      diagnostics,
      migratedDiagnostics,
      sourceMap,
      statementIndex
    );
    if (command) commands.push(command);
  }

  return {
    script: {
      scriptPath: scenario.scriptPath,
      commands,
      labels,
      assets: scenario.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind as RuntimeScript["assets"][number]["kind"],
        tags: []
      })),
      dependencies: scenario.dependencies
    },
    diagnostics: [...diagnostics, ...migratedDiagnostics]
  };
}

function compileStatement(
  statement: StatementIR,
  diagnostics: RuntimeCompilerDiagnostic[],
  migratedDiagnostics: RuntimeCompilerDiagnostic[],
  sourceMap: NaniSourceMap,
  statementIndex: number
): RuntimeCommand | undefined {
  if (statement.kind === "comment" || statement.kind === "label") return undefined;
  if (statement.kind === "text") return compileText(statement);
  return compileCommand(
    statement,
    diagnostics,
    migratedDiagnostics,
    sourceMap,
    statementIndex
  );
}

function compileText(statement: TextIR): RuntimeCommand {
  const text =
    statement.richText?.text ??
    statement.tokens
      .filter((token) => token.kind === "text")
      .map((token) => token.text)
      .join("");
  const autoNext = statement.tokens.some(
    (token) => token.kind === "inline-command" && token.command.commandId === ">"
  );
  const params: Record<string, RuntimeValue> = {
    text,
    autoNext
  };
  if (statement.speaker) params.speaker = statement.speaker;
  if (statement.appearance) params.appearance = statement.appearance;
  if (statement.printParams?.speed !== undefined) params.speed = runtimeValue(statement.printParams.speed);
  if (statement.textId) params.textId = statement.textId;

  return {
    commandId: "print",
    canonicalName: "print",
    category: "text",
    source: "v-ronpa",
    status: "implemented",
    params,
    ...(statement.richText ? { richText: richTextDocument(statement.richText) } : {}),
    loc: statement.loc,
    sourceCommand: {
      rawCommandId: "text",
      rawParams: statement.printParams ? plainParamRecord(statement.printParams) : {}
    }
  };
}

function compileCommand(
  command: CommandIR,
  diagnostics: RuntimeCompilerDiagnostic[],
  migratedDiagnostics: RuntimeCompilerDiagnostic[],
  sourceMap: NaniSourceMap,
  statementIndex: number
): RuntimeCommand | undefined {
  const diagnosticContext: CommandDiagnosticContext = { command, sourceMap, statementIndex };
  const definition = getNaniCommandDefinition(command.commandId);
  if (!definition) {
    diagnostics.push(
      createCommandDiagnostic(
        diagnosticContext,
        "unknown-command",
        "Unknown .nani command: @" + command.commandId + ".",
        "error"
      )
    );
    return undefined;
  }

  const bound = bindCommand(command, definition);
  const shape = bound.shape;
  const normalizer = commandNormalizerFor(definition);
  if (definition.execution === "declared-only") {
    diagnostics.push(
      createCommandDiagnostic(
        diagnosticContext,
        "declared-only-command",
        "@" +
          definition.canonicalName +
          " is declared for Naninovel compatibility, but this runtime does not implement its execution boundary yet.",
        "warning"
      )
    );
  }

  const validationDiagnostics = validateCommandAgainstCatalog(bound, definition, diagnosticContext);
  const commandMigratedDiagnostics = [
    ...diagnoseIgnoredPromotedPrimary(bound, definition, normalizer, diagnosticContext),
    ...diagnoseUiTargets(bound, definition, diagnosticContext)
  ];
  diagnostics.push(...validationDiagnostics);
  migratedDiagnostics.push(...commandMigratedDiagnostics);
  if (validationDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return undefined;
  }

  const normalizedParams = normalizer.normalize(shape);
  const richText = richTextForCommand(command, definition.id);
  if (richText) normalizedParams.text = richText.text;
  diagnostics.push(
    ...diagnoseUnsupportedImplementedParams(bound, definition, normalizer, diagnosticContext)
  );
  diagnostics.push(...diagnoseExecutionBoundaryParams(bound, definition, diagnosticContext));

  const sourceCommand = {
    rawCommandId: command.commandId,
    ...(shape.primary ? { rawPrimary: plainCommandValue(shape.primary) } : {}),
    rawParams: plainParamRecord(shape.params),
    rawFlags: { ...shape.flags }
  };

  return {
    commandId: definition.id,
    canonicalName: definition.canonicalName,
    category: definition.category,
    source: definition.source,
    status: definition.status,
    params: normalizedParams,
    ...(richText ? { richText: richTextDocument(richText) } : {}),
    ...(shape.condition
      ? { condition: { type: "expression" as const, source: shape.condition.source } }
      : {}),
    ...(shape.unless
      ? { unless: { type: "expression" as const, source: shape.unless.source } }
      : {}),
    loc: command.loc,
    sourceCommand
  };
}

function richTextForCommand(
  command: CommandIR,
  commandId: string
): RichTextDocumentIR | undefined {
  if (
    command.richTextPrimary &&
    (commandId === "print" ||
      commandId === "append" ||
      commandId === "choice" ||
      commandId === "toast")
  ) {
    return command.richTextPrimary;
  }
  if (!command.richTextParams) return undefined;
  if (commandId === "print" || commandId === "append" || commandId === "toast") {
    return command.richTextParams.text;
  }
  if (commandId === "choice") {
    return command.richTextParams.choiceSummary ?? command.richTextParams.text;
  }
  return undefined;
}

function richTextDocument(document: RichTextDocumentIR): RichTextDocument {
  return {
    text: document.text,
    runs: document.runs.map((run) => ({
      start: run.start,
      end: run.end,
      style: { ...run.style }
    }))
  };
}
