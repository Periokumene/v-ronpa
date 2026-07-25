import { describe, expect, it } from "vitest";
import { getNaniCompletions } from "./completionProvider";
import { getNaniHover } from "./hoverProvider";
import {
  analyzeNaniCatalog,
  analyzeNaniDocument,
  resolveNavigationTarget
} from "./navigationAnalysis";

describe("multi-script Nani navigation analysis", () => {
  it("links valid goto and choice endpoints and exposes target labels", () => {
    const opening = analyzeNaniDocument([
      "#Start",
      "@goto #Start",
      '@choice "Continue" goto:game/chapter.nani#Chapter'
    ].join("\n"), "game/opening.nani");
    const chapter = analyzeNaniDocument("#Chapter\n@end", "game/chapter.nani");
    const catalog = analyzeNaniCatalog(
      "production",
      "game/opening.nani",
      { initialScriptPath: "game/opening.nani", startLabel: "Start" },
      [
        { sourceUri: "file:///opening.nani", analysis: opening },
        { sourceUri: "file:///chapter.nani", analysis: chapter }
      ]
    );

    expect([...catalog.diagnosticsByScriptPath.values()].flat()).toEqual([]);
    expect(resolveNavigationTarget(
      "game/chapter.nani#Chapter",
      catalog.navigation
    )?.label).toBe("Chapter");
  });

  it("projects linker failures onto the exact authored endpoint values", () => {
    const source = [
      "#Start",
      "@goto ../relative.nani",
      "@goto game/missing.nani",
      '@choice "Continue" goto:game/chapter.nani#Missing'
    ].join("\n");
    const opening = analyzeNaniDocument(source, "game/opening.nani");
    const chapter = analyzeNaniDocument("#Chapter\n@end", "game/chapter.nani");
    const catalog = analyzeNaniCatalog(
      "production",
      "game/opening.nani",
      { initialScriptPath: "game/opening.nani" },
      [
        { sourceUri: "file:///opening.nani", analysis: opening },
        { sourceUri: "file:///chapter.nani", analysis: chapter }
      ]
    );
    const diagnostics = catalog.diagnosticsByScriptPath.get("game/opening.nani") ?? [];

    expect(diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      text: source.slice(diagnostic.span.start, diagnostic.span.end)
    }))).toEqual([
      { code: "endpoint-relative-path", text: "../relative.nani" },
      { code: "endpoint-script-missing", text: "game/missing.nani" },
      { code: "endpoint-label-missing", text: "game/chapter.nani#Missing" }
    ]);
  });

  it("uses shared endpoint rules for absolute, wildcard, dynamic, and malformed values", () => {
    const source = [
      "@goto /game/chapter.nani",
      "@goto game/*.nani",
      "@goto {nextScript}",
      "@goto game/chapter",
      "@call game/chapter.nani#Chapter"
    ].join("\n");
    const catalog = analyzeNaniCatalog(
      "production",
      "game/opening.nani",
      { initialScriptPath: "game/opening.nani" },
      [
        {
          sourceUri: "file:///opening.nani",
          analysis: analyzeNaniDocument(source, "game/opening.nani")
        },
        {
          sourceUri: "file:///chapter.nani",
          analysis: analyzeNaniDocument("#Chapter\n@end", "game/chapter.nani")
        }
      ]
    );
    const endpointCodes = (catalog.diagnosticsByScriptPath.get("game/opening.nani") ?? [])
      .map((diagnostic) => diagnostic.code)
      .filter((code) => code.startsWith("endpoint-"));

    expect(endpointCodes).toEqual([
      "endpoint-relative-path",
      "endpoint-wildcard",
      "endpoint-not-static",
      "endpoint-script-extension-required"
    ]);
  });

  it("offers local labels before scripts and target labels after path hash", () => {
    const source = "#Local\n@goto ";
    const opening = analyzeNaniDocument(source, "game/opening.nani");
    const chapter = analyzeNaniDocument("#Chapter\n#Credits\n@end", "game/chapter.nani");
    const navigation = analyzeNaniCatalog(
      "production",
      "game/opening.nani",
      { initialScriptPath: "game/opening.nani" },
      [
        { sourceUri: "file:///opening.nani", analysis: opening },
        { sourceUri: "file:///chapter.nani", analysis: chapter }
      ]
    ).navigation;

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
    const navigation = analyzeNaniCatalog(
      "production",
      "game/opening.nani",
      { initialScriptPath: "game/opening.nani" },
      [
        {
          sourceUri: "file:///opening.nani",
          analysis: analyzeNaniDocument(source, "game/opening.nani")
        },
        {
          sourceUri: "file:///chapter.nani",
          analysis: analyzeNaniDocument("#Chapter\n@end", "game/chapter.nani")
        }
      ]
    ).navigation;

    expect(getNaniHover(source, { line: 1, character: 15 }, navigation)?.contents)
      .toContain("cross-script");
    expect(getNaniHover(
      "#Start\n@goto game/missing.nani",
      { line: 1, character: 15 },
      navigation
    )).toBeUndefined();
  });
});
