import { scanCommandParts, type ScannedCommandPart } from "./commandScanner.ts";
import {
  firstNonEmptyDiagnosticSpan,
  reportNaniDiagnostic,
  type NaniDiagnosticSink
} from "./diagnostics.ts";
import { parseSourcedRichText, shouldAttachRichText } from "./richText.ts";
import { staticNaniEndpointText } from "./endpoint.ts";
import { scanSourceLines, sourceLocation, textSpan, type NaniSourceLine } from "./sourceText.ts";
import {
  appendSourcedText,
  appendSourcedUnit,
  concatSourcedText,
  emptySourcedText,
  identitySourcedText,
  removeSourcedRanges,
  sliceSourcedText,
  spanForSourcedRange,
  type SourcedText
} from "./sourcedText.ts";
import type {
  CommandArgIR,
  CommandIR,
  NaniCommandArgumentSourceMap,
  NaniCommandSourceMap,
  NaniInlineCommandSourceMap,
  NaniParserDiagnostic,
  NaniSourceMap,
  NaniStatementSourceMap,
  NaniTextIdSourceMap,
  NaniValue,
  ParseScenarioInput,
  ParseScenarioResult,
  ScenarioIR,
  SourceLocation,
  StatementIR,
  TextIR,
  TextStageIR,
  TextSpan,
  TextToken
} from "./types";

const commandAssetKinds: Record<string, string> = {
  bgm: "bgm",
  sfx: "sfx",
  voice: "voice",
  back: "background",
  inback: "background",
  video: "video"
};
const textIdPattern = /\|#([^|]*)\|/gu;
const textIdValuePattern = /^[a-zA-Z0-9_-]+$/u;
const richTextCommandIds = new Set(["print", "cue", "append", "choice", "toast"]);

interface ParsedCommand {
  readonly command: CommandIR;
  readonly sourceMap: NaniCommandSourceMap;
  readonly argumentValues: readonly SourcedText[];
  readonly metadataFirstValue?: NaniValue;
}

interface ParsedText {
  readonly statement: TextIR;
  readonly sourceMap: NaniStatementSourceMap;
}

interface ParsedInlineTokens {
  readonly tokens: TextToken[];
  readonly textSources: Array<{ readonly tokenIndex: number; readonly source: SourcedText }>;
  readonly inlineCommands: NaniInlineCommandSourceMap[];
  readonly hasStageStop: boolean;
}

type InlineTextContext = "ordinary" | "story-command";

interface ParsedInlineTextContent extends ParsedInlineTokens {
  readonly visibleSource: SourcedText;
  readonly richText: ReturnType<typeof parseSourcedRichText>;
  readonly textStages?: TextStageIR[];
  readonly textId?: string;
  readonly textIdMarkers: readonly NaniTextIdSourceMap[];
}

interface ExtractedTextId {
  readonly textId?: string;
  readonly diagnostics: readonly {
    code: "invalid-text-id" | "multiple-text-ids";
    message: string;
    span: TextSpan;
  }[];
  readonly markers: readonly NaniTextIdSourceMap[];
  readonly textSources: readonly { readonly tokenIndex: number; readonly source: SourcedText }[];
}

interface LocalLabelTarget {
  readonly target: string;
  readonly span: TextSpan;
}

export function parseScenario(input: ParseScenarioInput): ParseScenarioResult {
  const diagnostics: NaniParserDiagnostic[] = [];
  const statements: StatementIR[] = [];
  const statementSources: NaniStatementSourceMap[] = [];
  const labels: Record<string, number> = {};
  const assets: ScenarioIR["assets"] = [];
  const dependencies: ScenarioIR["dependencies"] = [];
  const commandMetadata = new WeakMap<CommandIR, NaniValue>();

  for (const line of scanSourceLines(input.sourceText)) {
    if (line.trimmed.length === 0) continue;
    const statementIndex = statements.length;
    const loc = sourceLocation(input.scriptPath, line);
    const markerSpan = textSpan(line.trimmedSpan.start, line.trimmedSpan.start + 1);

    if (line.trimmed.startsWith(";")) {
      statements.push({ kind: "comment", text: line.trimmed.slice(1).trim(), loc });
      statementSources.push(emptyStatementSource("comment", line.trimmedSpan, markerSpan));
      continue;
    }

    if (line.trimmed.startsWith("#")) {
      const name = line.trimmed.slice(1).trim();
      const nameSpan = trimmedSubspan(input.sourceText, {
        start: markerSpan.end,
        end: line.trimmedSpan.end
      });
      if (labels[name] !== undefined) {
        reportNaniDiagnostic(
          diagnostics,
          loc,
          "duplicate-label",
          "error",
          `Duplicate label: ${name}`,
          { span: nameSpan.end > nameSpan.start ? nameSpan : markerSpan }
        );
      }
      labels[name] = statementIndex;
      statements.push({ kind: "label", name, loc });
      statementSources.push({
        kind: "label",
        span: line.trimmedSpan,
        markerSpan,
        nameSpan,
        inlineCommands: [],
        textIds: []
      });
      continue;
    }

    if (line.trimmed.startsWith("@")) {
      const parsed = parseCommand(
        input.sourceText,
        { start: markerSpan.end, end: line.trimmedSpan.end },
        line.trimmedSpan,
        markerSpan,
        loc,
        diagnostics,
        {}
      );
      if (parsed.metadataFirstValue) commandMetadata.set(parsed.command, parsed.metadataFirstValue);
      const inlineText = attachCommandInlineText(
        input.sourceText,
        parsed,
        diagnostics,
        commandMetadata
      );
      collectCommandMetadata(parsed, assets, dependencies);
      statements.push(parsed.command);
      statementSources.push({
        kind: "command",
        span: line.trimmedSpan,
        markerSpan,
        nameSpan: parsed.sourceMap.nameSpan,
        command: parsed.sourceMap,
        inlineCommands: inlineText?.inlineCommands ?? [],
        textIds: []
      });
      continue;
    }

    const parsed = parseText(input.sourceText, line, loc, diagnostics, commandMetadata);
    statements.push(parsed.statement);
    statementSources.push(parsed.sourceMap);
  }

  collectDuplicateTextIdDiagnostics(statements, statementSources, diagnostics);
  collectLocalLabelReferenceDiagnostics(statements, statementSources, labels, diagnostics, commandMetadata);

  const sourceMap: NaniSourceMap = {
    scriptPath: input.scriptPath,
    sourceLength: input.sourceText.length,
    statements: statementSources
  };
  return {
    scenario: {
      scriptPath: input.scriptPath,
      statements,
      labels,
      assets: dedupeAssets(assets),
      dependencies: dedupeDependencies(dependencies)
    },
    sourceMap,
    diagnostics
  };
}

