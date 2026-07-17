import { describe, expect, it } from "vitest";
import type { AssetRef, RuntimeCommand } from "@v-ronpa/contracts";
import { compileRuntimeScript } from "../../../packages/nani-runtime-compiler/src/index";
import { parseScenario } from "../../../packages/nani-parser/src/index";
import { gameAVnEntry } from "./contentManifest";
import { gameAOpeningLaunchDefinition, gameAOpeningNaniSource } from "./gameAScripts";
import {
  gameATestLaunchDefinitions,
  resolveGameATestLaunchDefinition
} from "./gameATestEntries";

const openingRuntimeEntry = gameAOpeningLaunchDefinition.runtimeEntry;
const smokeRuntimeEntry = gameATestLaunchDefinitions.smoke.runtimeEntry;
const characterRuntimeEntry = gameATestLaunchDefinitions.character.runtimeEntry;

describe("game-a nani scripts", () => {
  it("exposes the opening .nani source as the app runtime entry", () => {
    expect(gameAOpeningNaniSource.trim().length).toBeGreaterThan(0);
    expect(gameAOpeningNaniSource).toContain("#Start");
    expect(gameAOpeningNaniSource).toContain("@char alice pos:50 scale:0.78,0.78,1 time:0.3 wait!");
    expect(gameAOpeningNaniSource).toContain("@sfx sfx:gentle-rain-loop group:rain loop:true volume:0.1");
    expect(gameAOpeningNaniSource).toContain("@stopSfx group:rain fade:0.8");
    expect(gameAOpeningNaniSource).not.toContain("CHECKPOINT");
    expect(gameAOpeningNaniSource).not.toContain("TODO");
    expect(gameAOpeningNaniSource).not.toMatch(/\$\{[^}]+\}/u);

    expect(openingRuntimeEntry.scriptPath).toBe(gameAVnEntry.scriptPath);
    expect(openingRuntimeEntry.startLabel).toBe(gameAVnEntry.startLabel);
    expect(openingRuntimeEntry.sourceText).toBe(gameAOpeningNaniSource);
  });

  it("parses and compiles the opening .nani script without error diagnostics", () => {
    const parsed = parseScenario({
      scriptPath: openingRuntimeEntry.scriptPath,
      sourceText: gameAOpeningNaniSource
    });
    const compiled = compileRuntimeScript(parsed.scenario);

    expect(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(compiled.script.labels).toHaveProperty("Start");
    expect(parsed.scenario.assets).toContainEqual({ id: "alice", kind: "character-pack" });
    expect(compiled.script.commands).toContainEqual(
      expect.objectContaining({
        commandId: "char",
        params: expect.objectContaining({
          target: "alice",
          appearanceExpression: "",
          pos: [50, 0],
          scale: [0.78, 0.78, 1],
          durationMs: 300,
          wait: true
        })
      })
    );
    const alicePreload = gameAOpeningLaunchDefinition.characterPreloadPlan.find(
      (entry) => entry.characterId === "alice"
    );
    const preparedExpressions = new Set(alicePreload?.appearanceExpressions);
    const requestedExpressions = compiled.script.commands
      .filter((command) => command.commandId === "char" && stringParam(command, "target") === "alice")
      .flatMap((command) => {
        const expression = stringParam(command, "appearanceExpression");
        return expression === undefined ? [] : [expression];
      });

    expect(alicePreload).toBeDefined();
    expect(requestedExpressions.every((expression) => preparedExpressions.has(expression))).toBe(true);
  });

  it("keeps product and test-only Nani in independent launch definitions", () => {
    for (const runtimeEntry of [smokeRuntimeEntry, characterRuntimeEntry]) {
      const parsed = parseScenario({
        scriptPath: runtimeEntry.scriptPath,
        sourceText: runtimeEntry.sourceText
      });
      const compiled = compileRuntimeScript(parsed.scenario);
      expect(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
      expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
      expect(runtimeEntry.scriptPath).toMatch(/^game-a\/test\//u);
      expect(runtimeEntry.sourceText).toContain("CHECKPOINT");
    }

    expect(smokeRuntimeEntry.sourceText).toContain("CHECKPOINT SMOKE MOVIE");
    expect(characterRuntimeEntry.sourceText).toContain("CHECKPOINT CHARACTER 04");
    expect(gameATestLaunchDefinitions.smoke.characterPreloadPlan).toEqual([
      { characterId: "alice", appearanceExpressions: [""] }
    ]);
    expect(gameATestLaunchDefinitions.character.characterPreloadPlan).toEqual([
      {
        characterId: "alice",
        appearanceExpressions: [
          "",
          "EYE0,MOUTH0",
          "EYE1,MOUTH3,ArmL2",
          "EYE2,MOUTH2,ArmL0,ArmR0,EFFECT2",
          "EYE4,MOUTH5,ArmL4,ArmR2,EFFECT0"
        ]
      }
    ]);
    expect(gameAOpeningNaniSource).not.toContain("CHECKPOINT SMOKE");
    expect(gameAOpeningNaniSource).not.toContain("CHECKPOINT CHARACTER");
  });

  it("resolves only explicit test entry ids", () => {
    expect(resolveGameATestLaunchDefinition("smoke")).toBe(gameATestLaunchDefinitions.smoke);
    expect(resolveGameATestLaunchDefinition("character")).toBe(gameATestLaunchDefinitions.character);
    expect(resolveGameATestLaunchDefinition("opening")).toBeUndefined();
    expect(resolveGameATestLaunchDefinition(null)).toBeUndefined();
  });

  it("keeps active script asset references declared on the VN entry", () => {
    const parsed = parseScenario({
      scriptPath: openingRuntimeEntry.scriptPath,
      sourceText: gameAOpeningNaniSource
    });
    const compiled = compileRuntimeScript(parsed.scenario);
    const entryRefs = new Set(gameAVnEntry.assetRefs.map((ref) => `${ref.kind}:${ref.id}`));

    expect(collectRuntimeCommandAssetRefs(compiled.script.commands)).toEqual(
      expect.arrayContaining([
        { id: "alice", kind: "character-pack" },
        { id: "bg:home-outside", kind: "background" },
        { id: "bgm:dead-fish-riffle", kind: "bgm" },
        { id: "sfx:gentle-rain-loop", kind: "sfx" },
        { id: "sfx:glug-glug-glug", kind: "sfx" },
        { id: "sfx:noise-6hz", kind: "sfx" }
      ])
    );
    expect(
      collectRuntimeCommandAssetRefs(compiled.script.commands).filter((ref) => !entryRefs.has(`${ref.kind}:${ref.id}`))
    ).toEqual([]);
  });
});

function collectRuntimeCommandAssetRefs(commands: RuntimeCommand[]): Array<Pick<AssetRef, "id" | "kind">> {
  const refs = new Map<string, Pick<AssetRef, "id" | "kind">>();

  for (const command of commands) {
    const add = (id: string | undefined, kind: AssetRef["kind"]) => {
      if (!id) return;
      refs.set(`${kind}:${id}`, { id, kind });
    };

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
