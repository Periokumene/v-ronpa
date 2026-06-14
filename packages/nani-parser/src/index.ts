export type {
  AssetRef,
  CommandIR,
  CommentIR,
  ConditionIR,
  Diagnostic,
  LabelIR,
  NaniValue,
  ParseScenarioInput,
  ParseScenarioResult,
  ParserPort,
  ScenarioIR,
  ScriptDependency,
  SourceLocation,
  StatementIR,
  TextIR,
  TextToken
} from "./types";
import type {
  CommandIR,
  Diagnostic,
  NaniValue,
  ParseScenarioInput,
  ParseScenarioResult,
  ScenarioIR,
  SourceLocation,
  StatementIR,
  TextIR,
  TextToken
} from "./types";

const commandAssetKinds: Record<string, string> = {
  bgm: "bgm",
  sfx: "sfx",
  voice: "voice",
  back: "background",
  char: "portrait",
  video: "video"
};

export function parseScenario(input: ParseScenarioInput): ParseScenarioResult {
  const diagnostics: Diagnostic[] = [];
  const statements: StatementIR[] = [];
  const labels: Record<string, number> = {};
  const assets: ScenarioIR["assets"] = [];
  const dependencies: ScenarioIR["dependencies"] = [];
  const lines = input.sourceText.replace(/\r\n/g, "\n").split("\n");

  lines.forEach((raw, index) => {
    const line = index + 1;
    const column = firstNonWhitespaceColumn(raw);
    const trimmed = raw.trim();
    const loc: SourceLocation = { scriptPath: input.scriptPath, line, column, raw };

    if (trimmed.length === 0) return;

    if (trimmed.startsWith(";")) {
      statements.push({ kind: "comment", text: trimmed.slice(1).trim(), loc });
      return;
    }

    if (trimmed.startsWith("#")) {
      const name = trimmed.slice(1).trim();
      if (labels[name] !== undefined) {
        diagnostics.push({ severity: "error", message: `Duplicate label: ${name}`, loc });
      }
      labels[name] = statements.length;
      statements.push({ kind: "label", name, loc });
      return;
    }

    if (trimmed.startsWith("@")) {
      const command = parseCommand(trimmed.slice(1), loc);
      collectCommandMetadata(command, assets, dependencies);
      statements.push(command);
      return;
    }

    statements.push(parseText(trimmed, loc));
  });

  collectLocalLabelReferenceDiagnostics(statements, labels, diagnostics);

  return {
    scenario: {
      scriptPath: input.scriptPath,
      statements,
      labels,
      assets: dedupeAssets(assets),
      dependencies: dedupeDependencies(dependencies)
    },
    diagnostics
  };
}

function firstNonWhitespaceColumn(raw: string): number {
  const match = raw.match(/\S/);
  return match ? (match.index ?? 0) + 1 : 1;
}

function parseText(line: string, loc: SourceLocation): StatementIR {
  const speakerMatch = line.match(/^([A-Za-z0-9_. -]+):\s*(.*)$/);
  const speakerDirective = speakerMatch?.[1]?.trim();
  const body = speakerMatch?.[2] ?? line;
  const [speaker, appearance] = speakerDirective ? splitSpeaker(speakerDirective) : [undefined, undefined];
  const bodyStart = Math.max(0, line.indexOf(body));
  const tokens = parseInlineTokens(body, { ...loc, column: loc.column + bodyStart });
  const printParams: Record<string, NaniValue> = {};

  for (const token of tokens) {
    if (token.kind === "inline-command" && token.command.commandId === "<") {
      Object.assign(printParams, token.command.params);
    }
  }

  const statement: TextIR = {
    kind: "text",
    tokens,
    loc
  };
  if (speaker) statement.speaker = speaker;
  if (appearance) statement.appearance = appearance;
  if (Object.keys(printParams).length > 0) statement.printParams = printParams;
  return statement;
}

function splitSpeaker(value: string): [string | undefined, string | undefined] {
  const dot = value.indexOf(".");
  if (dot < 0) return [value, undefined];
  return [value.slice(0, dot), value.slice(dot + 1)];
}

function parseInlineTokens(text: string, loc: SourceLocation): TextToken[] {
  const tokens: TextToken[] = [];
  let buffer = "";
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\\" && (next === "[" || next === "]")) {
      buffer += next;
      i += 2;
      continue;
    }

    if (char === "[") {
      const close = findClosingBracket(text, i + 1);
      if (close >= 0) {
        if (buffer.length > 0) {
          tokens.push({ kind: "text", text: buffer });
          buffer = "";
        }
        const inlineSource = text.slice(i + 1, close).trim() || "noop";
        const command = parseCommand(inlineSource, { ...loc, column: loc.column + i });
        command.inlineIndex = tokens.length;
        tokens.push({ kind: "inline-command", command });
        i = close + 1;
        continue;
      }
    }

    buffer += char;
    i += 1;
  }

  if (buffer.length > 0) {
    tokens.push({ kind: "text", text: buffer });
  }

  return tokens;
}

function findClosingBracket(text: string, start: number): number {
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "]") return i;
  }
  return -1;
}

