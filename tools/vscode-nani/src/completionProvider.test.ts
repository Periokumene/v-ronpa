import { describe, expect, it } from "vitest";
import { getNaniCompletions } from "./completionProvider";

describe("completion provider logic", () => {
  it("suggests commands on a blank line with an @ insert prefix", () => {
    const bgm = getNaniCompletions("", { line: 0, character: 0 }).find((completion) => completion.label === "bgm");

    expect(bgm?.insertText).toBe("@bgm");
    expect(bgm?.range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 }
    });
  });

  it("suggests commands after @ without replacing the @", () => {
    const bgm = getNaniCompletions("@b", { line: 0, character: 2 }).find((completion) => completion.label === "bgm");

    expect(bgm?.insertText).toBe("bgm");
    expect(bgm?.range).toEqual({
      start: { line: 0, character: 1 },
      end: { line: 0, character: 2 }
    });
  });

  it("suggests command params and boolean flag variants in param position", () => {
    const completions = getNaniCompletions("@bgm Piano ", { line: 0, character: "@bgm Piano ".length });
    const labels = completions.map((completion) => completion.label);

    expect(labels).toContain("volume:");
    expect(labels).toContain("wait!");
    expect(labels).toContain("!wait");
  });

  it("does not treat primary args as already-used params", () => {
    const completions = getNaniCompletions("@bgm wait ", { line: 0, character: "@bgm wait ".length });
    const labels = completions.map((completion) => completion.label);

    expect(labels).toContain("wait!");
  });

  it("suggests current file labels for goto primary targets", () => {
    const source = "#Start\n@goto #\n#End";
    const completions = getNaniCompletions(source, { line: 1, character: "@goto #".length });

    expect(completions.map((completion) => completion.label)).toEqual(["#Start", "#End"]);
    expect(completions[0]?.insertText).toBe("Start");
    expect(completions[0]?.range).toEqual({
      start: { line: 1, character: 7 },
      end: { line: 1, character: 7 }
    });
  });

  it("suggests current file labels for goto params", () => {
    const source = "#Start\n@choice \"Go\" goto:#E\n#End";
    const completions = getNaniCompletions(source, { line: 1, character: "@choice \"Go\" goto:#E".length });

    expect(completions.map((completion) => completion.label)).toEqual(["#End"]);
    expect(completions[0]?.insertText).toBe("End");
  });

  it("suggests inline command snippets in dialogue text", () => {
    const source = "Felix.Happy: Hello [";
    const completions = getNaniCompletions(source, { line: 0, character: source.length });

    expect(completions.map((completion) => completion.label)).toEqual(["[>]", "[< speed:0.8]"]);
    expect(completions[1]?.insertText).toBe("[< speed:${1:0.8}]");
    expect(completions[1]?.isSnippet).toBe(true);
  });
});
