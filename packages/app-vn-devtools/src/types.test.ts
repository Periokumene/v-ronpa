import { describe, expect, it } from "vitest";
import {
  VN_DEVTOOLS_DEFAULT_WIDTH,
  VN_DEVTOOLS_DEFAULT_PANEL_HEIGHT,
  VN_DEVTOOLS_MAX_PANEL_HEIGHT,
  VN_DEVTOOLS_MAX_WIDTH,
  VN_DEVTOOLS_MIN_PANEL_HEIGHT,
  VN_DEVTOOLS_MIN_WIDTH,
  canPreviewVnDevtoolsLine,
  clampVnDevtoolsPanelHeight,
  clampVnDevtoolsWidth,
  type VnDevtoolsSourceLine
} from "./types";
import {
  createVnDevtoolsFindResult,
  highlightVnDevtoolsSource,
  stepVnDevtoolsFindMatch
} from "./sourceViewModel";

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
    expect(clampVnDevtoolsPanelHeight(40)).toBe(VN_DEVTOOLS_MIN_PANEL_HEIGHT);
    expect(clampVnDevtoolsPanelHeight(241.6)).toBe(242);
    expect(clampVnDevtoolsPanelHeight(999)).toBe(VN_DEVTOOLS_MAX_PANEL_HEIGHT);
    expect(clampVnDevtoolsPanelHeight(Number.NaN)).toBe(VN_DEVTOOLS_DEFAULT_PANEL_HEIGHT);
  });

  it("finds source text, labels, commands, and line numbers without filtering source", () => {
    const label = createVnDevtoolsFindResult(lines, "start");
    expect(label.matches.map((match) => match.lineId)).toEqual(["line:start"]);
    expect(label.matches[0]?.kinds).toEqual(["source", "label"]);
    expect(label.matches[0]?.sourceRanges).toEqual([{ start: 1, end: 6 }]);

    const command = createVnDevtoolsFindResult(lines, "RAIN");
    expect(command.matches.map((match) => match.lineId)).toEqual(["line:rain"]);
    expect(command.matches[0]?.kinds).toEqual(["source", "command"]);
    expect(command.matches[0]?.sourceRanges).toEqual([{ start: 1, end: 5 }]);

    const lineNumber = createVnDevtoolsFindResult(lines, "9");
    expect(lineNumber.matches.map((match) => match.lineId)).toEqual(["line:end"]);
    expect(lineNumber.matches[0]?.kinds).toContain("line-number");
    expect(createVnDevtoolsFindResult(lines, "missing")).toMatchObject({
      matches: [],
      currentMatchIndex: -1
    });
    expect(createVnDevtoolsFindResult(lines, "  ")).toMatchObject({
      matches: [],
      currentMatchIndex: -1
    });
  });

  it("cycles IDE find results in both directions and preserves long source lists", () => {
    const longLines = Array.from({ length: 250 }, (_, index) => ({
      id: `line:${index + 1}`,
      lineNumber: index + 1,
      sourceText: index % 50 === 0 ? "nar: Repeat repeat" : "nar: context",
      previewability: "previewable" as const
    }));
    const result = createVnDevtoolsFindResult(longLines, "repeat", 12);
    expect(result.matches).toHaveLength(5);
    expect(result.currentMatchIndex).toBe(2);
    expect(result.matches[0]?.sourceRanges).toEqual([{ start: 5, end: 11 }, { start: 12, end: 18 }]);
    expect(stepVnDevtoolsFindMatch(4, 5, 1)).toBe(0);
    expect(stepVnDevtoolsFindMatch(0, 5, -1)).toBe(4);
    expect(stepVnDevtoolsFindMatch(-1, 0, 1)).toBe(-1);
    expect(longLines).toHaveLength(250);
  });

  it("highlights syntax without changing a single source character", () => {
    for (const source of [
      "#StoryBegin",
      "@char id:alice expression:\"calm\"",
      "nar: Hello, 'world'",
      ""
    ]) {
      const tokens = highlightVnDevtoolsSource(source);
      expect(tokens.map((token) => token.text).join("")).toBe(source);
    }
    expect(highlightVnDevtoolsSource("@bg id:\"rain\"").map((token) => token.kind)).toEqual([
      "command",
      "plain",
      "string"
    ]);
  });

  it("only disables targets that cannot produce an installable stable result", () => {
    expect(canPreviewVnDevtoolsLine(lines[0]!)).toBe(true);
    expect(canPreviewVnDevtoolsLine(lines[1]!)).toBe(true);
    expect(canPreviewVnDevtoolsLine(lines[2]!)).toBe(false);
    expect(canPreviewVnDevtoolsLine({ ...lines[0]!, previewability: "blocked" })).toBe(false);
  });
});
