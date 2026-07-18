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
      message: "Unexpected token."
    };
    const browserCopy = { ...bridge, id: "browser:1" };
    const otherLine = { ...bridge, id: "browser:2", lineNumber: 5, lineId: "line-5" };

    expect(mergeVnDevtoolsDiagnostics([bridge], [browserCopy, otherLine]))
      .toEqual([bridge, otherLine]);
  });
});
