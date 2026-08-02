export interface NaniPosition {
  line: number;
  character: number;
}

export interface NaniRange {
  start: NaniPosition;
  end: NaniPosition;
}

export type CompletionContext =
  | {
      kind: "command";
      range: NaniRange;
      insertAtSign: boolean;
    }
  | {
      kind: "param";
      commandId: string;
      range: NaniRange;
      usedParams: Set<string>;
      primaryCandidate?: {
        prefix: string;
        range: NaniRange;
      };
    }
  | {
      kind: "param-value";
      commandId: string;
      paramName: string;
      range: NaniRange;
      prefix: string;
    }
  | {
      kind: "label";
      range: NaniRange;
      prefix: string;
    }
  | {
      kind: "endpoint";
      phase: "target" | "label";
      range: NaniRange;
      prefix: string;
      targetPath?: string;
    }
  | {
      kind: "inline";
      mode: InlineTextMode;
      range: NaniRange;
    }
  | {
      kind: "none";
    };

export type InlineTextMode = "dialogue" | "explicit-quoted" | "explicit-unquoted";

export function splitSourceLines(sourceText: string): string[] {
  return sourceText.replace(/\r\n/g, "\n").split("\n");
}

export function lineAt(sourceText: string, line: number): string {
  return splitSourceLines(sourceText)[line] ?? "";
}

export function collectLabels(sourceText: string): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const line of splitSourceLines(sourceText)) {
    const match = line.match(/^\s*#(.+?)\s*$/u);
    const label = match?.[1]?.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }

  return labels;
}

export function getCompletionContext(sourceText: string, position: NaniPosition): CompletionContext {
  const line = lineAt(sourceText, position.line);
  const character = clamp(position.character, 0, line.length);
  const before = line.slice(0, character);
  const endpointContext = getEndpointCompletionContext(before, position.line);
  if (endpointContext) return endpointContext;
  const labelContext = getLabelCompletionContext(line, before, position.line);
  if (labelContext) return labelContext;

  const commandContext = getCommandCompletionContext(before, position.line);
  if (commandContext) return commandContext;

  const inlineContext = getInlineCompletionContext(line, before, position.line);
  if (inlineContext) return inlineContext;

  const paramValueContext = getParamValueCompletionContext(before, position.line);
  if (paramValueContext) return paramValueContext;

  const paramContext = getParamCompletionContext(before, position.line);
  if (paramContext) return paramContext;

  return { kind: "none" };
}

export function getInlineTextMode(lineText: string, character: number): InlineTextMode | undefined {
  const safe = clamp(character, 0, lineText.length);
  if (/^\s*[@#;]/u.test(lineText)) {
    const text = explicitStaticText(lineText);
    return text && safe >= text.start && safe <= text.end ? text.mode : undefined;
  }
  const colon = lineText.indexOf(":");
  return colon >= 0 && safe > colon ? "dialogue" : undefined;
}

export interface NaniEndpointToken {
  raw: string;
  range: NaniRange;
}

export function getEndpointTokenAtPosition(
  sourceText: string,
  position: NaniPosition
): NaniEndpointToken | undefined {
  const line = lineAt(sourceText, position.line);
  const goto = /^\s*@goto\s+(\S+)/u.exec(line);
  const choice = /^\s*@choice\b.*?(?:^|\s)goto:(\S+)/u.exec(line);
  const match = goto ?? choice;
  const raw = match?.[1];
  if (!match || !raw) return undefined;
  const start = (match.index ?? 0) + match[0].lastIndexOf(raw);
  const end = start + raw.length;
  if (position.character < start || position.character > end) return undefined;
  return {
    raw,
    range: {
      start: { line: position.line, character: start },
      end: { line: position.line, character: end }
    }
  };
}

export function lineRange(line: number, text: string): NaniRange {
  const firstNonWhitespace = text.search(/\S/u);
  const startCharacter = firstNonWhitespace >= 0 ? firstNonWhitespace : 0;
  return {
    start: { line, character: startCharacter },
    end: { line, character: Math.max(startCharacter + 1, text.length) }
  };
}

function getCommandCompletionContext(before: string, line: number): CompletionContext | undefined {
  if (/^\s*$/u.test(before)) {
    return {
      kind: "command",
      range: cursorRange(line, before.length),
      insertAtSign: true
    };
  }

  const match = before.match(/^(\s*)@([A-Za-z0-9_<>-]*)$/u);
  if (!match) return undefined;

  const indent = match[1]?.length ?? 0;
  return {
    kind: "command",
    range: {
      start: { line, character: indent + 1 },
      end: { line, character: before.length }
    },
    insertAtSign: false
  };
}

function getEndpointCompletionContext(
  before: string,
  line: number
): CompletionContext | undefined {
  const goto = /^(\s*@goto\s+)(\S*)$/u.exec(before);
  const choice = /^\s*@choice\b.*?(?:^|\s)goto:(\S*)$/u.exec(before);
  const raw = goto?.[2] ?? choice?.[1];
  if (raw === undefined || raw.startsWith("{") || raw.startsWith("\"") || raw.startsWith("'")) {
    return undefined;
  }
  const start = goto
    ? (goto[1]?.length ?? 0)
    : before.length - raw.length;
  const hash = raw.lastIndexOf("#");
  if (hash >= 0) {
    return {
      kind: "endpoint",
      phase: "label",
      range: {
        start: { line, character: start + hash + 1 },
        end: { line, character: before.length }
      },
      prefix: raw.slice(hash + 1),
      ...(hash > 0 ? { targetPath: raw.slice(0, hash) } : {})
    };
  }
  return {
    kind: "endpoint",
    phase: "target",
    range: {
      start: { line, character: start },
      end: { line, character: before.length }
    },
    prefix: raw
  };
}

function getParamValueCompletionContext(before: string, line: number): CompletionContext | undefined {
  const commandMatch = before.match(/^\s*@([A-Za-z_<>][A-Za-z0-9_<>-]*)\s+/u);
  const commandId = commandMatch?.[1];
  if (!commandId) return undefined;

  const tokenStart = currentTokenStart(before);
  const token = before.slice(tokenStart);
  const colon = token.indexOf(":");
  if (colon <= 0) return undefined;

  const paramName = token.slice(0, colon);
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(paramName)) return undefined;

  const valueStart = tokenStart + colon + 1;
  const valuePrefix = before.slice(valueStart);
  if (valuePrefix.startsWith("{") || valuePrefix.startsWith("\"") || valuePrefix.startsWith("'")) return undefined;

  const segmentStart = valuePrefix.lastIndexOf(",") + 1;
  const replaceStart = valueStart + segmentStart;
  const prefix = before.slice(replaceStart);
  if (prefix.includes("{") || prefix.includes("\"") || prefix.includes("'")) return undefined;

  return {
    kind: "param-value",
    commandId,
    paramName,
    range: {
      start: { line, character: replaceStart },
      end: { line, character: before.length }
    },
    prefix
  };
}

