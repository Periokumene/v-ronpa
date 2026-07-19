import { describe, expect, it } from "vitest";
import { mergeVnDevtoolsDiagnostics } from "./controllerDiagnostics";

describe("Nani devtools diagnostic merging", () => {
  it("deduplicates the same server/browser diagnostic without hiding distinct locations", () => {
    const bridge = {
      id: "bridge:1",
      severity: "error" as const,
      code: "unexpected-token",
      lineNumber: 4,
      lineId: "line-4",
      columnNumber: 7,
      span: { start: 18, end: 23 },
      message: "Unexpected token."
    };
    const browserCopy = { ...bridge, id: "browser:1" };
    const otherLine = { ...bridge, id: "browser:2", lineNumber: 5, lineId: "line-5" };

    expect(mergeVnDevtoolsDiagnostics([bridge], [browserCopy, otherLine]))
      .toEqual([bridge, otherLine]);
  });

  it("keeps separate diagnostics for different UTF-16 tokens on the same line", () => {
    const left = {
      id: "left",
      severity: "warning" as const,
      code: "invalid-command-param",
      lineNumber: 2,
      lineId: "line-2",
      span: { start: 12, end: 16 },
      message: "Invalid value."
    };
    const right = { ...left, id: "right", span: { start: 24, end: 28 } };

    expect(mergeVnDevtoolsDiagnostics([left, right])).toEqual([left, right]);
  });
});
