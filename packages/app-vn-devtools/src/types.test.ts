import { describe, expect, it } from "vitest";
import {
  VN_DEVTOOLS_DEFAULT_WIDTH,
  VN_DEVTOOLS_MAX_WIDTH,
  VN_DEVTOOLS_MIN_WIDTH,
  canPreviewVnDevtoolsLine,
  clampVnDevtoolsWidth,
  filterVnDevtoolsLines,
  type VnDevtoolsSourceLine
} from "./types";

describe("VN devtools view-model helpers", () => {
  const lines: readonly VnDevtoolsSourceLine[] = [
    {
      id: "line:start",
      lineNumber: 1,
      sourceText: "#Start",
      label: "Start",
      previewability: "previewable"
    },
    {
      id: "line:rain",
      lineNumber: 8,
      sourceText: "@rain power:1",
      command: "rain",
      previewability: "degraded"
    },
    {
      id: "line:end",
      lineNumber: 9,
      sourceText: "@end",
      command: "end",
      previewability: "no-stable-result"
    }
  ];

  it("clamps persisted and pointer widths to the supported dock range", () => {
    expect(clampVnDevtoolsWidth(100)).toBe(VN_DEVTOOLS_MIN_WIDTH);
    expect(clampVnDevtoolsWidth(500.6)).toBe(501);
    expect(clampVnDevtoolsWidth(900)).toBe(VN_DEVTOOLS_MAX_WIDTH);
    expect(clampVnDevtoolsWidth(Number.NaN)).toBe(VN_DEVTOOLS_DEFAULT_WIDTH);
  });

  it("searches source text, labels, commands, and line numbers", () => {
    expect(filterVnDevtoolsLines(lines, "start").map((line) => line.id)).toEqual(["line:start"]);
    expect(filterVnDevtoolsLines(lines, "RAIN").map((line) => line.id)).toEqual(["line:rain"]);
    expect(filterVnDevtoolsLines(lines, "9").map((line) => line.id)).toEqual(["line:end"]);
    expect(filterVnDevtoolsLines(lines, "  ")).toBe(lines);
  });

  it("only disables targets that cannot produce an installable stable result", () => {
    expect(canPreviewVnDevtoolsLine(lines[0]!)).toBe(true);
    expect(canPreviewVnDevtoolsLine(lines[1]!)).toBe(true);
    expect(canPreviewVnDevtoolsLine(lines[2]!)).toBe(false);
    expect(canPreviewVnDevtoolsLine({ ...lines[0]!, previewability: "blocked" })).toBe(false);
  });
});
