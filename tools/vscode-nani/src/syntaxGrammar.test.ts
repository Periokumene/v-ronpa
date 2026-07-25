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
});
