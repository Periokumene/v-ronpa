import { RUNTIME_UI_GROUPS, getNaniCommandDefinition } from "@v-ronpa/contracts";
import { parseScenario, type CommandArgIR, type CommandIR, type Diagnostic, type NaniValue, type SourceLocation } from "@v-ronpa/nani-parser";
import {
  compileRuntimeScript,
  type RuntimeCompilerDiagnostic
} from "@v-ronpa/nani-runtime-compiler";
import { lineRange, splitSourceLines, type NaniRange } from "./documentContext";

export interface NaniDiagnostic {
  message: string;
  severity: "info" | "warning" | "error";
  range: NaniRange;
  source: "nani-parser" | "nani-compiler" | "vscode-nani";
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
  const semanticDiagnostics = computeSemanticDiagnostics(parseResult.scenario.statements.filter((statement): statement is CommandIR => statement.kind === "command"));

  return [...parserDiagnostics, ...compilerDiagnostics, ...semanticDiagnostics];
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

function computeSemanticDiagnostics(commands: CommandIR[]): NaniDiagnostic[] {
  return commands.flatMap((command) => {
    if (command.commandId !== "showui" && command.commandId !== "hideui") return [];
    return uiTargetDiagnostics(command);
  });
}

const runtimeUiTargetSet = new Set<string>(RUNTIME_UI_GROUPS);

interface UiTargetCandidate {
  target: string;
  range: NaniRange;
}

type UiTargetArg = Extract<CommandArgIR, { kind: "value" }> | Extract<CommandArgIR, { kind: "param" }>;

function uiTargetDiagnostics(command: CommandIR): NaniDiagnostic[] {
  return uiTargetCandidates(command)
    .filter((candidate) => !runtimeUiTargetSet.has(candidate.target))
    .map((candidate) => ({
      message: uiTargetDiagnosticMessage(command, candidate.target),
      severity: "warning",
      range: candidate.range,
      source: "vscode-nani",
      code: "unsupported-ui-target"
    }));
}

function uiTargetCandidates(command: CommandIR): UiTargetCandidate[] {
  const candidates: UiTargetCandidate[] = [];
  const primary = command.args.find((arg) => arg.kind === "value");
  if (primary) candidates.push(...targetsFromArg(command, primary, 0));
  for (const arg of command.args) {
    if (arg.kind !== "param") continue;
    const key = normalize(arg.key);
    if (key !== "target" && key !== "uinames") continue;
    candidates.push(...targetsFromArg(command, arg, arg.raw.indexOf(":") + 1));
  }
  return candidates;
}

function targetsFromArg(command: CommandIR, arg: UiTargetArg, valueOffset: number): UiTargetCandidate[] {
  const value = arg.value;
  if (value.type === "expression") return [];
  return targetsFromValue(command, arg.raw, value, valueOffset, valueOffset);
}

function targetsFromValue(
  command: CommandIR,
  argRaw: string,
  value: NaniValue,
  valueOffset: number,
  offsetInArg: number
): UiTargetCandidate[] {
  if (value.type === "expression") return [];
  if (value.type === "list") {
    const rawValue = argRaw.slice(valueOffset);
    const parts = rawValue.split(",");
    let cursor = valueOffset;
    return value.value.flatMap((item, index) => {
      const rawPart = parts[index] ?? "";
      const itemOffset = cursor;
      cursor += rawPart.length + 1;
      return targetsFromValue(command, argRaw, item, valueOffset, itemOffset);
    });
  }

  const target = String(value.value).trim();
  if (!target) return [];
  return [{ target, range: argValueRange(command, argRaw, offsetInArg, target) }];
}

function argValueRange(command: CommandIR, argRaw: string, offsetInArg: number, value: string): NaniRange {
  const argStart = findArgStart(command.loc.raw, argRaw);
  if (argStart === undefined) return lineRange(command.loc.line - 1, command.loc.raw);
  let start = argStart + offsetInArg;
  if (command.loc.raw[start] === "\"" || command.loc.raw[start] === "'") start += 1;
  return {
    start: { line: command.loc.line - 1, character: start },
    end: { line: command.loc.line - 1, character: Math.max(start + 1, start + value.length) }
  };
}

function findArgStart(rawLine: string, argRaw: string): number | undefined {
  const direct = rawLine.indexOf(argRaw);
  if (direct >= 0) return direct;
  const colon = argRaw.indexOf(":");
  if (colon > 0) {
    const keyStart = rawLine.indexOf(`${argRaw.slice(0, colon)}:`);
    if (keyStart >= 0) return keyStart;
  }
  return undefined;
}

function uiTargetDiagnosticMessage(command: CommandIR, target: string): string {
  const definition = getNaniCommandDefinition(command.commandId);
  const commandName = definition?.canonicalName ?? command.commandId;
  const suffix = command.flags.wait === true ? "; wait! will not create a UI presentation wait." : ".";
  return `@${commandName} target ${target} is not a v1 runtime UI surface${suffix}`;
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
