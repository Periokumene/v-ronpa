import { describe, expect, it } from "vitest";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "./index";

describe("nani runtime compiler", () => {
  it("compiles text statements into print runtime commands", () => {
    const { scenario } = parseScenario({ sourceText: "Felix: Hello.[>]", scriptPath: "text.nani" });
    const result = compileRuntimeScript(scenario);

    expect(result.diagnostics).toEqual([]);
    expect(result.script.commands).toEqual([
      expect.objectContaining({
        commandId: "print",
        canonicalName: "print",
        category: "text",
        source: "v-ronpa",
        status: "implemented",
        params: { text: "Hello.", speaker: "Felix", autoNext: true }
      })
    ]);
  });

  it("normalizes presentation command params without producing downstream command shapes", () => {
    const { scenario } = parseScenario({
      sourceText: ["@back bg:harness effect:fade", "@flash color:#fff duration:120"].join("\n"),
      scriptPath: "presentation.nani"
    });
    const result = compileRuntimeScript(scenario);

    expect(result.diagnostics).toEqual([]);
    expect(result.script.commands).toEqual([
      expect.objectContaining({
        commandId: "back",
        params: expect.objectContaining({ appearance: "bg:harness", effect: "fade" })
      }),
      expect.objectContaining({
        commandId: "flash",
        params: expect.objectContaining({ color: "#fff", duration: 120 })
      })
    ]);
    expect(result.script.commands[0]?.params).not.toHaveProperty("backgroundId");
    expect(result.script.commands[1]?.params).not.toHaveProperty("durationMs");
  });

  it("normalizes aliases, defaults, flags, and labels", () => {
    const { scenario } = parseScenario({
      sourceText: ["#Start", "@char-enter character:felix portrait:p:felix", "@shake actorId:stage wait!"].join("\n"),
      scriptPath: "aliases.nani"
    });
    const result = compileRuntimeScript(scenario);

    expect(result.script.labels).toEqual({ Start: 0 });
    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "charenter",
        params: expect.objectContaining({
          characterId: "character:felix",
          portraitId: "p:felix",
          slot: "center",
          effect: "fadeIn"
        })
      })
    );
    expect(result.script.commands[1]).toEqual(
      expect.objectContaining({
        commandId: "shake",
        params: expect.objectContaining({ target: "stage", intensity: 0.35, duration: 280 })
      })
    );
    expect(result.script.commands[1]?.params).not.toHaveProperty("actorId");
    expect(result.script.commands[1]?.params).not.toHaveProperty("wait");
  });

  it("preserves expression params in canonical fields without default fallback", () => {
    const { scenario } = parseScenario({
      sourceText: [
        "@flash color:#fff duration:{flashDuration}",
        "@shake actorId:hero intensity:{shakePower} duration:{shakeDuration}",
        "@gameplay grant-item item:key quantity:{itemCount}"
      ].join("\n"),
      scriptPath: "expressions.nani"
    });
    const result = compileRuntimeScript(scenario);

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.script.commands[0]?.params).toEqual({
      color: "#fff",
      duration: { type: "expression", source: "flashDuration" }
    });
    expect(result.script.commands[1]?.params).toEqual({
      target: "hero",
      intensity: { type: "expression", source: "shakePower" },
      duration: { type: "expression", source: "shakeDuration" }
    });
    expect(result.script.commands[2]?.params).toEqual({
      type: "grant-item",
      quantity: { type: "expression", source: "itemCount" },
      itemId: "key",
      affinityDelta: 0
    });
    expect(result.script.commands[2]?.params).not.toHaveProperty("item");
    expect(result.script.commands[2]?.sourceCommand?.rawParams).toMatchObject({
      item: "key",
      quantity: { expression: "itemCount" }
    });
  });

  it("compiles command conditions and unless expressions onto runtime commands", () => {
    const { scenario } = parseScenario({
      sourceText: ["@choice \"Open\" goto:#Open if:{affinity>=3}", "@flash duration:120 unless:{flashDisabled}"].join("\n"),
      scriptPath: "conditions.nani"
    });
    const result = compileRuntimeScript(scenario);

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.script.commands[0]).toEqual(
      expect.objectContaining({
        commandId: "choice",
        condition: { type: "expression", source: "affinity>=3" }
      })
    );
    expect(result.script.commands[1]).toEqual(
      expect.objectContaining({
        commandId: "flash",
        unless: { type: "expression", source: "flashDisabled" }
      })
    );
  });

  it("skips error commands while preserving warning-level compiled commands", () => {
    const { scenario } = parseScenario({
      sourceText: ["@back bg:harness time:fast", "@back bg:valid time:0.5"].join("\n"),
      scriptPath: "diagnostics.nani"
    });
    const result = compileRuntimeScript(scenario);

    expect(result.script.commands.map((command) => command.commandId)).toEqual(["back"]);
    expect(result.diagnostics).toEqual([
      {
        code: "invalid-command-param",
        message: "@back parameter time expected decimal.",
        severity: "error"
      },
      {
        code: "unsupported-command-param",
        message: "@back accepts time:decimal, but the current runtime compiler does not consume it yet.",
        severity: "warning"
      }
    ]);
  });

  it("reports unknown commands as errors because skipped commands must be error-level", () => {
    const { scenario } = parseScenario({
      sourceText: "@notInCatalog value",
      scriptPath: "unknown.nani"
    });
    const result = compileRuntimeScript(scenario);

    expect(result.script.commands).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: "unknown-command",
        message: "Unknown .nani command: @notincatalog.",
        severity: "error"
      }
    ]);
  });

});
