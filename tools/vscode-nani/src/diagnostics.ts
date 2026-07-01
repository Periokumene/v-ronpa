import { getNaniCommandDefinition } from "@v-ronpa/contracts";
import { parseScenario, type CommandIR, type Diagnostic, type SourceLocation } from "@v-ronpa/nani-parser";
import {
  compileRuntimeScript,
  type RuntimeCompilerDiagnostic
} from "@v-ronpa/nani-runtime-compiler";
import { lineRange, splitSourceLines, type NaniRange } from "./documentContext";

export interface NaniDiagnostic {
  message: string;
  severity: "info" | "warning" | "error";
  range: NaniRange;
  source: "nani-parser" | "nani-compiler";
  code?: string;
}

export interface CommandLoc {
  commandId: string;
  raw: string;
  range: NaniRange;
}

export function computeNaniDiagnostics(sourceText: string, scriptPath: string): NaniDiagnostic[] {
  const lines = splitSourceLines(sourceText);
  const parseResult = parseScenario({ sourceText, scriptPath });
  const parserDiagnostics = parseResult.diagnostics.map((diagnostic) => parserDiagnostic(diagnostic, lines));
  const compilerResult = compileRuntimeScript(parseResult.scenario);
  const commandLocs = parseResult.scenario.statements
    .filter((statement): statement is CommandIR => statement.kind === "command")
    .map(commandLoc);
  const compilerDiagnostics = compilerResult.diagnostics.map((diagnostic, index) =>
    compilerDiagnostic(diagnostic, commandLocs, lines, index)
  );

  return [...parserDiagnostics, ...compilerDiagnostics];
}

export function approximateCompilerDiagnosticRange(
  diagnostic: Pick<RuntimeCompilerDiagnostic, "message">,
  commandLocs: CommandLoc[],
  lines: string[],
  diagnosticIndex = 0
): NaniRange {
  const commandName = commandNameFromMessage(diagnostic.message);
  const namedCommand = commandName ? commandLocs.find((command) => commandMatches(command, commandName)) : undefined;
  const orderedCommand = commandLocs[diagnosticIndex];
  return namedCommand?.range ?? orderedCommand?.range ?? lineRange(0, lines[0] ?? "");
}

function parserDiagnostic(diagnostic: Diagnostic, lines: string[]): NaniDiagnostic {
  return {
    message: diagnostic.message,
    severity: diagnostic.severity,
    range: sourceLocationRange(diagnostic.loc, lines),
    source: "nani-parser"
  };
}

function compilerDiagnostic(
  diagnostic: RuntimeCompilerDiagnostic,
  commandLocs: CommandLoc[],
  lines: string[],
  diagnosticIndex: number
): NaniDiagnostic {
  return {
    message: diagnostic.message,
    severity: diagnostic.severity ?? "warning",
    range: approximateCompilerDiagnosticRange(diagnostic, commandLocs, lines, diagnosticIndex),
    source: "nani-compiler",
    code: diagnostic.code
  };
}

function sourceLocationRange(loc: SourceLocation | undefined, lines: string[]): NaniRange {
  if (!loc) return lineRange(0, lines[0] ?? "");
  const line = Math.max(0, loc.line - 1);
  const raw = lines[line] ?? loc.raw;
  const startCharacter = Math.min(Math.max(0, loc.column - 1), raw.length);
  return {
    start: { line, character: startCharacter },
    end: { line, character: Math.max(startCharacter + 1, raw.length) }
  };
}

function commandLoc(command: CommandIR): CommandLoc {
  return {
    commandId: command.commandId,
    raw: command.loc.raw,
    range: lineRange(command.loc.line - 1, command.loc.raw)
  };
}

function commandNameFromMessage(message: string): string | undefined {
  return message.match(/@([A-Za-z0-9_<>./:-]+)/u)?.[1];
}

function commandMatches(command: CommandLoc, name: string): boolean {
  const normalizedName = normalize(name);
  if (normalize(command.commandId) === normalizedName) return true;
  const definition = getNaniCommandDefinition(command.commandId);
  if (!definition) return false;
  if (normalize(definition.id) === normalizedName) return true;
  if (normalize(definition.canonicalName) === normalizedName) return true;
  return (definition.aliases ?? []).some((alias) => normalize(alias) === normalizedName);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
