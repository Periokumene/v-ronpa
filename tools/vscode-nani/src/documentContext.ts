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
    }
  | {
      kind: "label";
      range: NaniRange;
      prefix: string;
    }
  | {
      kind: "inline";
      range: NaniRange;
    }
  | {
      kind: "none";
    };

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
  const labelContext = getLabelCompletionContext(line, before, position.line);
  if (labelContext) return labelContext;

  const commandContext = getCommandCompletionContext(before, position.line);
  if (commandContext) return commandContext;

  const paramContext = getParamCompletionContext(before, position.line);
  if (paramContext) return paramContext;

  const inlineContext = getInlineCompletionContext(line, before, position.line);
  if (inlineContext) return inlineContext;

  return { kind: "none" };
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

function getParamCompletionContext(before: string, line: number): CompletionContext | undefined {
  const commandMatch = before.match(/^\s*@([A-Za-z_<>][A-Za-z0-9_<>-]*)\s+/u);
  const commandId = commandMatch?.[1];
  if (!commandId) return undefined;

  const tokenStart = currentTokenStart(before);
  const token = before.slice(tokenStart);
  if (token.includes(":") && !token.startsWith("!")) return undefined;

  return {
    kind: "param",
    commandId,
    range: {
      start: { line, character: tokenStart },
      end: { line, character: before.length }
    },
    usedParams: collectUsedParams(before.slice(0, tokenStart))
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
  if (/^\s*[@#;]/u.test(lineText)) return undefined;

  const bracketStart = before.lastIndexOf("[");
  const lastClose = before.lastIndexOf("]");
  if (bracketStart > lastClose) {
    return {
      kind: "inline",
      range: {
        start: { line, character: bracketStart },
        end: { line, character: before.length }
      }
    };
  }

  return {
    kind: "inline",
    range: cursorRange(line, before.length)
  };
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
