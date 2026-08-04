import { spanForSourcedRange, type SourcedText } from "./sourcedText.ts";
import type { RichTextDocumentIR, RichTextRunIR, RichTextRunStyleIR, TextSpan } from "./types";

const fontFaceIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
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

export interface RichTextDiagnostic {
  readonly message: string;
  readonly span: TextSpan;
}

export interface RichTextParseResult {
  readonly document: RichTextDocumentIR;
  readonly diagnostics: readonly RichTextDiagnostic[];
}

interface ActiveRichTextTag {
  readonly name: string;
  readonly start: number;
  readonly style: RichTextRunStyleIR;
  readonly sourceStart: number;
}

interface RelativeRichTextDiagnostic {
  readonly message: string;
  readonly start: number;
  readonly end: number;
}

interface ParsedOpenTag {
  readonly name?: string;
  readonly style?: RichTextRunStyleIR;
  readonly diagnostic?: RelativeRichTextDiagnostic;
}

interface ParsedAttribute {
  readonly key: string;
  readonly value: string;
  readonly keyStart: number;
  readonly keyEnd: number;
  readonly valueStart: number;
  readonly valueEnd: number;
  readonly valueTokenStart: number;
  readonly valueTokenEnd: number;
}

interface ParsedAttributes {
  readonly attrs: ReadonlyMap<string, ParsedAttribute>;
  readonly diagnostic?: RelativeRichTextDiagnostic;
}

export function parseSourcedRichText(source: SourcedText): RichTextParseResult {
  const text = source.text;
  const output: string[] = [];
  const runs: RichTextRunIR[] = [];
  const stack: ActiveRichTextTag[] = [];

  const fallback = (diagnostic: RelativeRichTextDiagnostic): RichTextParseResult => ({
    document: { text: decodeRichTextEntities(text), runs: [] },
    diagnostics: [{
      message: diagnostic.message,
      span: spanForSourcedRange(source, diagnostic.start, diagnostic.end)
    }]
  });

  let index = 0;
  while (index < text.length) {
    const char = text[index] ?? "";
    if (char === "&") {
      const entity = readRichTextEntity(text, index);
      if (entity) {
        output.push(entity.value);
        index = entity.end;
        continue;
      }
    }

    if (char !== "<") {
      const unit = Array.from(text.slice(index, index + 2))[0] ?? char;
      output.push(unit);
      index += unit.length;
      continue;
    }

    const close = text.indexOf(">", index + 1);
    if (close < 0) {
      return fallback({ message: "Unclosed rich text tag.", start: index, end: text.length });
    }

    const contentRange = trimRange(text, index + 1, close);
    if (contentRange.start === contentRange.end) {
      return fallback({ message: "Empty rich text tag is unsupported.", start: index, end: close + 1 });
    }

    let tagEnd = contentRange.end;
    const selfClosing = text[tagEnd - 1] === "/";
    if (selfClosing) tagEnd = trimRange(text, contentRange.start, tagEnd - 1).end;
    const tagStart = contentRange.start;
    const tagSource = text.slice(tagStart, tagEnd);
    const lowerTagSource = tagSource.toLowerCase();
    if (lowerTagSource === "br") {
      output.push("\n");
      index = close + 1;
      continue;
    }

    if (tagSource.startsWith("/")) {
      const nameRange = trimRange(text, tagStart + 1, tagEnd);
      const closeName = text.slice(nameRange.start, nameRange.end).toLowerCase();
      const expected = canonicalRichTextTagName(closeName);
      const active = stack.pop();
      if (!expected || !active || active.name !== expected) {
        const diagnosticRange = nonEmptyRelativeRange(nameRange, {
          start: index,
          end: close + 1
        });
        return fallback({
          message: `Mismatched rich text closing tag: ${tagSource}.`,
          start: diagnosticRange.start,
          end: diagnosticRange.end
        });
      }
      const outputEnd = output.length;
      if (outputEnd > active.start) runs.push({ start: active.start, end: outputEnd, style: active.style });
      index = close + 1;
      continue;
    }

    if (tagEnd <= tagStart) {
      return fallback({
        message: `Unsupported rich text tag: ${tagSource}.`,
        start: index,
        end: close + 1
      });
    }

    const parsedTag = parseRichTextOpenTag(text, tagStart, tagEnd);
    if (parsedTag.diagnostic) return fallback(parsedTag.diagnostic);
    if (!parsedTag.name || !parsedTag.style) {
      const nameRange = readNameRange(text, tagStart, tagEnd);
      return fallback({
        message: `Unsupported rich text tag: ${tagSource}.`,
        start: nameRange.start,
        end: nameRange.end
      });
    }
    if (selfClosing) {
      const nameRange = readNameRange(text, tagStart, tagEnd);
      return fallback({
        message: `Self-closing rich text tag is unsupported: ${tagSource}.`,
        start: nameRange.start,
        end: nameRange.end
      });
    }

    stack.push({
      name: parsedTag.name,
      start: output.length,
      style: parsedTag.style,
      sourceStart: index
    });
    index = close + 1;
  }

  const active = stack.at(-1);
  if (active) {
    return fallback({
      message: `Unclosed rich text tag: ${active.name}.`,
      start: active.sourceStart,
      end: text.length
    });
  }

  return { document: { text: output.join(""), runs }, diagnostics: [] };
}

