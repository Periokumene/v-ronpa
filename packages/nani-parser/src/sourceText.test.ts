import { describe, expect, it } from "vitest";
import { parseScenario } from "./index";
import { scanSourceLines } from "./sourceText";

describe("source line scanning", () => {
  it("recognizes mixed CR, LF, and CRLF delimiters at original UTF-16 offsets", () => {
    const source = "\uFEFF#Start\r@print one\r\n  @print two\n@end\r";
    const lines = scanSourceLines(source);

    expect(lines.map(({ line, raw, trimmed }) => ({ line, raw, trimmed }))).toEqual([
      { line: 1, raw: "\uFEFF#Start", trimmed: "#Start" },
      { line: 2, raw: "@print one", trimmed: "@print one" },
      { line: 3, raw: "  @print two", trimmed: "@print two" },
      { line: 4, raw: "@end", trimmed: "@end" },
      { line: 5, raw: "", trimmed: "" }
    ]);
    expect(lines.map(({ start, end }) => ({ start, end }))).toEqual([
      { start: 0, end: source.indexOf("\r") },
      { start: source.indexOf("@print one"), end: source.indexOf("\r\n") },
      { start: source.indexOf("  @print two"), end: source.indexOf("\n@end") },
      { start: source.indexOf("@end"), end: source.lastIndexOf("\r") },
      { start: source.length, end: source.length }
    ]);
    for (const line of lines) expect(source.slice(line.start, line.end)).toBe(line.raw);
  });

  it("keeps BOM and mixed line endings in locations while parsing trimmed statements", () => {
    const source = "\uFEFF#Start\r@print one\r\n  @print two\n@end";
    const result = parseScenario({ sourceText: source, scriptPath: "mixed-lines.nani" });

    expect(result.diagnostics).toEqual([]);
    expect(result.scenario.statements.map((statement) => statement.loc)).toEqual([
      { scriptPath: "mixed-lines.nani", line: 1, column: 2, raw: "\uFEFF#Start" },
      { scriptPath: "mixed-lines.nani", line: 2, column: 1, raw: "@print one" },
      { scriptPath: "mixed-lines.nani", line: 3, column: 3, raw: "  @print two" },
      { scriptPath: "mixed-lines.nani", line: 4, column: 1, raw: "@end" }
    ]);
    expect(result.sourceMap.statements.map((statement) => source.slice(statement.span.start, statement.span.end)))
      .toEqual(["#Start", "@print one", "@print two", "@end"]);
  });
});
