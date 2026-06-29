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
  RichTextDocumentIR,
  RichTextRunIR,
  RichTextRunStyleIR,
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
  RichTextDocumentIR,
  RichTextRunIR,
  RichTextRunStyleIR,
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

const textIdPattern = /\|#([^|]*)\|/gu;
const textIdValuePattern = /^[a-zA-Z0-9_-]+$/u;
const richTextCommandIds = new Set(["print", "append", "choice", "toast"]);
const richTextIdPattern = /^[a-zA-Z0-9:_./-]+$/u;
const safeColorPattern = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/u;
const safeNamedColors = new Set([
  "black",
  "white",
  "red",
  "green",
  "blue",
  "yellow",
  "cyan",
  "magenta",
  "gray",
  "grey",
  "orange",
  "purple",
  "pink",
  "brown"
]);
const fontSizeScaleByHtmlSize: Record<number, number> = {
  1: 0.75,
  2: 0.875,
  3: 1,
  4: 1.125,
  5: 1.25,
  6: 1.5,
  7: 1.75
};

interface RichTextParseResult {
  document: RichTextDocumentIR;
  diagnostics: string[];
}

interface ActiveRichTextTag {
  name: string;
  start: number;
  style: RichTextRunStyleIR;
}

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
      attachCommandRichText(command, diagnostics);
      collectCommandMetadata(command, assets, dependencies);
      statements.push(command);
      return;
    }

    statements.push(parseText(trimmed, loc, diagnostics));
  });

  collectDuplicateTextIdDiagnostics(statements, diagnostics);
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

export function parseRichText(source: string): RichTextParseResult {
  const output: string[] = [];
  const runs: RichTextRunIR[] = [];
  const stack: ActiveRichTextTag[] = [];
  const diagnostics: string[] = [];

  function fallback(message: string): RichTextParseResult {
    return {
      document: { text: decodeRichTextEntities(source), runs: [] },
      diagnostics: [message]
    };
  }

  let i = 0;
  while (i < source.length) {
    const char = source[i] ?? "";

    if (char === "&") {
      const entity = readRichTextEntity(source, i);
      if (entity) {
        output.push(entity.value);
        i = entity.end;
        continue;
      }
    }

    if (char !== "<") {
      const unit = Array.from(source.slice(i, i + 2))[0] ?? char;
      output.push(unit);
      i += unit.length;
      continue;
    }

    const close = source.indexOf(">", i + 1);
    if (close < 0) return fallback("Unclosed rich text tag.");

    const rawTag = source.slice(i + 1, close).trim();
    if (!rawTag) return fallback("Empty rich text tag is unsupported.");

    const selfClosing = rawTag.endsWith("/");
    const tagSource = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const lowerTagSource = tagSource.toLowerCase();
    if (lowerTagSource === "br" || lowerTagSource === "br/") {
      output.push("\n");
      i = close + 1;
      continue;
    }

    if (tagSource.startsWith("/")) {
      const closeName = tagSource.slice(1).trim().toLowerCase();
      const expected = canonicalRichTextTagName(closeName);
      const active = stack.pop();
      if (!expected || !active || active.name !== expected) {
        return fallback(`Mismatched rich text closing tag: ${tagSource}.`);
      }
      const end = output.length;
      if (end > active.start) runs.push({ start: active.start, end, style: active.style });
      i = close + 1;
      continue;
    }

    const parsedTag = parseRichTextOpenTag(tagSource);
    if (parsedTag.diagnostic) return fallback(parsedTag.diagnostic);
    if (!parsedTag.name || !parsedTag.style) return fallback(`Unsupported rich text tag: ${tagSource}.`);
    if (selfClosing) return fallback(`Self-closing rich text tag is unsupported: ${tagSource}.`);

    stack.push({ name: parsedTag.name, start: output.length, style: parsedTag.style });
    i = close + 1;
  }

  if (stack.length > 0) return fallback(`Unclosed rich text tag: ${stack.at(-1)?.name ?? "unknown"}.`);

  return { document: { text: output.join(""), runs }, diagnostics };
}

function readRichTextEntity(source: string, start: number): { value: string; end: number } | undefined {
  const semicolon = source.indexOf(";", start + 1);
  if (semicolon < 0) return undefined;
  const entity = source.slice(start + 1, semicolon);
  const value = richTextEntityValue(entity);
  return value === undefined ? undefined : { value, end: semicolon + 1 };
}

function decodeRichTextEntities(source: string): string {
  let output = "";
  let i = 0;
  while (i < source.length) {
    const entity = source[i] === "&" ? readRichTextEntity(source, i) : undefined;
    if (entity) {
      output += entity.value;
      i = entity.end;
      continue;
    }
    output += source[i] ?? "";
    i += 1;
  }
  return output;
}

