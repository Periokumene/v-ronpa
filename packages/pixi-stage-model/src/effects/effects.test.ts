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

  it("keeps every independent transient out of terminal snapshots and emits typed waits", () => {
    const snapshot = initial();
    for (const [id, type] of [
      ["impact", "impact"], ["afterimage", "afterimage"],
      ["shutter", "shutter"], ["flicker", "flicker"]
    ] as const) {
      const reduction = reducePixiRuntimeCommand(snapshot, command(id, { durationMs: 200, wait: true }));
      expect(reduction.snapshot).toBe(snapshot);
      expect(reduction.hints).toEqual([expect.objectContaining({ type, durationMs: 200 })]);
      expect(reduction.waitTasks).toEqual([expect.objectContaining({ kind: type })]);
    }
    expect(reducePixiRuntimeCommand(snapshot, command("impact", { durationMs: 200 })).hints[0]).toMatchObject({
      origin: [0.5, 0.5]
    });
  });

  it("rejects malformed hand-injected effect IR without mutating the stage", () => {
    const snapshot = initial();
    const invalidCases: Array<[string, Record<string, RuntimeValue>]> = [
      ["impact", { durationMs: 200, direction: Number.NaN }],
      ["afterimage", { durationMs: 200, offset: [1] }],
      ["pulse", { power: 0.5, rate: 0 }],
      ["flicker", { durationMs: 200, bursts: 1.5 }]
    ];
    for (const [id, params] of invalidCases) {
      const reduction = reducePixiRuntimeCommand(snapshot, command(id, params));
      expect(reduction.snapshot).toBe(snapshot);
      expect(reduction.hints).toEqual([]);
      expect(reduction.diagnostics).toEqual([expect.objectContaining({ code: "unsupported-pixi-params" })]);
    }
  });

  it("stores and removes persistent effects independently", () => {
    let snapshot = initial();
    snapshot = reducePixiRuntimeCommand(snapshot, command("vignette", { power: 0.5 })).snapshot;
    snapshot = reducePixiRuntimeCommand(snapshot, command("staticfilter", { power: 0.6, palette: "cold" })).snapshot;
    snapshot = reducePixiRuntimeCommand(snapshot, command("waterveil", { power: 0.5 })).snapshot;
    snapshot = reducePixiRuntimeCommand(snapshot, command("pulse", { power: 0.6, origin: [50, 52] })).snapshot;
    expect(Object.keys(snapshot.screenFilters)).toEqual(["vignette", "staticFilter", "waterVeil", "pulse"]);

    const removed = reducePixiRuntimeCommand(snapshot, command("staticfilter", { power: 0, durationMs: 300, wait: true }));
    expect(removed.snapshot.screenFilters).not.toHaveProperty("staticFilter");
    expect(removed.snapshot.screenFilters).toHaveProperty("pulse");
    expect(removed.hints).toEqual([{ type: "screen-filter-remove", kind: "staticFilter", durationMs: 300, wait: true }]);
  });

  it("treats identical persistent terminal states and repeated removal as strict no-ops", () => {
    for (const [id, params] of [
      ["vignette", { power: 0.5, radius: 0.62 }],
      ["staticfilter", { power: 0.6, seed: 1.25 }],
      ["waterveil", { power: 0.5, seed: 2.5 }],
      ["pulse", { power: 0.6, origin: [50, 52] }]
    ] satisfies Array<[string, Record<string, RuntimeValue>]>) {
      const applied = reducePixiRuntimeCommand(initial(), command(id, params));
      const repeated = reducePixiRuntimeCommand(applied.snapshot, command(id, { ...params, durationMs: 300, wait: true }));
      expect(repeated.snapshot).toBe(applied.snapshot);
      expect(repeated.hints).toEqual([]);
      expect(repeated.waitTasks).toEqual([]);
      const removed = reducePixiRuntimeCommand(applied.snapshot, command(id, { power: 0 }));
      const repeatedRemoval = reducePixiRuntimeCommand(removed.snapshot, command(id, { power: 0, durationMs: 300, wait: true }));
      expect(repeatedRemoval.snapshot).toBe(removed.snapshot);
      expect(repeatedRemoval.hints).toEqual([]);
      expect(repeatedRemoval.waitTasks).toEqual([]);
    }
  });

  it.each([["stain", "burst"].join(""), ["wall", "seep"].join("")])("hard-rejects hand-injected removed %s commands", (commandId) => {
    const snapshot = initial();
    const reduction = reducePixiRuntimeCommand(snapshot, command(commandId, { power: 0.5, durationMs: 200, wait: true }));

    expect(reduction.snapshot).toBe(snapshot);
    expect(reduction.hints).toEqual([]);
    expect(reduction.waitTasks).toEqual([]);
    expect(reduction.diagnostics).toEqual([expect.objectContaining({
      code: "unsupported-pixi-command",
      commandId
    })]);
  });

  it("applies signalMask to the complete active character and removes it through the actor transition", () => {
    let snapshot = reducePixiRuntimeCommand(initial(), command("char", { target: "alice", appearanceExpression: "eye1" }, "actor")).snapshot;
    const applied = reducePixiRuntimeCommand(snapshot, command("signalmask", { target: "alice", power: 0.7, seed: 1.25, durationMs: 350, wait: true }));
    expect(applied.snapshot.charactersById.alice?.filters.signalMask).toMatchObject({ power: 0.7, seed: 1.25 });
    expect(applied.snapshot.charactersById.alice?.filters.signalMask).not.toHaveProperty("transition");
    expect(applied.waitTasks).toEqual([{ kind: "actor-transition", target: "alice", revision: applied.snapshot.revision }]);
    snapshot = applied.snapshot;
    const removed = reducePixiRuntimeCommand(snapshot, command("signalmask", { target: "alice", power: 0, durationMs: 200, wait: true }));
    expect(removed.snapshot.charactersById.alice?.filters).not.toHaveProperty("signalMask");
    const missing = reducePixiRuntimeCommand(snapshot, command("signalmask", { target: "ghost", power: 0.5 }));
    expect(missing.snapshot).toBe(snapshot);
    expect(missing.diagnostics).toEqual([expect.objectContaining({ code: "unsupported-pixi-params" })]);
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