function parseText(
  sourceText: string,
  line: NaniSourceLine,
  loc: SourceLocation,
  diagnostics: NaniDiagnosticSink,
  commandMetadata: WeakMap<CommandIR, NaniValue>
): ParsedText {
  const lineSource = identitySourcedText(sourceText, line.trimmedSpan);
  const speakerMatch = line.trimmed.match(/^([A-Za-z0-9_. -]+):\s*(.*)$/u);
  const speakerDirective = speakerMatch?.[1]?.trim();
  const body = speakerMatch?.[2] ?? line.trimmed;
  const [speaker, appearance] = speakerDirective ? splitSpeaker(speakerDirective) : [undefined, undefined];
  const bodyStart = speakerMatch ? speakerMatch[0].length - body.length : 0;
  const bodySource = sliceSourcedText(lineSource, bodyStart, bodyStart + body.length);
  const parsedInline = parseInlineTextContent(
    sourceText,
    bodySource,
    { ...loc, column: loc.column + bodyStart },
    diagnostics,
    commandMetadata,
    { context: "ordinary", extractTextId: true }
  );

  const printParams: Record<string, NaniValue> = {};
  for (const token of parsedInline.tokens) {
    if (token.kind === "inline-command" && token.command.commandId === "<") {
      Object.assign(printParams, token.command.params);
    }
  }

  const statement: TextIR = { kind: "text", tokens: parsedInline.tokens, loc };
  if (speaker) statement.speaker = speaker;
  if (appearance) statement.appearance = appearance;
  if (parsedInline.textId) statement.textId = parsedInline.textId;
  if (shouldAttachRichText(parsedInline.visibleSource.text, parsedInline.richText.document)) {
    statement.richText = parsedInline.richText.document;
  }
  if (parsedInline.textStages) statement.textStages = parsedInline.textStages;
  if (Object.keys(printParams).length > 0) statement.printParams = printParams;

  const directive = speakerMatch?.[1];
  const directiveLeading = directive ? directive.length - directive.trimStart().length : 0;
  const directiveSource = directive
    ? sliceSourcedText(lineSource, directiveLeading, directiveLeading + speakerDirective!.length)
    : undefined;
  const dot = speakerDirective?.indexOf(".") ?? -1;
  const speakerSpan = directiveSource
    ? spanForSourcedRange(directiveSource, 0, dot >= 0 ? dot : directiveSource.text.length)
    : undefined;
  const appearanceSpan = directiveSource && dot >= 0
    ? spanForSourcedRange(directiveSource, dot + 1, directiveSource.text.length)
    : undefined;

  return {
    statement,
    sourceMap: {
      kind: "text",
      span: line.trimmedSpan,
      ...(speakerSpan ? { speakerSpan } : {}),
      ...(appearanceSpan ? { appearanceSpan } : {}),
      bodySpan: bodySource.span,
      inlineCommands: parsedInline.inlineCommands,
      textIds: parsedInline.textIdMarkers
    }
  };
}

function splitSpeaker(value: string): [string | undefined, string | undefined] {
  const dot = value.indexOf(".");
  if (dot < 0) return [value, undefined];
  return [value.slice(0, dot), value.slice(dot + 1)];
}

function parseInlineTextContent(
  sourceText: string,
  text: SourcedText,
  loc: SourceLocation,
  diagnostics: NaniDiagnosticSink,
  commandMetadata: WeakMap<CommandIR, NaniValue>,
  options: { readonly context: InlineTextContext; readonly extractTextId?: boolean }
): ParsedInlineTextContent {
  const parsed = parseInlineTokens(
    sourceText,
    text,
    loc,
    diagnostics,
    commandMetadata,
    options.context
  );
  const extracted = options.extractTextId
    ? extractTextIdFromTokens(parsed)
    : { diagnostics: [], markers: [], textSources: parsed.textSources } satisfies ExtractedTextId;
  for (const diagnostic of extracted.diagnostics) {
    reportNaniDiagnostic(diagnostics, loc, diagnostic.code, "error", diagnostic.message, {
      span: diagnostic.span
    });
  }

  const visibleSource = concatSourcedText(
    extracted.textSources.map((entry) => entry.source),
    text.span.start
  );
  const richText = parseSourcedRichText(visibleSource);
  for (const diagnostic of richText.diagnostics) {
    reportNaniDiagnostic(diagnostics, loc, "invalid-rich-text", "warning", diagnostic.message, {
      span: diagnostic.span
    });
  }

  const textStages = buildTextStages(
    parsed,
    extracted.textSources,
    richText,
    loc,
    diagnostics
  );
  return {
    ...parsed,
    textSources: [...extracted.textSources],
    visibleSource,
    richText,
    ...(textStages ? { textStages } : {}),
    ...(extracted.textId ? { textId: extracted.textId } : {}),
    textIdMarkers: extracted.markers
  };
}