function getParamCompletionContext(before: string, line: number): CompletionContext | undefined {
  const commandMatch = before.match(/^\s*@([A-Za-z_<>][A-Za-z0-9_<>-]*)\s+/u);
  const commandId = commandMatch?.[1];
  if (!commandId) return undefined;

  const tokenStart = currentTokenStart(before);
  const token = before.slice(tokenStart);
  if (token.includes(":") && !token.startsWith("!")) return undefined;
  const completedArguments = before.slice(commandMatch[0].length, tokenStart).trim();
  const primaryCandidate =
    completedArguments.length === 0 &&
    !token.includes(":") &&
    !token.startsWith("!") &&
    !token.endsWith("!") &&
    !token.startsWith("{") &&
    !token.startsWith("\"") &&
    !token.startsWith("'")
      ? {
          prefix: token,
          range: {
            start: { line, character: tokenStart },
            end: { line, character: before.length }
          }
        }
      : undefined;

  return {
    kind: "param",
    commandId,
    range: {
      start: { line, character: tokenStart },
      end: { line, character: before.length }
    },
    usedParams: collectUsedParams(before.slice(0, tokenStart)),
    ...(primaryCandidate ? { primaryCandidate } : {})
  };
}

function getLabelCompletionContext(lineText: string, before: string, line: number): CompletionContext | undefined {
  if (/^\s*[#;]/u.test(lineText)) return undefined;

  const commandMatch = before.match(/^\s*@([A-Za-z_<>][A-Za-z0-9_<>-]*)\b/u);
  const commandId = commandMatch?.[1]?.toLowerCase();
  const tokenStart = currentTokenStart(before);
  const token = before.slice(tokenStart);
  const hashIndex = token.lastIndexOf("#");
  if (hashIndex < 0) return undefined;

  const beforeHash = token.slice(0, hashIndex).toLowerCase();
  const isGotoPrimary = commandId === "goto" && token.startsWith("#");
  const isGotoParam = beforeHash.endsWith("goto:");
  if (!isGotoPrimary && !isGotoParam) return undefined;

  const labelStart = tokenStart + hashIndex + 1;
  return {
    kind: "label",
    range: {
      start: { line, character: labelStart },
      end: { line, character: before.length }
    },
    prefix: before.slice(labelStart)
  };
}

function getInlineCompletionContext(lineText: string, before: string, line: number): CompletionContext | undefined {
  if (/^\s*$/u.test(before)) return undefined;
  const mode = getInlineTextMode(lineText, before.length);
  if (!mode) return undefined;

  const bracketStart = lastUnescapedOpenBracket(before);
  const lastClose = before.lastIndexOf("]");
  if (bracketStart > lastClose) {
    return {
      kind: "inline",
      mode,
      range: {
        start: { line, character: bracketStart },
        end: { line, character: before.length }
      }
    };
  }

  return {
    kind: "inline",
    mode,
    range: cursorRange(line, before.length)
  };
}

function explicitStaticText(lineText: string): {
  start: number;
  end: number;
  mode: Exclude<InlineTextMode, "dialogue">;
} | undefined {
  const command = /^\s*@([A-Za-z_<>][A-Za-z0-9_<>-]*)\b/u.exec(lineText);
  const commandId = command?.[1];
  const definition = commandId ? getNaniCommandDefinition(commandId) : undefined;
  if (!command || !definition || (definition.id !== "print" && definition.id !== "cue")) return undefined;

  const argsStart = command[0].length;
  const tokens = argumentTokens(lineText, argsStart);
  if (tokens.some((token) =>
    /^(?:if|unless)(?::|!|$)/iu.test(token.text)
    || /^(?:append!|append:true)$/iu.test(token.text)
  )) return undefined;
  const paramNames = new Set([
    ...definition.params.flatMap((param) => [param.name, ...(param.aliases ?? [])]),
    "if",
    "unless"
  ].map((name) => name.toLowerCase()));
  const namedText = tokens.find((token) => /^text:/iu.test(token.text));
  let valueStart: number;
  let primary = false;
  if (namedText) {
    valueStart = namedText.start + namedText.text.indexOf(":") + 1;
  } else {
    const first = tokens[0];
    if (!first || parameterName(first.text, paramNames)) return undefined;
    valueStart = first.start;
    primary = true;
  }
  const firstCharacter = lineText[valueStart];
  if (!firstCharacter || firstCharacter === "{") return undefined;
  if (firstCharacter === '"' || firstCharacter === "'") {
    const close = closingQuote(lineText, valueStart, firstCharacter);
    return {
      start: valueStart + 1,
      end: close < 0 ? lineText.length : close,
      mode: "explicit-quoted"
    };
  }
  const token = tokens.find((candidate) =>
    valueStart >= candidate.start && valueStart <= candidate.end
  );
  if (!token) return undefined;
  const boundary = primary
    ? tokens.find((candidate) =>
      candidate.start > token.start && parameterName(candidate.text, paramNames)
    )?.start ?? lineText.length
    : token.end;
  return { start: valueStart, end: boundary, mode: "explicit-unquoted" };
}

function argumentTokens(source: string, start: number): readonly { text: string; start: number; end: number }[] {
  const tokens: { text: string; start: number; end: number }[] = [];
  let tokenStart = -1;
  let quote = "";
  let braces = 0;
  let escaped = false;
  for (let index = start; index <= source.length; index += 1) {
    if (index === source.length) {
      if (tokenStart >= 0) {
        tokens.push({ text: source.slice(tokenStart), start: tokenStart, end: source.length });
      }
      break;
    }
    const character = source[index] ?? " ";
    if (tokenStart < 0) {
      if (/\s/u.test(character)) continue;
      tokenStart = index;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") braces += 1;
    else if (character === "}" && braces > 0) braces -= 1;
    if (braces === 0 && /\s/u.test(character)) {
      tokens.push({ text: source.slice(tokenStart, index), start: tokenStart, end: index });
      tokenStart = -1;
    }
  }
  return tokens;
}

function parameterName(token: string, paramNames: ReadonlySet<string>): string | undefined {
  const match = /^(?:!([A-Za-z_][A-Za-z0-9_-]*)|([A-Za-z_][A-Za-z0-9_-]*)(?::|!))/u.exec(token);
  const name = (match?.[1] ?? match?.[2])?.toLowerCase();
  return name && paramNames.has(name) ? name : undefined;
}

function closingQuote(source: string, start: number, quote: string): number {
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === quote) return index;
  }
  return -1;
}

function lastUnescapedOpenBracket(source: string): number {
  for (let index = source.length - 1; index >= 0; index -= 1) {
    if (source[index] !== "[") continue;
    let slashes = 0;
    for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) slashes += 1;
    if (slashes % 2 === 0) return index;
  }
  return -1;
}

function collectUsedParams(source: string): Set<string> {
  const used = new Set<string>();
  for (const match of source.matchAll(/(?:^|\s)(?:!([A-Za-z_][A-Za-z0-9_-]*)|([A-Za-z_][A-Za-z0-9_-]*)(?::|!))/gu)) {
    const key = match[1] ?? match[2];
    if (key) used.add(key.toLowerCase());
  }
  return used;
}

function currentTokenStart(source: string): number {
  const match = source.match(/\S+$/u);
  return match?.index ?? source.length;
}

function cursorRange(line: number, character: number): NaniRange {
  return {
    start: { line, character },
    end: { line, character }
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
import { getNaniCommandDefinition } from "@v-ronpa/contracts";
