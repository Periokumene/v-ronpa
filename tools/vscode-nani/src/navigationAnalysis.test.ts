import type { TextSpan } from "@v-ronpa/nani-parser";
import { describe, expect, it } from "vitest";
import { getNaniCompletions } from "./completionProvider";
import { getNaniHover } from "./hoverProvider";
import {
  analyzeNaniDocument,
  resolveNavigationTarget,
  type NaniNavigationIndex,
  type NaniNavigationScript
} from "./navigationAnalysis";

describe("multi-script Nani navigation language features", () => {
  it("resolves labels from the shared-analysis navigation view", () => {
    const navigation = navigationIndex([
      script("game/opening.nani", "#Start\n@goto game/chapter.nani#Chapter"),
      script("game/chapter.nani", "#Chapter\n@end")
    ]);

    expect(resolveNavigationTarget("game/chapter.nani#Chapter", navigation)?.label).toBe("Chapter");
  });

  it("offers local labels before scripts and target labels after path hash", () => {
    const source = "#Local\n@goto ";
    const navigation = navigationIndex([
      script("game/opening.nani", source),
      script("game/chapter.nani", "#Chapter\n#Credits\n@end")
    ]);

    const initial = getNaniCompletions(
      source,
      { line: 1, character: "@goto ".length },
      undefined,
      navigation
    );
    expect(initial.map((item) => item.label)).toEqual([
      "#Local",
      "game/opening.nani",
      "game/chapter.nani"
    ]);
    const crossSource = "#Local\n@goto game/chapter.nani#C";
    const labels = getNaniCompletions(
      crossSource,
      { line: 1, character: crossSource.split("\n")[1]?.length ?? 0 },
      undefined,
      navigation
    );
    expect(labels.map((item) => item.label)).toEqual(["#Chapter", "#Credits"]);
    const callSource = "#Local\n@call ";
    expect(getNaniCompletions(
      callSource,
      { line: 1, character: "@call ".length },
      undefined,
      navigation
    ).some((item) => item.kind === "label" || item.kind === "resource")).toBe(false);
  });

  it("shows resolved endpoint hover and leaves invalid targets to diagnostics", () => {
    const source = "#Start\n@goto game/chapter.nani#Chapter";
    const navigation = navigationIndex([
      script("game/opening.nani", source),
      script("game/chapter.nani", "#Chapter\n@end")
    ]);

    expect(getNaniHover(source, { line: 1, character: 15 }, navigation)?.contents)
      .toContain("cross-script");
    expect(getNaniHover(
      "#Start\n@goto game/missing.nani",
      { line: 1, character: 15 },
      navigation
    )).toBeUndefined();
  });
});

function navigationIndex(scripts: readonly NaniNavigationScript[]): NaniNavigationIndex {
  return {
    catalogId: "development",
    currentScriptPath: "game/opening.nani",
    scripts: new Map(scripts.map((value) => [value.scriptPath, value]))
  };
}

function script(scriptPath: string, sourceText: string): NaniNavigationScript {
  const analysis = analyzeNaniDocument(sourceText, scriptPath);
  const labels: Record<string, TextSpan> = {};
  for (const [index, statement] of analysis.parsed.scenario.statements.entries()) {
    if (statement.kind !== "label") continue;
    const span = analysis.parsed.sourceMap.statements[index]?.nameSpan;
    if (span) labels[statement.name] = span;
  }
  return {
    scriptPath,
    sourceUri: `file:///${scriptPath}`,
    sourceText,
    labels
  };
}