function buildTextStages(
  parsed: ParsedInlineTokens,
  textSources: readonly { readonly tokenIndex: number; readonly source: SourcedText }[],
  fullRichText: ReturnType<typeof parseSourcedRichText>,
  loc: SourceLocation,
  diagnostics: NaniDiagnosticSink
): TextStageIR[] | undefined {
  if (!parsed.hasStageStop) return undefined;
  const sourceByToken = new Map(textSources.map((entry) => [entry.tokenIndex, entry.source]));
  const inlineByToken = new Map(parsed.inlineCommands.map((entry) => [entry.tokenIndex, entry.command]));
  const groups: SourcedText[][] = [[]];
  const boundaries: Array<{ command: CommandIR; source: NaniCommandSourceMap }> = [];
  let sawStageStop = false;

  for (const [tokenIndex, token] of parsed.tokens.entries()) {
    if (token.kind === "text") {
      const source = sourceByToken.get(tokenIndex);
      if (source) groups.at(-1)?.push(source);
      continue;
    }
    if (isInlineStageStop(token.command)) {
      const source = inlineByToken.get(tokenIndex);
      if (!source) continue;
      sawStageStop = true;
      boundaries.push({ command: token.command, source });
      groups.push([]);
      continue;
    }
    if (token.command.commandId === ">" && hasLaterStageStop(parsed.tokens, tokenIndex)) {
      const source = inlineByToken.get(tokenIndex);
      if (!source) continue;
      reportNaniDiagnostic(
        diagnostics,
        token.command.loc,
        "invalid-inline-stage-position",
        "error",
        "Inline auto-next [>] is allowed only in the final text stage.",
        { span: source.span }
      );
    }
  }
  if (!sawStageStop) return undefined;

  const stageSources = groups.map((group, index) => concatSourcedText(
    group,
    index === 0
      ? boundaries[0]?.source.span.start ?? 0
      : boundaries[index - 1]?.source.span.end ?? 0
  ));
  let valid = true;
  for (const [index, source] of stageSources.entries()) {
    const parsedStage = parseSourcedRichText(source);
    if (parsedStage.document.text.trim().length > 0) continue;
    valid = false;
    const boundary = index === 0 ? boundaries[0] : boundaries[index - 1];
    reportNaniDiagnostic(
      diagnostics,
      boundary?.command.loc ?? loc,
      "invalid-inline-stage-boundary",
      "error",
      "Inline text stages must contain visible non-whitespace text on both sides of every stop.",
      { span: boundary!.source.span }
    );
  }

  const parsedStages = stageSources.map((source) => parseSourcedRichText(source));
  if (fullRichText.diagnostics.length === 0) {
    for (const [index, result] of parsedStages.entries()) {
      if (result.diagnostics.length === 0) continue;
      valid = false;
      const boundary = index === 0 ? boundaries[0] : boundaries[index - 1];
      reportNaniDiagnostic(
        diagnostics,
        boundary?.command.loc ?? loc,
        "invalid-inline-stage-boundary",
        "error",
        "Inline text stops cannot appear inside an active rich-text tag or tag syntax.",
        { span: boundary!.source.span }
      );
      break;
    }
  }
  if (!valid) return undefined;

  return parsedStages.map((result, index) => ({
    text: result.document.text,
    ...(shouldAttachRichText(stageSources[index]?.text ?? "", result.document)
      ? { richText: result.document }
      : {}),
    loc: index === 0 ? loc : boundaries[index - 1]!.command.loc
  }));
}

function isInlineStageStop(command: CommandIR): boolean {
  if (command.commandId === "-") return command.args.length === 0;
  return command.commandId === "wait" &&
    command.args.length === 1 &&
    command.args[0]?.kind === "value" &&
    command.args[0].value.type === "string" &&
    command.args[0].value.value.toLowerCase() === "i";
}

function hasLaterStageStop(tokens: readonly TextToken[], tokenIndex: number): boolean {
  return tokens.slice(tokenIndex + 1).some(
    (token) => token.kind === "inline-command" && isInlineStageStop(token.command)
  );
}