function richTextEntityValue(entity: string): string | undefined {
  switch (entity) {
    case "nbsp":
      return "\u00a0";
    case "lt":
      return "<";
    case "gt":
      return ">";
    case "amp":
      return "&";
    case "quot":
      return "\"";
    default:
      return undefined;
  }
}

function parseRichTextOpenTag(source: string): { name?: string; style?: RichTextRunStyleIR; diagnostic?: string } {
  const match = source.match(/^([a-zA-Z][a-zA-Z0-9_-]*)([\s\S]*)$/u);
  if (!match) return { diagnostic: `Unsupported rich text tag: ${source}.` };
  const rawName = (match[1] ?? "").toLowerCase();
  const attrSource = (match[2] ?? "").trim();
  const name = canonicalRichTextTagName(rawName);
  if (!name) return { diagnostic: `Unsupported rich text tag: ${rawName}.` };
  if (name !== "font" && attrSource.length > 0) return { diagnostic: `Rich text tag '${rawName}' does not accept attributes.` };

  switch (name) {
    case "b":
      return { name, style: { bold: true } };
    case "i":
      return { name, style: { italic: true } };
    case "u":
      return { name, style: { underline: true } };
    case "s":
      return { name, style: { strike: true } };
    case "mark":
      return { name, style: { markColor: "default" } };
    case "small":
      return { name, style: { sizeScale: 0.85 } };
    case "big":
      return { name, style: { sizeScale: 1.15 } };
    case "sub":
      return { name, style: { verticalAlign: "sub" } };
    case "sup":
      return { name, style: { verticalAlign: "sup" } };
    case "font":
      return parseFontRichTextTag(attrSource);
    default:
      return { diagnostic: `Unsupported rich text tag: ${rawName}.` };
  }
}

function canonicalRichTextTagName(name: string): string | undefined {
  switch (name.toLowerCase()) {
    case "b":
    case "strong":
      return "b";
    case "i":
    case "em":
      return "i";
    case "u":
      return "u";
    case "s":
    case "strike":
    case "del":
      return "s";
    case "mark":
    case "small":
    case "big":
    case "sub":
    case "sup":
    case "font":
      return name.toLowerCase();
    default:
      return undefined;
  }
}

function parseFontRichTextTag(attrSource: string): { name?: string; style?: RichTextRunStyleIR; diagnostic?: string } {
  const parsedAttrs = parseRichTextAttributes(attrSource, new Set(["color", "size", "face"]));
  if (parsedAttrs.diagnostic) return { diagnostic: parsedAttrs.diagnostic };
  const attrs = parsedAttrs.attrs;
  const style: RichTextRunStyleIR = {};
  const color = attrs.get("color");
  const size = attrs.get("size");
  const face = attrs.get("face");

  if (color !== undefined) {
    if (!isSafeRichTextColor(color)) return { diagnostic: `Invalid rich text font color: ${color}.` };
    style.color = color;
  }

  if (size !== undefined) {
    const sizeScale = htmlFontSizeScale(size);
    if (sizeScale === undefined) return { diagnostic: `Invalid rich text font size: ${size}.` };
    style.sizeScale = sizeScale;
  }

  if (face !== undefined) {
    if (!richTextIdPattern.test(face) || !face.startsWith("font:")) return { diagnostic: `Invalid rich text font face: ${face}.` };
    style.fontId = face;
  }

  if (Object.keys(style).length === 0) return { diagnostic: "Rich text font tag requires color, size, or face." };
  return { name: "font", style };
}