export function shouldAttachRichText(source: string, document: RichTextDocumentIR): boolean {
  return document.runs.length > 0 || document.text !== source;
}

function parseRichTextOpenTag(source: string, start: number, end: number): ParsedOpenTag {
  const nameRange = readNameRange(source, start, end);
  const rawName = source.slice(nameRange.start, nameRange.end).toLowerCase();
  if (nameRange.start === nameRange.end) {
    return { diagnostic: unsupportedTagDiagnostic(source.slice(start, end), start, end) };
  }
  const name = canonicalRichTextTagName(rawName);
  if (!name) {
    return {
      diagnostic: {
        message: `Unsupported rich text tag: ${rawName}.`,
        start: nameRange.start,
        end: nameRange.end
      }
    };
  }

  const attributesStart = skipWhitespace(source, nameRange.end, end);
  if (name !== "font" && attributesStart < end) {
    const keyRange = readAttributeKeyRange(source, attributesStart, end);
    const diagnosticRange = nonEmptyRelativeRange(
      keyRange,
      readAttributeFragmentRange(source, attributesStart, end)
    );
    return {
      diagnostic: {
        message: `Rich text tag '${rawName}' does not accept attributes.`,
        start: diagnosticRange.start,
        end: diagnosticRange.end
      }
    };
  }

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
      return parseFontRichTextTag(source, attributesStart, end, nameRange);
    default:
      return { diagnostic: unsupportedTagDiagnostic(rawName, nameRange.start, nameRange.end) };
  }
}

function parseFontRichTextTag(
  source: string,
  start: number,
  end: number,
  nameRange: { start: number; end: number }
): ParsedOpenTag {
  const parsed = parseRichTextAttributes(source, start, end, new Set(["color", "size", "face"]));
  if (parsed.diagnostic) return { diagnostic: parsed.diagnostic };
  const style: RichTextRunStyleIR = {};
  const color = parsed.attrs.get("color");
  const size = parsed.attrs.get("size");
  const face = parsed.attrs.get("face");

  if (color) {
    if (!isSafeRichTextColor(color.value)) {
      const diagnosticRange = attributeValueRange(color);
      return {
        diagnostic: {
          message: `Invalid rich text font color: ${color.value}.`,
          start: diagnosticRange.start,
          end: diagnosticRange.end
        }
      };
    }
    style.color = color.value;
  }

  if (size) {
    const sizeScale = htmlFontSizeScale(size.value);
    if (sizeScale === undefined) {
      const diagnosticRange = attributeValueRange(size);
      return {
        diagnostic: {
          message: `Invalid rich text font size: ${size.value}.`,
          start: diagnosticRange.start,
          end: diagnosticRange.end
        }
      };
    }
    style.sizeScale = sizeScale;
  }

  if (face) {
    if (!fontFaceIdPattern.test(face.value)) {
      const diagnosticRange = attributeValueRange(face);
      return {
        diagnostic: {
          message: `Invalid rich text font face: ${face.value}.`,
          start: diagnosticRange.start,
          end: diagnosticRange.end
        }
      };
    }
    style.fontFaceId = face.value;
  }

  if (Object.keys(style).length === 0) {
    return {
      diagnostic: {
        message: "Rich text font tag requires color, size, or face.",
        start: nameRange.start,
        end: nameRange.end
      }
    };
  }
  return { name: "font", style };
}

