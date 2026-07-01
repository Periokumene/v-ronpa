import { describe, expect, it } from "vitest";
import { compileRuntimeScript } from "../../../packages/nani-runtime-compiler/src/index";
import { parseScenario } from "../../../packages/nani-parser/src/index";
import { gameAVnEntry } from "./contentManifest";
import { gameAOpeningNaniSource, gameAOpeningRuntimeEntry } from "./gameAScripts";

describe("game-a nani scripts", () => {
  it("exposes the opening .nani source as the app runtime entry", () => {
    expect(gameAOpeningNaniSource.trim().length).toBeGreaterThan(0);
    expect(gameAOpeningNaniSource).toContain("#Start");
    expect(gameAOpeningNaniSource).not.toMatch(/\$\{[^}]+\}/u);

    expect(gameAOpeningRuntimeEntry.scriptPath).toBe(gameAVnEntry.scriptPath);
    expect(gameAOpeningRuntimeEntry.startLabel).toBe(gameAVnEntry.startLabel);
    expect(gameAOpeningRuntimeEntry.sourceText).toBe(gameAOpeningNaniSource);
  });

  it("parses and compiles the opening .nani script without error diagnostics", () => {
    const parsed = parseScenario({
      scriptPath: gameAOpeningRuntimeEntry.scriptPath,
      sourceText: gameAOpeningNaniSource
    });
    const compiled = compileRuntimeScript(parsed.scenario);

    expect(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(compiled.script.labels).toHaveProperty("Start");
  });
});
