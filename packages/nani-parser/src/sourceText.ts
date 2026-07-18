import type { SourceLocation, TextSpan } from "./types";

export interface NaniSourceLine {
  line: number;
  start: number;
  end: number;
  raw: string;
  trimmed: string;
  trimmedSpan: TextSpan;
}

export function scanSourceLines(sourceText: string): NaniSourceLine[] {
  const lines: NaniSourceLine[] = [];
  let start = 0;
  let line = 1;

  const pushLine = (end: number): void => {
    const raw = sourceText.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    const trimmedEnd = raw.length === leading ? leading : raw.length - trailing;
    lines.push({
      line,
      start,
      end,
      raw,
      trimmed: raw.slice(leading, raw.length - trailing),
      trimmedSpan: {
        start: start + leading,
        end: start + trimmedEnd
      }
    });
  };

  let index = 0;
  while (index < sourceText.length) {
    const char = sourceText[index];
    if (char !== "\r" && char !== "\n") {
      index += 1;
      continue;
    }

    pushLine(index);
    const delimiterLength = char === "\r" && sourceText[index + 1] === "\n" ? 2 : 1;
    index += delimiterLength;
    start = index;
    line += 1;
  }
  pushLine(sourceText.length);

  return lines;
}

export function sourceLocation(scriptPath: string, line: NaniSourceLine, columnOffset = 0): SourceLocation {
  return {
    scriptPath,
    line: line.line,
    column: line.trimmedSpan.start - line.start + columnOffset + 1,
    raw: line.raw
  };
}

export function textSpan(start: number, end: number): TextSpan {
  return { start, end };
}