function parseRichTextAttributes(
  source: string,
  start: number,
  end: number,
  allowedKeys: ReadonlySet<string>
): ParsedAttributes {
  const attrs = new Map<string, ParsedAttribute>();
  let index = start;
  while (index < end) {
    index = skipWhitespace(source, index, end);
    if (index >= end) break;
    const keyRange = readAttributeKeyRange(source, index, end);
    const rawKey = source.slice(keyRange.start, keyRange.end);
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/u.test(rawKey)) {
      return { attrs, diagnostic: invalidAttributeSyntax(source, index, end) };
    }
    const key = rawKey.toLowerCase();
    let cursor = skipWhitespace(source, keyRange.end, end);
    if (source[cursor] !== "=") {
      return { attrs, diagnostic: invalidAttributeSyntax(source, index, end) };
    }
    cursor = skipWhitespace(source, cursor + 1, end);
    if (cursor >= end) return { attrs, diagnostic: invalidAttributeSyntax(source, index, end) };

    const valueTokenStart = cursor;
    let valueStart = cursor;
    let valueEnd = cursor;
    const quote = source[cursor];
    if (quote === "\"" || quote === "'") {
      valueStart = cursor + 1;
      const close = source.indexOf(quote, valueStart);
      if (close < 0 || close > end) return { attrs, diagnostic: invalidAttributeSyntax(source, index, end) };
      valueEnd = close;
      cursor = close + 1;
    } else {
      while (cursor < end && !/[\s"'<>]/u.test(source[cursor] ?? "")) cursor += 1;
      valueEnd = cursor;
      if (valueStart === valueEnd) return { attrs, diagnostic: invalidAttributeSyntax(source, index, end) };
    }

    if (!allowedKeys.has(key)) {
      return {
        attrs,
        diagnostic: {
          message: `Unsupported rich text font attribute: ${key}.`,
          start: keyRange.start,
          end: keyRange.end
        }
      };
    }
    if (attrs.has(key)) {
      return {
        attrs,
        diagnostic: {
          message: `Duplicate rich text font attribute: ${key}.`,
          start: keyRange.start,
          end: keyRange.end
        }
      };
    }
    attrs.set(key, {
      key,
      value: source.slice(valueStart, valueEnd),
      keyStart: keyRange.start,
      keyEnd: keyRange.end,
      valueStart,
      valueEnd,
      valueTokenStart,
      valueTokenEnd: cursor
    });
    index = cursor;
  }
  return { attrs };
}

function invalidAttributeSyntax(source: string, start: number, end: number): RelativeRichTextDiagnostic {
  const fragmentRange = readAttributeFragmentRange(source, start, end);
  const diagnosticRange = nonEmptyRelativeRange(fragmentRange, { start, end });
  return {
    message: `Invalid rich text attribute syntax: ${source.slice(start, end).trim()}.`,
    start: diagnosticRange.start,
    end: diagnosticRange.end
  };
}

function unsupportedTagDiagnostic(value: string, start: number, end: number): RelativeRichTextDiagnostic {
  return { message: `Unsupported rich text tag: ${value}.`, start, end };
}

function attributeValueRange(attribute: ParsedAttribute): { start: number; end: number } {
  return nonEmptyRelativeRange(
    { start: attribute.valueStart, end: attribute.valueEnd },
    { start: attribute.valueTokenStart, end: attribute.valueTokenEnd },
    { start: attribute.keyStart, end: attribute.keyEnd }
  );
}

function nonEmptyRelativeRange(
  ...ranges: Array<{ start: number; end: number }>
): { start: number; end: number } {
  const range = ranges.find((candidate) => candidate.end > candidate.start);
  if (!range) throw new Error("Nani rich-text diagnostic invariant failed: no non-empty source anchor.");
  return range;
}

function readRichTextEntity(source: string, start: number): { value: string; end: number } | undefined {
  const semicolon = source.indexOf(";", start + 1);
  if (semicolon < 0) return undefined;
  const value = richTextEntityValue(source.slice(start + 1, semicolon));
  return value === undefined ? undefined : { value, end: semicolon + 1 };
}

function decodeRichTextEntities(source: string): string {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const entity = source[index] === "&" ? readRichTextEntity(source, index) : undefined;
    if (entity) {
      output += entity.value;
      index = entity.end;
      continue;
    }
    output += source[index] ?? "";
    index += 1;
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

function trimRange(source: string, start: number, end: number): { start: number; end: number } {
  let trimmedStart = start;
  let trimmedEnd = end;
  while (trimmedStart < trimmedEnd && /\s/u.test(source[trimmedStart] ?? "")) trimmedStart += 1;
  while (trimmedEnd > trimmedStart && /\s/u.test(source[trimmedEnd - 1] ?? "")) trimmedEnd -= 1;
  return { start: trimmedStart, end: trimmedEnd };
}

function skipWhitespace(source: string, start: number, end: number): number {
  let index = start;
  while (index < end && /\s/u.test(source[index] ?? "")) index += 1;
  return index;
}

function readNameRange(source: string, start: number, end: number): { start: number; end: number } {
  let cursor = start;
  while (cursor < end && /[a-zA-Z0-9_-]/u.test(source[cursor] ?? "")) cursor += 1;
  return { start, end: cursor };
}

function readAttributeKeyRange(source: string, start: number, end: number): { start: number; end: number } {
  let cursor = start;
  while (cursor < end && /[a-zA-Z0-9_-]/u.test(source[cursor] ?? "")) cursor += 1;
  return { start, end: cursor };
}

function readAttributeFragmentRange(source: string, start: number, end: number): { start: number; end: number } {
  let cursor = start;
  while (cursor < end && !/\s/u.test(source[cursor] ?? "")) cursor += 1;
  return { start, end: cursor };
}