function parseInlineTokens(
  sourceText: string,
  text: SourcedText,
  loc: SourceLocation,
  diagnostics: NaniDiagnosticSink,
  commandMetadata: WeakMap<CommandIR, NaniValue>,
  context: InlineTextContext
): ParsedInlineTokens {
  const tokens: TextToken[] = [];
  const textSources: Array<{ tokenIndex: number; source: SourcedText }> = [];
  const inlineCommands: NaniInlineCommandSourceMap[] = [];
  let hasStageStop = false;
  let buffer = emptySourcedText(text.span.start);
  let index = 0;
  let identityRunStart = 0;

  const flushBuffer = (): void => {
    if (buffer.text.length === 0) return;
    const tokenIndex = tokens.length;
    tokens.push({ kind: "text", text: buffer.text });
    textSources.push({ tokenIndex, source: buffer });
    buffer = emptySourcedText(buffer.span.end);
  };
  const flushIdentityRun = (end: number): void => {
    if (end <= identityRunStart) return;
    appendSourcedText(buffer, sliceSourcedText(text, identityRunStart, end));
    identityRunStart = end;
  };

  while (index < text.text.length) {
    const char = text.text[index];
    const next = text.text[index + 1];
    if (char === "\\" && (next === "[" || next === "]")) {
      flushIdentityRun(index);
      appendSourcedUnit(buffer, next, spanForSourcedRange(text, index, index + 2));
      index += 2;
      identityRunStart = index;
      continue;
    }

    if (char === "[") {
      const close = findClosingBracket(text.text, index + 1);
      if (close >= 0) {
        flushIdentityRun(index);
        flushBuffer();
        const tokenIndex = tokens.length;
        const commandSpan = spanForSourcedRange(text, index, close + 1);
        const markerSpan = spanForSourcedRange(text, index, index + 1);
        const content = trimSourcedText(sliceSourcedText(text, index + 1, close));
        const parsed = parseCommand(
          sourceText,
          content.span,
          commandSpan,
          markerSpan,
          { ...loc, column: loc.column + index },
          diagnostics,
          { fallbackCommandId: "noop" }
        );
        if (parsed.metadataFirstValue) commandMetadata.set(parsed.command, parsed.metadataFirstValue);
        collectInlineCommandDiagnostics(parsed, diagnostics, context);
        parsed.command.inlineIndex = tokenIndex;
        if (isInlineStageStop(parsed.command)) hasStageStop = true;
        tokens.push({ kind: "inline-command", command: parsed.command });
        inlineCommands.push({ tokenIndex, command: parsed.sourceMap });
        index = close + 1;
        identityRunStart = index;
        continue;
      }
    }

    index += 1;
  }

  flushIdentityRun(text.text.length);
  flushBuffer();
  return { tokens, textSources, inlineCommands, hasStageStop };
}

function extractTextIdFromTokens(parsed: ParsedInlineTokens): ExtractedTextId {
  const matches: Array<{ id: string; marker: NaniTextIdSourceMap }> = [];
  const textSources = parsed.textSources.map(({ tokenIndex, source }) => {
    const removals: Array<{ start: number; end: number }> = [];
    for (const match of source.text.matchAll(textIdPattern)) {
      if (match.index === undefined) continue;
      const markerStart = match.index;
      const markerEnd = markerStart + match[0].length;
      const id = match[1] ?? "";
      matches.push({
        id,
        marker: {
          span: spanForSourcedRange(source, markerStart, markerEnd),
          valueSpan: spanForSourcedRange(source, markerStart + 2, markerEnd - 1)
        }
      });
      removals.push({ start: markerStart, end: markerEnd });
    }
    const next = removeSourcedRanges(source, removals);
    const token = parsed.tokens[tokenIndex];
    if (token?.kind === "text") token.text = next.text;
    return { tokenIndex, source: next };
  });

  const markers = matches.map((match) => match.marker);
  if (matches.length === 0) return { diagnostics: [], markers, textSources };
  if (matches.length > 1) {
    const markerIndex = 1;
    const marker = matches[markerIndex]!.marker;
    return {
      diagnostics: [{
        code: "multiple-text-ids",
        message: "Text line may contain only one textId marker.",
        span: marker.span
      }],
      markers,
      textSources
    };
  }

  const match = matches[0]!;
  if (!match.id || !textIdValuePattern.test(match.id)) {
    const span = match.id ? match.marker.valueSpan : match.marker.span;
    return {
      diagnostics: [{
        code: "invalid-text-id",
        message: `Invalid textId marker: ${match.id || "(empty)"}`,
        span
      }],
      markers,
      textSources
    };
  }
  return { textId: match.id, diagnostics: [], markers, textSources };
}

function findClosingBracket(text: string, start: number): number {
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "]") return index;
  }
  return -1;
}

