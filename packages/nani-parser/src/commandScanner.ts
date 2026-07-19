import {
  appendIdentitySourcedText,
  appendSourcedUnit,
  emptySourcedText,
  type SourcedText
} from "./sourcedText.ts";
import type { NaniParserDiagnosticCode, TextSpan } from "./types";

export interface ScannedCommandPart {
  value: SourcedText;
  span: TextSpan;
  structuralColonOffset?: number;
  structuralCommaOffsets: readonly number[];
  structuralFlag?: {
    markerOffset: number;
    value: boolean;
  };
}

export interface CommandScanDiagnostic {
  code: NaniParserDiagnosticCode;
  severity: "warning" | "error";
  message: string;
  span: TextSpan;
}

export interface ScanCommandPartsResult {
  parts: ScannedCommandPart[];
  diagnostics: CommandScanDiagnostic[];
}

export function scanCommandParts(sourceText: string, sourceSpan: TextSpan): ScanCommandPartsResult {
  const source = sourceText.slice(sourceSpan.start, sourceSpan.end);
  const leftSpacingDiagnostics: CommandScanDiagnostic[] = [];
  const rightSpacingDiagnostics: CommandScanDiagnostic[] = [];
  const syntaxDiagnostics: CommandScanDiagnostic[] = [];
  const parts: ScannedCommandPart[] = [];
  let current = emptySourcedText(sourceSpan.start);
  let rawStart: number | undefined;
  let rawEnd = sourceSpan.start;
  let quote: string | undefined;
  let quoteStart: number | undefined;
  let braceDepth = 0;
  const braceStarts: number[] = [];
  let identityRunStart: number | undefined;
  let cookedLength = 0;
  let structuralColonOffset: number | undefined;
  let structuralCommaOffsets: number[] = [];
  let structuralBangOffsets: number[] = [];

  const touch = (start: number, end: number): void => {
    rawStart ??= start;
    rawEnd = end;
  };
  const flush = (): void => {
    if (current.text.length > 0 && rawStart !== undefined) {
      const hasPrefixBang = structuralBangOffsets.includes(0);
      const hasSuffixBang = structuralBangOffsets.includes(cookedLength - 1);
      const structuralFlag = hasSuffixBang && !hasPrefixBang
        ? { markerOffset: cookedLength - 1, value: true }
        : hasPrefixBang && cookedLength > 1
          ? { markerOffset: 0, value: false }
          : undefined;
      parts.push({
        value: current,
        span: { start: rawStart, end: rawEnd },
        ...(structuralColonOffset === undefined ? {} : { structuralColonOffset }),
        structuralCommaOffsets,
        ...(structuralFlag ? { structuralFlag } : {})
      });
    }
    current = emptySourcedText(rawEnd);
    rawStart = undefined;
    cookedLength = 0;
    structuralColonOffset = undefined;
    structuralCommaOffsets = [];
    structuralBangOffsets = [];
  };
  const extendIdentityRun = (index: number): void => {
    identityRunStart ??= index;
  };
  const flushIdentityRun = (end: number): void => {
    if (identityRunStart === undefined || end <= identityRunStart) return;
    appendIdentitySourcedText(
      current,
      source.slice(identityRunStart, end),
      { start: sourceSpan.start + identityRunStart, end: sourceSpan.start + end }
    );
    identityRunStart = undefined;
  };

  for (let localIndex = 0; localIndex < source.length; localIndex += 1) {
    const absoluteIndex = sourceSpan.start + localIndex;
    const char = source[localIndex] ?? "";

    if (quote) {
      touch(absoluteIndex, absoluteIndex + 1);
      if (char === "\\" && localIndex + 1 < source.length) {
        flushIdentityRun(localIndex);
        const escaped = source[localIndex + 1] ?? "";
        if (braceDepth === 0 && escaped === ",") structuralCommaOffsets.push(cookedLength);
        if (escaped === "!") structuralBangOffsets.push(cookedLength);
        appendSourcedUnit(current, escaped, { start: absoluteIndex, end: absoluteIndex + 2 });
        cookedLength += escaped.length;
        touch(absoluteIndex, absoluteIndex + 2);
        localIndex += 1;
        continue;
      }
      if (char === quote) {
        flushIdentityRun(localIndex);
        quote = undefined;
        quoteStart = undefined;
      } else {
        if (braceDepth === 0 && char === ",") structuralCommaOffsets.push(cookedLength);
        if (char === "!") structuralBangOffsets.push(cookedLength);
        extendIdentityRun(localIndex);
        cookedLength += 1;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      flushIdentityRun(localIndex);
      touch(absoluteIndex, absoluteIndex + 1);
      quote = char;
      quoteStart = absoluteIndex;
      continue;
    }

    if (braceDepth === 0 && char === ":") {
      structuralColonOffset ??= cookedLength;
      collectSpacingAtColon(
        source,
        localIndex,
        sourceSpan.start,
        leftSpacingDiagnostics,
        rightSpacingDiagnostics
      );
    }
    if (braceDepth === 0 && char === ",") structuralCommaOffsets.push(cookedLength);
    if (braceDepth === 0 && char === "!") structuralBangOffsets.push(cookedLength);

    if (char === "{") {
      braceDepth += 1;
      braceStarts.push(absoluteIndex);
    }
    if (char === "}") {
      braceDepth -= 1;
      if (braceStarts.length > 0) braceStarts.pop();
    }

    if (/\s/u.test(char) && braceDepth === 0) {
      flushIdentityRun(localIndex);
      flush();
      rawEnd = absoluteIndex + 1;
      continue;
    }

    touch(absoluteIndex, absoluteIndex + 1);
    extendIdentityRun(localIndex);
    cookedLength += 1;
  }

  flushIdentityRun(source.length);
  flush();
  if (quote) {
    syntaxDiagnostics.push({
      code: "unclosed-command-quote",
      severity: "error",
      message: "Unclosed quoted command argument.",
      span: { start: quoteStart ?? sourceSpan.end, end: sourceSpan.end }
    });
  }
  if (braceDepth > 0) {
    syntaxDiagnostics.push({
      code: "unclosed-command-expression",
      severity: "error",
      message: "Unclosed command expression brace.",
      span: { start: braceStarts[0] ?? sourceSpan.end, end: sourceSpan.end }
    });
  }

  return {
    parts,
    diagnostics: [...leftSpacingDiagnostics, ...rightSpacingDiagnostics, ...syntaxDiagnostics]
  };
}

function collectSpacingAtColon(
  source: string,
  colonIndex: number,
  sourceStart: number,
  left: CommandScanDiagnostic[],
  right: CommandScanDiagnostic[]
): void {
  let whitespaceStart = colonIndex;
  while (whitespaceStart > 0 && /\s/u.test(source[whitespaceStart - 1] ?? "")) whitespaceStart -= 1;
  if (whitespaceStart < colonIndex) {
    let keyStart = whitespaceStart;
    while (keyStart > 0 && /[A-Za-z0-9_-]/u.test(source[keyStart - 1] ?? "")) keyStart -= 1;
    const key = source.slice(keyStart, whitespaceStart);
    const boundary = keyStart === 0 || /\s/u.test(source[keyStart - 1] ?? "");
    if (boundary && /^[A-Za-z_][A-Za-z0-9_-]*$/u.test(key)) {
      left.push({
        code: "invalid-command-param-spacing",
        severity: "warning",
        message: `Parameter ${key} has whitespace before ":"; use ${key}:<value> so it is parsed as a parameter.`,
        span: { start: sourceStart + whitespaceStart, end: sourceStart + colonIndex }
      });
    }
  }

  let valueStart = colonIndex + 1;
  while (valueStart < source.length && /\s/u.test(source[valueStart] ?? "")) valueStart += 1;
  if (valueStart <= colonIndex + 1 || valueStart >= source.length || /\s/u.test(source[valueStart] ?? "")) return;
  let keyStart = colonIndex;
  while (keyStart > 0 && /[A-Za-z0-9_-]/u.test(source[keyStart - 1] ?? "")) keyStart -= 1;
  const key = source.slice(keyStart, colonIndex);
  const boundary = keyStart === 0 || /\s/u.test(source[keyStart - 1] ?? "");
  if (!boundary || !/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(key)) return;
  right.push({
    code: "invalid-command-param-spacing",
    severity: "warning",
    message: `Parameter ${key} has whitespace after ":"; use ${key}:<value> so it is parsed as a parameter.`,
    span: { start: sourceStart + colonIndex + 1, end: sourceStart + valueStart }
  });
}