function parseRichTextAttributes(source: string, allowedKeys: Set<string>): { attrs: Map<string, string>; diagnostic?: string } {
  const attrs = new Map<string, string>();
  let i = 0;
  while (i < source.length) {
    while (/\s/u.test(source[i] ?? "")) i += 1;
    if (i >= source.length) break;
    const match = /^([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/u.exec(source.slice(i));
    if (!match) return { attrs, diagnostic: `Invalid rich text attribute syntax: ${source.slice(i).trim()}.` };
    const key = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4];
    if (!key || value === undefined) return { attrs, diagnostic: `Invalid rich text attribute syntax: ${source.slice(i).trim()}.` };
    if (!allowedKeys.has(key)) return { attrs, diagnostic: `Unsupported rich text font attribute: ${key}.` };
    if (attrs.has(key)) return { attrs, diagnostic: `Duplicate rich text font attribute: ${key}.` };
    attrs.set(key, value);
    i += match[0].length;
  }
  return { attrs };
}

function isSafeRichTextColor(value: string): boolean {
  return safeColorPattern.test(value) || safeNamedColors.has(value.toLowerCase());
}

function htmlFontSizeScale(value: string): number | undefined {
  const numeric = Number(value);
  if (/^[1-7]$/u.test(value)) return fontSizeScaleByHtmlSize[numeric];
  if (/^[+-][1-6]$/u.test(value)) {
    const adjusted = Math.min(7, Math.max(1, 3 + numeric));
    return fontSizeScaleByHtmlSize[adjusted];
  }
  return undefined;
}

function firstNonWhitespaceColumn(raw: string): number {
  const match = raw.match(/\S/);
  return match ? (match.index ?? 0) + 1 : 1;
}

function parseText(line: string, loc: SourceLocation, diagnostics: Diagnostic[]): StatementIR {
  const speakerMatch = line.match(/^([A-Za-z0-9_. -]+):\s*(.*)$/);
  const speakerDirective = speakerMatch?.[1]?.trim();
  const body = speakerMatch?.[2] ?? line;
  const [speaker, appearance] = speakerDirective ? splitSpeaker(speakerDirective) : [undefined, undefined];
  const bodyStart = Math.max(0, line.indexOf(body));
  const tokens = parseInlineTokens(body, { ...loc, column: loc.column + bodyStart });
  const printParams: Record<string, NaniValue> = {};
  const textIdResult = extractTextIdFromTokens(tokens);

  if (textIdResult.diagnostic) {
    diagnostics.push({ severity: "error", message: textIdResult.diagnostic, loc });
  }

  for (const token of tokens) {
    if (token.kind === "inline-command" && token.command.commandId === "<") {
      Object.assign(printParams, token.command.params);
    }
  }
  const rawText = tokens.filter((token) => token.kind === "text").map((token) => token.text).join("");
  const richText = parseRichText(rawText);
  for (const message of richText.diagnostics) {
    diagnostics.push({ severity: "warning", message, loc });
  }

  const statement: TextIR = {
    kind: "text",
    tokens,
    loc
  };
  if (speaker) statement.speaker = speaker;
  if (appearance) statement.appearance = appearance;
  if (textIdResult.textId) statement.textId = textIdResult.textId;
  if (shouldAttachRichText(rawText, richText.document)) statement.richText = richText.document;
  if (Object.keys(printParams).length > 0) statement.printParams = printParams;
  return statement;
}

function shouldAttachRichText(source: string, document: RichTextDocumentIR): boolean {
  return document.runs.length > 0 || document.text !== source;
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

function extractTextIdFromTokens(tokens: TextToken[]): { textId?: string; diagnostic?: string } {
  const matches: string[] = [];

  for (const token of tokens) {
    if (token.kind !== "text") continue;
    token.text = token.text.replace(textIdPattern, (_marker, id: string) => {
      matches.push(id);
      return "";
    });
  }

  if (matches.length === 0) return {};
  if (matches.length > 1) return { diagnostic: "Text line may contain only one textId marker." };

  const textId = matches[0] ?? "";
  if (!textId || !textIdValuePattern.test(textId)) {
    return { diagnostic: `Invalid textId marker: ${textId || "(empty)"}` };
  }

  return { textId };
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

function attachCommandRichText(command: CommandIR, diagnostics: Diagnostic[]): void {
  if (!richTextCommandIds.has(command.commandId)) return;
  const primary = command.primary;
  const primaryResult = primary?.type === "string" ? parseRichText(primary.value) : undefined;
  if (primaryResult) {
    for (const message of primaryResult.diagnostics) diagnostics.push({ severity: "warning", message, loc: command.loc });
    if (primary?.type === "string" && shouldAttachRichText(primary.value, primaryResult.document)) command.richTextPrimary = primaryResult.document;
  }

  const richTextParams: Record<string, RichTextDocumentIR> = {};
  for (const [key, value] of Object.entries(command.params)) {
    if (value.type !== "string" || !isRichTextCommandParam(command.commandId, key)) continue;
    const result = parseRichText(value.value);
    for (const message of result.diagnostics) diagnostics.push({ severity: "warning", message, loc: command.loc });
    if (shouldAttachRichText(value.value, result.document)) richTextParams[key] = result.document;
  }
  if (Object.keys(richTextParams).length > 0) command.richTextParams = richTextParams;
}

function isRichTextCommandParam(commandId: string, key: string): boolean {
  if (commandId === "print" || commandId === "append" || commandId === "toast") return key === "text";
  if (commandId === "choice") return key === "choiceSummary" || key === "text";
  return false;
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

function collectDuplicateTextIdDiagnostics(statements: StatementIR[], diagnostics: Diagnostic[]): void {
  const seen = new Map<string, SourceLocation>();
  for (const statement of statements) {
    if (statement.kind !== "text" || !statement.textId) continue;
    if (seen.has(statement.textId)) {
      diagnostics.push({
        severity: "error",
        message: `Duplicate textId: ${statement.textId}`,
        loc: statement.loc
      });
      continue;
    }
    seen.set(statement.textId, statement.loc);
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