function parseCommand(source: string, loc: SourceLocation): CommandIR {
  const parts = splitCommandParts(source);
  const commandId = (parts.shift() ?? "noop").toLowerCase();
  const params: Record<string, NaniValue> = {};
  const flags: Record<string, boolean> = {};
  let primary: NaniValue | undefined;
  let condition: CommandIR["condition"];
  let unless: CommandIR["unless"];

  for (const part of parts) {
    if (part.endsWith("!") && !part.startsWith("!")) {
      flags[part.slice(0, -1)] = true;
      continue;
    }

    if (part.startsWith("!") && part.length > 1) {
      flags[part.slice(1)] = false;
      continue;
    }

    const colon = part.indexOf(":");
    if (colon > 0) {
      const key = part.slice(0, colon);
      const value = part.slice(colon + 1);
      if (!primary && shouldTreatColonPartAsPrimary(commandId, key)) {
        primary = parseValue(part);
        continue;
      }
      if (key === "if") {
        condition = { source: unwrapExpression(value) };
      } else if (key === "unless") {
        unless = { source: unwrapExpression(value) };
      } else {
        params[key] = parseValue(value);
      }
      continue;
    }

    primary ??= parseValue(part);
  }

  const command: CommandIR = {
    kind: "command",
    commandId,
    params,
    flags,
    loc
  };
  if (primary) command.primary = primary;
  if (condition) command.condition = condition;
  if (unless) command.unless = unless;
  return command;
}

function shouldTreatColonPartAsPrimary(commandId: string, key: string): boolean {
  if (commandId === "set") return false;
  if (key === "if" || key === "unless") return false;
  return !knownParameterKeys.has(key);
}

const knownParameterKeys = new Set([
  "color",
  "duration",
  "effect",
  "evidence",
  "fade",
  "goto",
  "id",
  "intensity",
  "portrait",
  "slot",
  "speaker",
  "speed",
  "target",
  "text",
  "volume"
]);

function splitCommandParts(source: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | undefined;
  let braceDepth = 0;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i] ?? "";

    if (quote) {
      if (char === "\\" && i + 1 < source.length) {
        current += source[i + 1];
        i += 1;
        continue;
      }
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;

    if (/\s/.test(char) && braceDepth === 0) {
      if (current.length > 0) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) parts.push(current);
  return parts;
}

function parseValue(raw: string): NaniValue {
  if (/^\{.*\}$/.test(raw)) return { type: "expression", source: raw.slice(1, -1) };
  if (/^-?\d+(\.\d+)?$/.test(raw)) return { type: "number", value: Number(raw) };
  if (raw === "true" || raw === "false") return { type: "boolean", value: raw === "true" };
  if (raw.includes(",")) return { type: "list", value: raw.split(",").map(parseValue) };
  if (raw.startsWith("#")) return { type: "raw", value: raw };
  return { type: "string", value: raw };
}

function unwrapExpression(raw: string): string {
  return raw.startsWith("{") && raw.endsWith("}") ? raw.slice(1, -1) : raw;
}

function collectCommandMetadata(
  command: CommandIR,
  assets: ScenarioIR["assets"],
  dependencies: ScenarioIR["dependencies"]
): void {
  const assetKind = commandAssetKinds[command.commandId];
  if (assetKind && command.primary?.type === "string") {
    assets.push({ id: command.primary.value, kind: assetKind });
  }

  if ((command.commandId === "goto" || command.commandId === "call") && command.primary?.type === "raw") {
    const endpoint = command.primary.value;
    if (!endpoint.startsWith("#")) dependencies.push({ endpoint });
  }
}

function collectLocalLabelReferenceDiagnostics(
  statements: StatementIR[],
  labels: Record<string, number>,
  diagnostics: Diagnostic[]
): void {
  for (const statement of statements) {
    if (statement.kind === "command") {
      collectCommandLocalLabelReferenceDiagnostics(statement, labels, diagnostics);
      continue;
    }

    if (statement.kind === "text") {
      for (const token of statement.tokens) {
        if (token.kind === "inline-command") {
          collectCommandLocalLabelReferenceDiagnostics(token.command, labels, diagnostics);
        }
      }
    }
  }
}

function collectCommandLocalLabelReferenceDiagnostics(
  command: CommandIR,
  labels: Record<string, number>,
  diagnostics: Diagnostic[]
): void {
  for (const target of localLabelTargetsForCommand(command)) {
    const label = target.slice(1);
    if (labels[label] === undefined) {
      diagnostics.push({
        severity: "error",
        message: `Missing local label reference: ${target}`,
        loc: command.loc
      });
    }
  }
}

function localLabelTargetsForCommand(command: CommandIR): string[] {
  const targets: string[] = [];

  if (command.primary?.type === "raw" && command.primary.value.startsWith("#")) {
    targets.push(command.primary.value);
  }

  const goto = command.params.goto;
  if (goto) collectLocalLabelTargetsFromValue(goto, targets);

  return targets;
}

function collectLocalLabelTargetsFromValue(value: NaniValue, targets: string[]): void {
  if (value.type === "raw" && value.value.startsWith("#")) {
    targets.push(value.value);
    return;
  }

  if (value.type === "list") {
    for (const item of value.value) collectLocalLabelTargetsFromValue(item, targets);
  }
}

function dedupeAssets(assets: ScenarioIR["assets"]): ScenarioIR["assets"] {
  return [...new Map(assets.map((asset) => [`${asset.kind}:${asset.id}`, asset])).values()];
}

function dedupeDependencies(dependencies: ScenarioIR["dependencies"]): ScenarioIR["dependencies"] {
  return [...new Map(dependencies.map((dependency) => [dependency.endpoint, dependency])).values()];
}

export const defaultParser = { parseScenario };
