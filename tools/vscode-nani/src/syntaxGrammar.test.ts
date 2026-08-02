import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Nani TextMate navigation scopes", () => {
  it("keeps script paths and label fragments as presentation-only scopes", () => {
    const grammar = JSON.parse(
      readFileSync(join(process.cwd(), "syntaxes/nani.tmLanguage.json"), "utf8")
    ) as {
      repository: Record<string, {
        name?: string;
        match?: string;
        captures?: Record<string, { name: string }>;
      }>;
    };

    expect(grammar.repository.navigationScriptPath).toEqual({
      name: "string.unquoted.script-path.nani",
      match: "[A-Za-z0-9_][A-Za-z0-9_./-]*\\.nani"
    });
    expect(grammar.repository.labelReference?.match)
      .toBe("(#)([A-Za-z_][A-Za-z0-9_.-]*)");
    expect(grammar.repository.labelReference?.captures?.["2"]?.name)
      .toBe("variable.other.label-fragment.nani");
  });

  it("assigns independent scopes to compact and long staged markers", () => {
    const grammar = JSON.parse(
      readFileSync(join(process.cwd(), "syntaxes/nani.tmLanguage.json"), "utf8")
    ) as {
      repository: Record<string, {
        patterns?: readonly {
          name?: string;
          match?: string;
          captures?: Record<string, { name: string }>;
        }[];
      }>;
    };
    const patterns = grammar.repository.inlineStageStop?.patterns ?? [];

    expect(patterns.map((pattern) => pattern.name)).toEqual([
      "meta.inline-stage-stop.compact.nani",
      "meta.inline-stage-stop.wait.nani"
    ]);
    expect(patterns[0]?.match).toContain("(?<!\\\\)");
    expect(patterns[1]?.captures?.["4"]?.name).toBe("constant.language.wait-mode.input.nani");
    const story = grammar.repository.storyCommandLine as unknown as {
      begin: string;
      patterns: readonly { include: string }[];
    };
    expect(story.begin).toContain("print|cue");
    expect(story.patterns.map((pattern) => pattern.include)).toEqual(expect.arrayContaining([
      "#storyTextValue",
      "#storyString",
      "#inlineCompactStageStop"
    ]));
  });
});
