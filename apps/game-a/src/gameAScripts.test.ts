import { describe, expect, it } from "vitest";
import type { AssetRef, RuntimeCommand, VnRuntimeScriptSource } from "@v-ronpa/contracts";
import {
  compileRuntimeScript,
  digestRuntimeScriptSemantics,
  linkRuntimeScriptCatalog
} from "../../../packages/nani-runtime-compiler/src/index";
import { parseScenario } from "../../../packages/nani-parser/src/index";
import { gameAVnEntry } from "./contentManifest";
import { gameAStoryDefinition } from "./gameAScripts";
import {
  gameATestEntryLocators,
  gameATestScriptCatalog
} from "./generatedNaniTests";

describe("game-a nani catalogs", () => {
  it("uses one stable entry with opening and chapter-02 linked by an explicit endpoint", () => {
    expect(gameAStoryDefinition.entry).toBe(gameAVnEntry);
    expect(gameAVnEntry.id).toBe("vn:game-a-main");
    expect(gameAVnEntry.initialScriptPath).toBe("game-a/opening.nani");
    expect(gameAStoryDefinition.catalog.map((source) => source.scriptPath)).toEqual([
      "game-a/chapter-02.nani",
      "game-a/opening.nani"
    ]);

    const opening = source("game-a/opening.nani");
    const chapter = source("game-a/chapter-02.nani");
    expect(opening.sourceText).toContain("goto:game-a/chapter-02.nani#Start");
    expect(opening.sourceText).not.toContain("#MILKBEGIN");
    expect(opening.sourceText.indexOf("@charTone rain")).toBeLessThan(opening.sourceText.indexOf("@char alice pos:50"));
    expect(chapter.sourceText).toContain("#Start");
    expect(chapter.sourceText.startsWith("#Start\n@charTone rain\n")).toBe(true);
    expect(chapter.sourceText).toContain("@stopSfx group:rain fade:0.8");
    expect(chapter.sourceText).toContain("@end");

    const compiled = gameAStoryDefinition.catalog.map(compile);
    expect(linkRuntimeScriptCatalog(gameAVnEntry, compiled).diagnostics).toEqual([]);
  });

  it("matches every generated semantic revision and preload plan", async () => {
    for (const item of gameAStoryDefinition.catalog) {
      const compiled = compile(item);
      expect(await digestRuntimeScriptSemantics(compiled)).toBe(item.scriptRevision);
      const prepared = gameAStoryDefinition.characterPreloadPlanByScriptPath[item.scriptPath];
      const requested = compiled.commands
        .filter((command) => command.commandId === "char")
        .map((command) => ({
          characterId: stringParam(command, "target"),
          expression: stringParam(command, "appearanceExpression") ?? ""
        }));
      expect(requested.every(({ characterId, expression }) => prepared?.some(
        (record) => record.characterId === characterId && record.appearanceExpressions.includes(expression)
      ))).toBe(true);
    }
  });

  it("keeps one shared test catalog isolated from production and valid for each explicit entry", async () => {
    expect(gameATestScriptCatalog).toHaveLength(2);
    for (const item of gameATestScriptCatalog) {
      expect(item.scriptPath).toMatch(/^game-a\/test\//u);
      expect(item.sourceText).toContain("CHECKPOINT");
      expect(await digestRuntimeScriptSemantics(compile(item))).toBe(item.scriptRevision);
    }
    for (const entry of Object.values(gameATestEntryLocators)) {
      expect(linkRuntimeScriptCatalog(entry, gameATestScriptCatalog.map(compile)).diagnostics).toEqual([]);
    }
    expect(gameAStoryDefinition.catalog.every((item) => !item.scriptPath.includes("/test/"))).toBe(true);
  });

  it("declares the deduplicated asset union from every production script on the entry", () => {
    const entryRefs = new Set(gameAVnEntry.assetRefs.map((ref) => `${ref.kind}:${ref.id}`));
    const scriptRefs = gameAStoryDefinition.catalog.flatMap((item) => collectRuntimeCommandAssetRefs(compile(item).commands));
    expect(scriptRefs.filter((ref) => !entryRefs.has(`${ref.kind}:${ref.id}`))).toEqual([]);
    expect(scriptRefs).toEqual(expect.arrayContaining([
      { id: "alice", kind: "character-pack" },
      { id: "bg:home-outside", kind: "background" },
      { id: "bgm:dead-fish-riffle", kind: "bgm" },
      { id: "sfx:gentle-rain-loop", kind: "sfx" }
    ]));
  });
});

function source(scriptPath: string): VnRuntimeScriptSource {
  const result = gameAStoryDefinition.catalog.find((item) => item.scriptPath === scriptPath);
  if (!result) throw new Error(`Missing ${scriptPath}`);
  return result;
}

function compile(item: VnRuntimeScriptSource) {
  const parsed = parseScenario({ scriptPath: item.scriptPath, sourceText: item.sourceText });
  const compiled = compileRuntimeScript(parsed);
  expect(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  return compiled.script;
}

function collectRuntimeCommandAssetRefs(commands: RuntimeCommand[]): Array<Pick<AssetRef, "id" | "kind">> {
  const refs = new Map<string, Pick<AssetRef, "id" | "kind">>();
  const add = (id: string | undefined, kind: AssetRef["kind"]) => {
    if (id) refs.set(`${kind}:${id}`, { id, kind });
  };
  for (const command of commands) {
    if (command.commandId === "char") add(stringParam(command, "target"), "character-pack");
    if (command.commandId === "back" || command.commandId === "inback") add(stringParam(command, "appearance"), "background");
    if (command.commandId === "bgm") add(stringParam(command, "bgmPath"), "bgm");
    if (command.commandId === "sfx" || command.commandId === "sfxfast") add(stringParam(command, "sfxPath"), "sfx");
    if (command.commandId === "movie") add(stringParam(command, "moviePath"), "video");
  }
  return [...refs.values()].sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
}

function stringParam(command: RuntimeCommand, key: string): string | undefined {
  const value = command.params[key];
  return typeof value === "string" ? value : undefined;
}
