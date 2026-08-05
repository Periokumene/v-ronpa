import { describe, expect, it } from "vitest";
import {
  naniCommandCatalog,
  type NaniCommandCategory,
  type RuntimeCommand,
  type RuntimeValue
} from "@v-ronpa/contracts";
import { createInitialPixiStageSnapshot, reducePixiRuntimeCommand } from "./index";

describe("pixi stage command registry", () => {
  it("resolves every implemented Pixi presentation contract command", () => {
    const pixiCommands = naniCommandCatalog.filter(
      (definition) => definition.status === "implemented" && definition.execution === "pixi-presentation"
    );

    expect(pixiCommands.map((definition) => definition.id)).not.toContain("focus");
    for (const definition of pixiCommands) {
      const reduction = reducePixiRuntimeCommand(
        createInitialPixiStageSnapshot(),
        runtimeCommand(definition.id, definition.category, {})
      );
      expect(reduction.diagnostics, definition.id).not.toContainEqual(
        expect.objectContaining({ code: "unsupported-pixi-command" })
      );
    }
  });

  it("rejects removed and manually injected commands through the uniform unsupported diagnostic", () => {
    for (const commandId of ["focus", "custompulse"]) {
      const initial = createInitialPixiStageSnapshot();
      expect(reducePixiRuntimeCommand(initial, runtimeCommand(commandId, "effect", { power: 0.5 }))).toMatchObject({
        snapshot: initial,
        hints: [],
        waitTasks: [],
        diagnostics: [{
          code: "unsupported-pixi-command",
          commandId
        }]
      });
    }
  });

  it("keeps rain and snow independent when one weather effect is removed", () => {
    let snapshot = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("rain", "effect", { power: 0.7 })
    ).snapshot;
    snapshot = reducePixiRuntimeCommand(
      snapshot,
      runtimeCommand("snow", "effect", { power: 0.9, seed: 17 })
    ).snapshot;

    const removed = reducePixiRuntimeCommand(snapshot, runtimeCommand("snow", "effect", { power: 0 }));
    expect(removed.snapshot.weather.rain).toMatchObject({ kind: "rain", commandParams: { power: 0.7 } });
    expect(removed.snapshot.weather).not.toHaveProperty("snow");
  });

  it("keeps persistent filters independent when bokeh is removed", () => {
    let snapshot = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("bokeh", "effect", { focus: "MainBackground", power: 0.7 })
    ).snapshot;
    snapshot = reducePixiRuntimeCommand(
      snapshot,
      runtimeCommand("glitchfilter", "effect", { power: 0.4 })
    ).snapshot;

    const removed = reducePixiRuntimeCommand(snapshot, runtimeCommand("bokeh", "effect", { power: 0 }));
    expect(removed.snapshot.screenFilters).not.toHaveProperty("bokeh");
    expect(removed.snapshot.screenFilters.glitch).toMatchObject({ power: 0.4 });
  });
});

function runtimeCommand(
  commandId: string,
  category: NaniCommandCategory,
  params: Record<string, RuntimeValue>
): RuntimeCommand {
  return {
    commandId,
    canonicalName: commandId,
    category,
    source: "v-ronpa",
    status: "implemented",
    params,
    loc: { scriptPath: "pixi-stage-model-test.nani", line: 1, column: 1, raw: `@${commandId}` }
  };
}
