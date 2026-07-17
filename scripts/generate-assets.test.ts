import { describe, expect, it } from "vitest";
import type { RuntimeCommand, RuntimeScript, RuntimeValue } from "@v-ronpa/contracts";
import { createScriptRevision, deriveLayeredCharacterPreloadPlan } from "./generate-assets.mjs";

describe("generated script revisions", () => {
  it("ignores source locations but changes for semantic command content", () => {
    const base = runtimeScript("Hello", 1);
    expect(createScriptRevision(base)).toBe(createScriptRevision(runtimeScript("Hello", 99)));
    expect(createScriptRevision(base)).not.toBe(createScriptRevision(runtimeScript("Changed", 1)));
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
