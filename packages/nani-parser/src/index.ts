export type {
  AssetRef,
  CommandArgIR,
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
  CommandArgIR,
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
  const args: CommandArgIR[] = [];
  const params: Record<string, NaniValue> = {};
  const flags: Record<string, boolean> = {};
  let primary: NaniValue | undefined;
  let condition: CommandIR["condition"];
  let unless: CommandIR["unless"];

  for (const part of parts) {
    if (part.endsWith("!") && !part.startsWith("!")) {
      const key = part.slice(0, -1);
      args.push({ kind: "flag", raw: part, key, value: true });
      flags[key] = true;
      continue;
    }

    if (part.startsWith("!") && part.length > 1) {
      const key = part.slice(1);
      args.push({ kind: "flag", raw: part, key, value: false });
      flags[key] = false;
      continue;
    }

    const colon = part.indexOf(":");
    if (colon > 0) {
      const key = part.slice(0, colon);
      const value = part.slice(colon + 1);
      const parsedValue = parseValue(value);
      args.push({ kind: "param", raw: part, key, value: parsedValue });
      if (key === "if") {
        condition = { source: unwrapExpression(value) };
      } else if (key === "unless") {
        unless = { source: unwrapExpression(value) };
      } else {
        params[key] = parsedValue;
      }
      continue;
    }

    const parsedValue = parseValue(part);
    args.push({ kind: "value", raw: part, value: parsedValue });
    primary ??= parsedValue;
  }

  const command: CommandIR = {
    kind: "command",
    commandId,
    args,
    params,
    flags,
    loc
  };
  if (primary) command.primary = primary;
  if (condition) command.condition = condition;
  if (unless) command.unless = unless;
  return command;
}

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
  const firstArgValue = firstCommandArgValue(command);
  if (assetKind && firstArgValue?.type === "string") {
    assets.push({ id: firstArgValue.value, kind: assetKind });
  }

  if (command.commandId === "char" || command.commandId === "slide") {
    const characterId = characterPackIdForActorAppearanceCommand(command);
    if (characterId) assets.push({ id: characterId, kind: "character-pack" });
  }

  if ((command.commandId === "goto" || command.commandId === "call") && firstArgValue?.type === "raw") {
    const endpoint = firstArgValue.value;
    if (!endpoint.startsWith("#")) dependencies.push({ endpoint });
  }
}

function characterPackIdForActorAppearanceCommand(command: CommandIR): string | undefined {
  const raw = command.args.find((arg) => arg.kind === "value")?.raw;
  if (command.commandId === "slide" && (!raw || !raw.includes("."))) return undefined;
  const idParam = command.params.id;
  const idFromParam = idParam ? stringValue(idParam) : undefined;
  const idFromPrimary = raw ? raw.split(/[.,]/u)[0] : undefined;
  const id = idFromParam ?? idFromPrimary;
  if (!id || id === "*") return undefined;
  return id;
}

function stringValue(value: NaniValue): string | undefined {
  if (value.type === "string" || value.type === "raw") return value.value;
  return undefined;
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

  const firstArgValue = firstCommandArgValue(command);
  if (firstArgValue?.type === "raw" && firstArgValue.value.startsWith("#")) {
    targets.push(firstArgValue.value);
  }

  const goto = command.params.goto;
  if (goto) collectLocalLabelTargetsFromValue(goto, targets);

  return targets;
}

function firstCommandArgValue(command: CommandIR): NaniValue | undefined {
  const first = command.args.find((arg) => arg.kind === "value" || (arg.kind === "param" && !isConditionArgKey(arg.key)));
  if (!first) return command.primary;
  return first.kind === "value" ? first.value : parseValue(first.raw);
}

function isConditionArgKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized === "if" || normalized === "unless";
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