function parseCommand(
  sourceText: string,
  contentSpan: TextSpan,
  commandSpan: TextSpan,
  markerSpan: TextSpan,
  loc: SourceLocation,
  diagnostics: NaniDiagnosticSink,
  options: { readonly fallbackCommandId?: string }
): ParsedCommand {
  const scan = scanCommandParts(sourceText, contentSpan);
  for (const diagnostic of scan.diagnostics) {
    reportNaniDiagnostic(diagnostics, loc, diagnostic.code, diagnostic.severity, diagnostic.message, {
      span: diagnostic.span
    });
  }

  const parts = [...scan.parts];
  const namePart = parts.shift();
  const commandId = (namePart?.value.text || options.fallbackCommandId || "noop").toLowerCase();
  const args: CommandArgIR[] = [];
  const argumentSources: NaniCommandArgumentSourceMap[] = [];
  const argumentValues: SourcedText[] = [];
  const params: Record<string, NaniValue> = {};
  const flags: Record<string, boolean> = {};
  let primary: NaniValue | undefined;
  let metadataFirstValue: NaniValue | undefined;
  let condition: CommandIR["condition"];
  let unless: CommandIR["unless"];

  for (const part of parts) {
    const raw = part.value.text;
    if (part.structuralFlag) {
      const { markerOffset, value } = part.structuralFlag;
      const keyStart = value ? 0 : markerOffset + 1;
      const keyEnd = value ? markerOffset : raw.length;
      const key = raw.slice(keyStart, keyEnd);
      args.push({ kind: "flag", raw, key, value });
      flags[key] = value;
      argumentSources.push({
        span: part.span,
        keySpan: spanForSourcedRange(part.value, keyStart, keyEnd),
        flagMarkerSpan: spanForSourcedRange(part.value, markerOffset, markerOffset + 1),
        itemSpans: []
      });
      argumentValues.push(part.value);
      continue;
    }

    const colon = part.structuralColonOffset;
    if (colon !== undefined && colon > 0) {
      const key = raw.slice(0, colon);
      const value = raw.slice(colon + 1);
      const valueSource = sliceSourcedText(part.value, colon + 1);
      const valueStart = colon + 1;
      const parsedValue = parseScannedValue(part, valueStart, raw.length);
      const commaOffsets = structuralCommaOffsetsInRange(part, valueStart, raw.length);
      args.push({ kind: "param", raw, key, value: parsedValue });
      argumentSources.push({
        span: part.span,
        keySpan: spanForSourcedRange(part.value, 0, colon),
        colonSpan: spanForSourcedRange(part.value, colon, colon + 1),
        valueSpan: valueSource.span,
        itemSpans: listItemSpans(valueSource, parsedValue, commaOffsets)
      });
      argumentValues.push(valueSource);
      if (!metadataFirstValue && !isConditionArgKey(key)) {
        metadataFirstValue = parseScannedValue(part, 0, raw.length);
      }
      const conditionSource = parsedValue.type === "expression" ? parsedValue.source : value;
      if (key === "if") condition = { source: conditionSource };
      else if (key === "unless") unless = { source: conditionSource };
      else params[key] = parsedValue;
      continue;
    }

    const parsedValue = parseScannedValue(part, 0, raw.length);
    const commaOffsets = structuralCommaOffsetsInRange(part, 0, raw.length);
    args.push({ kind: "value", raw, value: parsedValue });
    argumentSources.push({
      span: part.span,
      valueSpan: part.value.span,
      itemSpans: listItemSpans(part.value, parsedValue, commaOffsets)
    });
    argumentValues.push(part.value);
    primary ??= parsedValue;
    metadataFirstValue ??= parsedValue;
  }

  const command: CommandIR = { kind: "command", commandId, args, params, flags, loc };
  if (primary) command.primary = primary;
  if (condition) command.condition = condition;
  if (unless) command.unless = unless;
  return {
    command,
    sourceMap: {
      span: commandSpan,
      markerSpan,
      nameSpan: namePart
        ? spanForSourcedRange(namePart.value, 0, namePart.value.text.length)
        : markerSpan,
      arguments: argumentSources
    },
    argumentValues,
    ...(metadataFirstValue ? { metadataFirstValue } : {})
  };
}

function collectInlineCommandDiagnostics(
  parsed: ParsedCommand,
  diagnostics: NaniDiagnosticSink,
  context: InlineTextContext
): void {
  const command = parsed.command;
  if (command.commandId === "-" || command.commandId === "wait") {
    if (command.commandId === "-" && command.args.length === 0) return;
    if (isInlineStageStop(command)) return;
    const span = parsed.sourceMap.arguments[0]?.span ?? parsed.sourceMap.nameSpan;
    reportNaniDiagnostic(
      diagnostics,
      command.loc,
      command.commandId === "wait" ? "invalid-inline-stage-wait" : "invalid-inline-command-argument",
      "error",
      command.commandId === "wait"
        ? "Inline [wait ...] supports only the input wait mode [wait i]; timed waits are not supported."
        : "Inline stage stop [-] does not accept parameters.",
      { span }
    );
    return;
  }

  if (command.commandId !== ">" && command.commandId !== "<") {
    reportNaniDiagnostic(
      diagnostics,
      command.loc,
      "unsupported-inline-command",
      "error",
      `Unsupported inline .nani command: [${command.commandId}]. Inline commands support [-], [wait i], [>], and [< speed:<decimal>].`,
      {
        span: parsed.sourceMap.nameSpan
      }
    );
    return;
  }

  if (context === "story-command") {
    reportNaniDiagnostic(
      diagnostics,
      command.loc,
      "invalid-inline-stage-command",
      "error",
      `@print/@cue text accepts only [-] and [wait i] inline; use outer command parameters instead of [${command.commandId}].`,
      { span: parsed.sourceMap.span }
    );
    return;
  }

  if (command.commandId === ">") {
    if (command.args.length > 0) {
      const span = parsed.sourceMap.arguments[0]?.span ?? parsed.sourceMap.nameSpan;
      reportNaniDiagnostic(
        diagnostics,
        command.loc,
        "invalid-inline-command-argument",
        "error",
        "Inline auto-next command [>] does not accept parameters.",
        {
          span
        }
      );
    }
    return;
  }

  for (const [argumentIndex, arg] of command.args.entries()) {
    const source = parsed.sourceMap.arguments[argumentIndex];
    if (arg.kind !== "param" || arg.key !== "speed") {
      const span = source?.span ?? parsed.sourceMap.nameSpan;
      reportNaniDiagnostic(
        diagnostics,
        command.loc,
        "invalid-inline-command-argument",
        "error",
        `Unsupported inline print parameter: ${arg.raw}. Inline [< ...] currently supports speed:<decimal>.`,
        {
          span
        }
      );
      continue;
    }

    if (arg.value.type !== "number" && arg.value.type !== "expression") {
      const span = firstNonEmptyDiagnosticSpan(
        source?.valueSpan,
        source?.span,
        parsed.sourceMap.nameSpan
      );
      reportNaniDiagnostic(
        diagnostics,
        command.loc,
        "invalid-inline-command-value",
        "error",
        "Inline print parameter speed expected decimal.",
        {
          span
        }
      );
    }
  }
}

