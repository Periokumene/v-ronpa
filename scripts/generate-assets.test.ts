import { describe, expect, it } from "vitest";
import type { RuntimeCommand, RuntimeScript, RuntimeValue } from "@v-ronpa/contracts";
import {
  digestRuntimeScriptSemantics,
  serializeRuntimeScriptSemantics
} from "../packages/nani-runtime-compiler/src/index.ts";
import { deriveLayeredCharacterPreloadPlan } from "../packages/layered-character/src/index.ts";
import {
  analyzeGameANaniDevelopment,
  analyzeGameANaniProduction,
  analyzeGameANaniTests,
  generateGameANaniProductionModule,
  generateGameANaniTestsModule
} from "./generate-assets.mjs";

describe("generated script revisions", () => {
  it("ignores source locations but changes for semantic command content", async () => {
    const base = runtimeScript("Hello", 1);
    expect(await digestRuntimeScriptSemantics(base)).toBe(
      await digestRuntimeScriptSemantics(runtimeScript("Hello", 99))
    );
    expect(await digestRuntimeScriptSemantics(base)).not.toBe(
      await digestRuntimeScriptSemantics(runtimeScript("Changed", 1))
    );
  });

  it("hashes the compiler-owned canonical semantic serialization", async () => {
    const script = runtimeScript("Hello", 1);

    expect(serializeRuntimeScriptSemantics(script)).toBe(
      '{"commands":[{"canonicalName":"print","category":"text","commandId":"print","params":{"autoNext":false,"text":"Hello"},"source":"v-ronpa","status":"implemented"}],"labels":{"Start":0},"scriptPath":"game/test.nani"}'
    );
    expect(await digestRuntimeScriptSemantics(script)).toBe("sha256:455fbd5b40f88d7cf9f71f0bb6c13979e5f52f3fec3d7f2d6f39aff0837af8a9");
  });
});

describe("generated Game A script metadata boundaries", () => {
  it("discovers the canonical physical scope directories while preserving logical script identity", async () => {
    const production = await analyzeGameANaniProduction();
    const development = await analyzeGameANaniDevelopment();
    const tests = await analyzeGameANaniTests();

    expect(production.scripts.map(({ sourceFile, scriptPath }) => ({ sourceFile, scriptPath }))).toEqual([
      {
        sourceFile: "apps/game-a/src/nani/chapter-02.nani",
        scriptPath: "game-a/chapter-02.nani"
      },
      {
        sourceFile: "apps/game-a/src/nani/opening.nani",
        scriptPath: "game-a/opening.nani"
      }
    ]);
    expect(development.scripts.find((script) => script.scope === "development")).toMatchObject({
      sourceFile: "apps/game-a/src/nani-dev/draft-home-quarrel.nani",
      scriptPath: "game-a/dev/draft-home-quarrel.nani"
    });
    expect(tests.scripts.map(({ sourceFile, scriptPath }) => ({ sourceFile, scriptPath }))).toEqual([
      {
        sourceFile: "apps/game-a/src/nani-test/character-smoke.nani",
        scriptPath: "game-a/test/character-smoke.nani"
      },
      {
        sourceFile: "apps/game-a/src/nani-test/smoke.nani",
        scriptPath: "game-a/test/smoke.nani"
      }
    ]);
  });

  it("keeps product and shared test Nani in separate generated exports", async () => {
    const productModule = await generateGameANaniProductionModule();
    const testModule = await generateGameANaniTestsModule();

    expect(productModule).toContain('"game-a/opening.nani"');
    expect(productModule).toContain("export const gameAVnEntryLocator");
    expect(productModule).toContain("export const gameAScriptCatalog");
    expect(productModule).toContain('"id": "vn:game-a-main"');
    expect(productModule).not.toContain('"game-a/test/');
    expect(productModule).not.toContain("gameATestScriptMetadataByPath");
    expect(testModule).toContain('"game-a/test/smoke.nani"');
    expect(testModule).toContain('"game-a/test/character-smoke.nani"');
    expect(testModule).toContain("export const gameATestEntryLocators");
    expect(testModule).toContain("export const gameATestScriptCatalog");
    expect(testModule).toContain('"smoke"');
    expect(testModule).toContain('"character"');
    expect(testModule).not.toContain('"game-a/opening.nani"');
  });
});

describe("generated layered-character preload plans", () => {
  it("collects stable explicit, slide, duplicate, branch, and wildcard expressions", () => {
    const script = runtimeScript("Hello", 1);
    script.commands = [
      runtimeCommand("char", { target: "Ema", appearanceExpression: "" }),
      runtimeCommand("char", { target: "alice", appearanceExpression: "Smile" }),
      runtimeCommand("char", { target: "Ema", appearanceExpression: "Pensive1,ArmR3" }),
      runtimeCommand("char", { target: "alice", appearanceExpression: "Smile" }),
      runtimeCommand("slide", { target: "alice", appearanceExpression: "Angry" }),
      runtimeCommand("char", { target: "*", appearanceExpression: "Shared" }),
      runtimeCommand("slide", { target: "background", appearanceExpression: "ignored" })
    ];

    expect(deriveLayeredCharacterPreloadPlan(script)).toEqual([
      { characterId: "alice", appearanceExpressions: ["Angry", "Shared", "Smile"] },
      { characterId: "Ema", appearanceExpressions: ["", "Pensive1,ArmR3", "Shared"] }
    ]);
  });
});

function runtimeScript(text: string, line: number): RuntimeScript {
  return {
    scriptPath: "game/test.nani",
    labels: { Start: 0 },
    assets: [],
    dependencies: [],
    commands: [
      {
        commandId: "print",
        canonicalName: "print",
        category: "text",
        source: "v-ronpa",
        status: "implemented",
        params: { text, autoNext: false },
        loc: { scriptPath: "game/test.nani", line, column: 1, raw: text }
      }
    ]
  };
}

function runtimeCommand(commandId: string, params: Record<string, RuntimeValue>): RuntimeCommand {
  return {
    commandId,
    canonicalName: commandId,
    category: "actor",
    source: "v-ronpa",
    status: "implemented",
    params,
    loc: { scriptPath: "game/test.nani", line: 1, column: 1, raw: `@${commandId}` }
  };
}
