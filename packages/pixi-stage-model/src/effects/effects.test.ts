import { describe, expect, it } from "vitest";
import type { RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";
import { createInitialPixiStageSnapshot, reducePixiRuntimeCommand } from "../index";

describe("Pixi effect reducers", () => {
  it("normalizes rain, preserves every snow parameter, and keeps sun independent", () => {
    let reduction = reducePixiRuntimeCommand(initial(), command("rain", { power: 4, wind: -3, hue: -30, tint: 9 }));
    expect(reduction.snapshot.weather.rain?.commandParams).toEqual({ power: 1, wind: -1, hue: 330, tint: 2 });
    expect(reduction.diagnostics).toHaveLength(4);

    reduction = reducePixiRuntimeCommand(reduction.snapshot, command("snow", {
      power: 0.9, xSpeed: -0.35, ySpeed: 0.72, density: 1.45, flakeScale: 1.2,
      sway: 0.85, fog: 0.32, noise: 0.04, seed: 17, pos: [20, 30],
      position: [1, 2, 3], rotation: [4, 5, 6], scale: [1.2, 1.2, 1]
    }));
    expect(reduction.snapshot.weather.snow).toMatchObject({
      power: 0.9, xSpeed: -0.35, ySpeed: 0.72, density: 1.45, flakeScale: 1.2,
      sway: 0.85, fog: 0.32, noise: 0.04, seed: 17, pos: [0.2, 0.3]
    });

    reduction = reducePixiRuntimeCommand(reduction.snapshot, command("sun", { power: 0.4, scale: [1.1, 1.1, 1] }));
    const noSnow = reducePixiRuntimeCommand(reduction.snapshot, command("snow", { power: 0 }));
    expect(noSnow.snapshot.weather).toHaveProperty("rain");
    expect(noSnow.snapshot.weather).toHaveProperty("sun");
    expect(noSnow.snapshot.weather).not.toHaveProperty("snow");
  });

  it("emits timed persistent removal hints and wait descriptors without coupling filters", () => {
    let snapshot = reducePixiRuntimeCommand(initial(), command("bokeh", { focus: "Ema", power: 0.6 })).snapshot;
    snapshot = reducePixiRuntimeCommand(snapshot, command("glitchfilter", { power: 0.4, seed: 7 })).snapshot;
    const removed = reducePixiRuntimeCommand(snapshot, command("bokeh", { power: 0, durationMs: 200, wait: true }));

    expect(removed.snapshot.screenFilters.glitch).toMatchObject({ power: 0.4, seed: 7 });
    expect(removed.hints).toEqual([{ type: "screen-filter-remove", kind: "bokeh", durationMs: 200, wait: true }]);
    expect(removed.waitTasks).toEqual([{ kind: "screen-filter-transition", target: "bokeh", revision: removed.snapshot.revision }]);
  });

  it("keeps transient flash, shake, and glitch out of the terminal snapshot", () => {
    const initialSnapshot = initial();
    for (const [id, params, type] of [
      ["flash", { color: "#ff00ff", durationMs: 120, wait: true }, "flash"],
      ["shake", { actorId: "Ema", power: 0.4, durationMs: 80, count: 4, hor: true, ver: true }, "shake"],
      ["glitch", { power: 0.8, durationMs: 500, seed: 9 }, "glitch"]
    ] as const) {
      const reduction = reducePixiRuntimeCommand(initialSnapshot, command(id, params));
      expect(reduction.snapshot).toBe(initialSnapshot);
      expect(reduction.hints).toEqual([expect.objectContaining({ type })]);
    }
  });

  it("rejects looping shake and invalid character tone without mutating state", () => {
    for (const [id, params] of [
      ["shake", { loop: true }],
      ["chartone", { preset: "unknown", amount: 1 }]
    ] as const) {
      const snapshot = initial();
      const reduction = reducePixiRuntimeCommand(snapshot, command(id, params));
      expect(reduction.snapshot).toBe(snapshot);
      expect(reduction.diagnostics).toEqual([expect.objectContaining({ code: "unsupported-pixi-params" })]);
    }
  });

  it("updates actor blur independently and treats repeated off as a stable no-op", () => {
    let snapshot = reducePixiRuntimeCommand(initial(), command("back", { appearance: "bg/showcase" }, "scene")).snapshot;
    snapshot = reducePixiRuntimeCommand(snapshot, command("char", { target: "Ema", appearanceExpression: "Pensive1" }, "actor")).snapshot;
    snapshot = reducePixiRuntimeCommand(snapshot, command("blur", { target: "*", power: 0.5 })).snapshot;
    expect(snapshot.backgroundsById.MainBackground?.filters.blur).toBe(0.5);
    expect(snapshot.charactersById.Ema?.filters.blur).toBe(0.5);

    const removed = reducePixiRuntimeCommand(snapshot, command("blur", { target: "Ema", power: 0 }));
    expect(removed.snapshot.backgroundsById.MainBackground?.filters.blur).toBe(0.5);
    expect(removed.snapshot.charactersById.Ema?.filters).not.toHaveProperty("blur");
  });
});

function initial() {
  return createInitialPixiStageSnapshot();
}

function command(
  commandId: string,
  params: Record<string, RuntimeValue>,
  category: RuntimeCommand["category"] = "effect"
): RuntimeCommand {
  return {
    commandId,
    canonicalName: commandId,
    category,
    source: "v-ronpa",
    status: "implemented",
    params,
    loc: { scriptPath: "effects-test.nani", line: 1, column: 1, raw: `@${commandId}` }
  };
}