function attachCommandInlineText(
  sourceText: string,
  parsed: ParsedCommand,
  diagnostics: NaniDiagnosticSink,
  commandMetadata: WeakMap<CommandIR, NaniValue>
): ParsedInlineTextContent | undefined {
  const command = parsed.command;
  if (command.commandId !== "print" && command.commandId !== "cue") {
    attachCommandRichText(parsed, diagnostics);
    return undefined;
  }

  const effective = effectiveStoryCommandText(parsed);
  const rawCommand = sourceText.slice(parsed.sourceMap.span.start, parsed.sourceMap.span.end);
  const rawWait = /\[wait\s+i\]/iu.exec(rawCommand);
  const rawStageMarker = /\[-\]|\[wait\s+i\]/iu.exec(rawCommand);
  if (!effective || effective.value.type !== "string") {
    if (rawStageMarker) {
      const start = parsed.sourceMap.span.start + rawStageMarker.index;
      reportNaniDiagnostic(
        diagnostics,
        command.loc,
        "invalid-inline-stage-command",
        "error",
        "Dynamic @print/@cue text cannot be statically divided into inline stages.",
        { span: { start, end: start + rawStageMarker[0].length } }
      );
    }
    attachCommandRichText(parsed, diagnostics);
    return undefined;
  }

  if (rawWait && !/\[wait\s+i\]/iu.test(effective.source.text)) {
    const start = parsed.sourceMap.span.start + rawWait.index;
    reportNaniDiagnostic(
      diagnostics,
      command.loc,
      "invalid-inline-stage-command",
      "error",
      "Explicit @print/@cue [wait i] text must be enclosed in quotes.",
      { span: { start, end: start + rawWait[0].length } }
    );
    attachCommandRichText(parsed, diagnostics);
    return undefined;
  }

  const inlineText = parseInlineTextContent(
    sourceText,
    effective.source,
    command.loc,
    diagnostics,
    commandMetadata,
    { context: "story-command" }
  );
  const nextValue: NaniValue = { type: "string", value: inlineText.visibleSource.text };
  const arg = command.args[effective.argumentIndex];
  if (arg?.kind === "value") {
    arg.value = nextValue;
    command.primary = nextValue;
    if (shouldAttachRichText(inlineText.visibleSource.text, inlineText.richText.document)) {
      command.richTextPrimary = inlineText.richText.document;
    }
  } else if (arg?.kind === "param") {
    arg.value = nextValue;
    command.params[arg.key] = nextValue;
    if (shouldAttachRichText(inlineText.visibleSource.text, inlineText.richText.document)) {
      command.richTextParams = {
        ...(command.richTextParams ?? {}),
        [arg.key]: inlineText.richText.document
      };
    }
  }

  if (inlineText.textStages) {
    command.textStages = inlineText.textStages;
    for (const key of ["if", "unless"] as const) {
      if (!(key === "if" ? command.condition : command.unless)) continue;
      const argumentIndex = command.args.findIndex(
        (candidate) => candidate.kind === "param" && candidate.key.toLowerCase() === key
      );
      const source = parsed.sourceMap.arguments[argumentIndex];
      reportNaniDiagnostic(
        diagnostics,
        command.loc,
        "invalid-inline-stage-command",
        "error",
        `Staged @${command.commandId} text cannot be combined with ${key}: conditions.`,
        { span: source?.span ?? parsed.sourceMap.span }
      );
    }
  }
  return inlineText;
}

function effectiveStoryCommandText(parsed: ParsedCommand): {
  readonly argumentIndex: number;
  readonly source: SourcedText;
  readonly value: NaniValue;
} | undefined {
  const primaryIndex = parsed.command.args.findIndex((arg) => arg.kind === "value");
  if (primaryIndex >= 0) {
    const arg = parsed.command.args[primaryIndex];
    const source = parsed.argumentValues[primaryIndex];
    if (arg?.kind === "value" && source) return { argumentIndex: primaryIndex, source, value: arg.value };
  }
  for (let index = parsed.command.args.length - 1; index >= 0; index -= 1) {
    const arg = parsed.command.args[index];
    const source = parsed.argumentValues[index];
    if (arg?.kind === "param" && arg.key.toLowerCase() === "text" && source) {
      return { argumentIndex: index, source, value: arg.value };
    }
  }
  return undefined;
}

function attachCommandRichText(parsed: ParsedCommand, diagnostics: NaniDiagnosticSink): void {
  const command = parsed.command;
  if (!richTextCommandIds.has(command.commandId)) return;
  const primary = command.primary;
  const primaryIndex = command.args.findIndex((arg) => arg.kind === "value");
  const primarySource = primaryIndex >= 0 ? parsed.argumentValues[primaryIndex] : undefined;
  const primaryResult = primary?.type === "string" && primarySource
    ? parseSourcedRichText(primarySource)
    : undefined;
  if (primaryResult) {
    for (const diagnostic of primaryResult.diagnostics) {
      reportNaniDiagnostic(
        diagnostics,
        command.loc,
        "invalid-rich-text",
        "warning",
        diagnostic.message,
        { span: diagnostic.span }
      );
    }
    if (primary?.type === "string" && shouldAttachRichText(primary.value, primaryResult.document)) {
      command.richTextPrimary = primaryResult.document;
    }
  }

  const richTextParams: Record<string, ReturnType<typeof parseSourcedRichText>["document"]> = {};
  for (const [key, value] of Object.entries(command.params)) {
    if (value.type !== "string" || !isRichTextCommandParam(command.commandId, key)) continue;
    let argumentIndex = -1;
    for (let index = command.args.length - 1; index >= 0; index -= 1) {
      const arg = command.args[index];
      if (arg?.kind === "param" && arg.key === key) {
        argumentIndex = index;
        break;
      }
    }
    const valueSource = argumentIndex >= 0 ? parsed.argumentValues[argumentIndex] : undefined;
    if (!valueSource) continue;
    const result = parseSourcedRichText(valueSource);
    for (const diagnostic of result.diagnostics) {
      reportNaniDiagnostic(
        diagnostics,
        command.loc,
        "invalid-rich-text",
        "warning",
        diagnostic.message,
        { span: diagnostic.span }
      );
    }
    if (shouldAttachRichText(value.value, result.document)) richTextParams[key] = result.document;
  }
  if (Object.keys(richTextParams).length > 0) command.richTextParams = richTextParams;
}

function isRichTextCommandParam(commandId: string, key: string): boolean {
  if (commandId === "print" || commandId === "append" || commandId === "toast") return key === "text";
  if (commandId === "choice") return key === "choiceSummary" || key === "text";
  return false;
}

function parseScannedValue(part: ScannedCommandPart, start: number, end: number): NaniValue {
  const raw = part.value.text.slice(start, end);
  if (/^\{.*\}$/u.test(raw)) return { type: "expression", source: raw.slice(1, -1) };
  if (/^-?\d+(\.\d+)?$/u.test(raw)) return { type: "number", value: Number(raw) };
  if (raw === "true" || raw === "false") return { type: "boolean", value: raw === "true" };

  const commaOffsets = structuralCommaOffsetsInRange(part, start, end);
  if (commaOffsets.length > 0) {
    const values: NaniValue[] = [];
    let itemStart = start;
    for (const relativeCommaOffset of commaOffsets) {
      const commaOffset = start + relativeCommaOffset;
      values.push(parseScannedValue(part, itemStart, commaOffset));
      itemStart = commaOffset + 1;
    }
    values.push(parseScannedValue(part, itemStart, end));
    return { type: "list", value: values };
  }
  if (raw.startsWith("#")) return { type: "raw", value: raw };
  return { type: "string", value: raw };
}

function structuralCommaOffsetsInRange(
  part: ScannedCommandPart,
  start: number,
  end: number
): number[] {
  return part.structuralCommaOffsets
    .filter((offset) => offset >= start && offset < end)
    .map((offset) => offset - start);
}

function listItemSpans(
  source: SourcedText,
  value: NaniValue,
  commaOffsets: readonly number[]
): TextSpan[] {
  if (value.type !== "list") return [];
  const spans: TextSpan[] = [];
  let start = 0;
  for (const end of [...commaOffsets, source.text.length]) {
    const item = sliceSourcedText(source, start, end);
    const trimmed = trimSourcedText(item);
    spans.push(trimmed.text.length > 0 ? trimmed.span : item.span);
    start = end + 1;
  }
  return spans;
}

function collectCommandMetadata(
  parsed: ParsedCommand,
  assets: ScenarioIR["assets"],
  dependencies: ScenarioIR["dependencies"]
): void {
  const command = parsed.command;
  const assetKind = commandAssetKinds[command.commandId];
  const firstArgValue = parsed.metadataFirstValue ?? firstCommandValue(command);
  if (assetKind && firstArgValue?.type === "string") {
    assets.push({ id: firstArgValue.value, kind: assetKind });
  }

  if (command.commandId === "char" || command.commandId === "slide") {
    const characterId = characterPackIdForActorAppearanceCommand(command);
    if (characterId) assets.push({ id: characterId, kind: "character-pack" });
  }

  const endpointValues = [
    ...(command.commandId === "goto" ? [firstArgValue] : []),
    ...(command.commandId === "choice" ? [command.params.goto] : [])
  ];
  for (const value of endpointValues) {
    const endpoint = staticNaniEndpointText(value);
    if (endpoint && !endpoint.startsWith("#")) dependencies.push({ endpoint });
  }
}

function characterPackIdForActorAppearanceCommand(command: CommandIR): string | undefined {
  const raw = command.args.find((arg) => arg.kind === "value")?.raw;
  if (command.commandId === "slide" && (!raw || !raw.includes("."))) return undefined;
  const idParam = command.params.id;
  const idFromParam = idParam ? stringValue(idParam) : undefined;
  const idFromPrimary = raw?.split(/[.,]/u)[0];
  const id = idFromParam ?? idFromPrimary;
  if (!id || id === "*") return undefined;
  return id;
}

function stringValue(value: NaniValue): string | undefined {
  if (value.type === "string" || value.type === "raw") return value.value;
  return undefined;
}

function collectDuplicateTextIdDiagnostics(
  statements: readonly StatementIR[],
  statementSources: readonly NaniStatementSourceMap[],
  diagnostics: NaniDiagnosticSink
): void {
  const seen = new Map<string, SourceLocation>();
  for (const [statementIndex, statement] of statements.entries()) {
    if (statement.kind !== "text" || !statement.textId) continue;
    if (seen.has(statement.textId)) {
      const marker = statementSources[statementIndex]?.textIds[0];
      const span = marker?.valueSpan ?? statementSources[statementIndex]?.span ?? {
        start: 0,
        end: 0
      };
      reportNaniDiagnostic(
        diagnostics,
        statement.loc,
        "duplicate-text-id",
        "error",
        `Duplicate textId: ${statement.textId}`,
        {
          span
        }
      );
      continue;
    }
    seen.set(statement.textId, statement.loc);
  }
}

function collectLocalLabelReferenceDiagnostics(
  statements: readonly StatementIR[],
  statementSources: readonly NaniStatementSourceMap[],
  labels: Readonly<Record<string, number>>,
  diagnostics: NaniDiagnosticSink,
  commandMetadata: WeakMap<CommandIR, NaniValue>
): void {
  for (const [statementIndex, statement] of statements.entries()) {
    const statementSource = statementSources[statementIndex];
    if (!statementSource) continue;
    if (statement.kind === "command" && statementSource.command) {
      collectCommandLocalLabelReferenceDiagnostics(
        statement,
        statementSource.command,
        labels,
        diagnostics,
        commandMetadata
      );
      continue;
    }
    if (statement.kind !== "text") continue;
    for (const token of statement.tokens) {
      if (token.kind !== "inline-command") continue;
      const source = statementSource.inlineCommands.find((candidate) => candidate.tokenIndex === token.command.inlineIndex);
      if (source) {
        collectCommandLocalLabelReferenceDiagnostics(
          token.command,
          source.command,
          labels,
          diagnostics,
          commandMetadata
        );
      }
    }
  }
}

function collectCommandLocalLabelReferenceDiagnostics(
  command: CommandIR,
  sourceMap: NaniCommandSourceMap,
  labels: Readonly<Record<string, number>>,
  diagnostics: NaniDiagnosticSink,
  commandMetadata: WeakMap<CommandIR, NaniValue>
): void {
  for (const target of localLabelTargetsForCommand(command, sourceMap, commandMetadata)) {
    if (labels[target.target.slice(1)] !== undefined) continue;
    reportNaniDiagnostic(
      diagnostics,
      command.loc,
      "missing-local-label",
      "error",
      `Missing local label reference: ${target.target}`,
      { span: target.span }
    );
  }
}

function localLabelTargetsForCommand(
  command: CommandIR,
  sourceMap: NaniCommandSourceMap,
  commandMetadata: WeakMap<CommandIR, NaniValue>
): LocalLabelTarget[] {
  const targets: LocalLabelTarget[] = [];
  const firstIndex = command.args.findIndex(
    (arg) => arg.kind === "value" || (arg.kind === "param" && !isConditionArgKey(arg.key))
  );
  const firstArgValue = commandMetadata.get(command) ?? firstCommandValue(command);
  if (firstArgValue?.type === "raw" && firstArgValue.value.startsWith("#")) {
    const source = sourceMap.arguments[firstIndex];
    const arg = command.args[firstIndex];
    const span = arg?.kind === "param"
      ? source?.span ?? sourceMap.nameSpan
      : source?.valueSpan ?? source?.span ?? sourceMap.nameSpan;
    targets.push({ target: firstArgValue.value, span });
  }

  const goto = command.params.goto;
  if (goto) {
    let gotoIndex = -1;
    for (let index = command.args.length - 1; index >= 0; index -= 1) {
      const arg = command.args[index];
      if (arg?.kind === "param" && arg.key === "goto") {
        gotoIndex = index;
        break;
      }
    }
    const source = sourceMap.arguments[gotoIndex];
    collectLocalLabelTargetsFromValue(goto, source, targets);
  }
  return targets;
}

function firstCommandValue(command: CommandIR): NaniValue | undefined {
  return command.args.find((arg) => arg.kind === "value")?.value ?? command.primary;
}

function isConditionArgKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized === "if" || normalized === "unless";
}

function collectLocalLabelTargetsFromValue(
  value: NaniValue,
  source: NaniCommandArgumentSourceMap | undefined,
  targets: LocalLabelTarget[]
): void {
  if (value.type === "raw" && value.value.startsWith("#")) {
    targets.push({ target: value.value, span: source?.valueSpan ?? source?.span ?? { start: 0, end: 0 } });
    return;
  }
  if (value.type !== "list") return;
  for (const [itemIndex, item] of value.value.entries()) {
    if (item.type === "raw" && item.value.startsWith("#")) {
      targets.push({
        target: item.value,
        span: source?.itemSpans[itemIndex] ?? source?.valueSpan ?? source?.span ?? { start: 0, end: 0 }
      });
    }
  }
}

function emptyStatementSource(
  kind: NaniStatementSourceMap["kind"],
  span: TextSpan,
  markerSpan?: TextSpan
): NaniStatementSourceMap {
  return {
    kind,
    span,
    ...(markerSpan ? { markerSpan } : {}),
    inlineCommands: [],
    textIds: []
  };
}

function trimmedSubspan(source: string, span: TextSpan): TextSpan {
  let start = span.start;
  let end = span.end;
  while (start < end && /\s/u.test(source[start] ?? "")) start += 1;
  while (end > start && /\s/u.test(source[end - 1] ?? "")) end -= 1;
  return { start, end };
}

function trimSourcedText(source: SourcedText): SourcedText {
  let start = 0;
  let end = source.text.length;
  while (start < end && /\s/u.test(source.text[start] ?? "")) start += 1;
  while (end > start && /\s/u.test(source.text[end - 1] ?? "")) end -= 1;
  return sliceSourcedText(source, start, end);
}

function dedupeAssets(assets: ScenarioIR["assets"]): ScenarioIR["assets"] {
  return [...new Map(assets.map((asset) => [`${asset.kind}:${asset.id}`, asset])).values()];
}

function dedupeDependencies(dependencies: ScenarioIR["dependencies"]): ScenarioIR["dependencies"] {
  return [...new Map(dependencies.map((dependency) => [dependency.endpoint, dependency])).values()];
}
