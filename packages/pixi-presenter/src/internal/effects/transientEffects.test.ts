import { Container, type Filter } from "pixi.js";
import { describe, expect, it } from "vitest";
import { PresentationTaskController } from "../presentationTasks";
import { TweenSystem } from "./animation";
import { RootFilterStack } from "./rootFilterStack";
import { TransientEffectSystem } from "./transient/system";
import type { TransientActorTargetResolver } from "./transient/types";

describe("TransientEffectSystem", () => {
  it("runs actor-targeted shake and restores its origin on completion", () => {
    const target = new Container();
    target.x = 40;
    target.y = 25;
    const suite = createTransientSuite((id) => id === "Ema" ? target : undefined);

    suite.effects.run([{
      type: "shake",
      target: "Ema",
      intensity: 0.5,
      durationMs: 20,
      count: 2,
      hor: true,
      ver: false,
      wait: true
    }], 4);
    expect(suite.tasks.snapshot()).toEqual([
      expect.objectContaining({ kind: "shake", target: "Ema", revision: 4, status: "running" })
    ]);

    for (let index = 0; index < 12; index += 1) suite.tweens.tick({ deltaMS: 20 } as never);
    expect(target.x).toBe(40);
    expect(target.y).toBe(25);
    expect(suite.tasks.snapshot()).toEqual([]);
  });

  it("isolates transient clear from persistent root filters and cancels only owned tasks", () => {
    const suite = createTransientSuite(() => undefined);
    const persistent = { destroy() {} };
    suite.rootFilters.setScreenFilters([persistent as never]);
    suite.effects.run([
      { type: "flash", color: "#ffffff", durationMs: 100, wait: true },
      { type: "glitch", power: 0.8, durationMs: 100, wait: true }
    ], 5);

    expect(suite.tasks.snapshot()).toHaveLength(2);
    suite.effects.clear();
    expect(suite.tasks.snapshot()).toEqual([]);
    expect(suite.root.filters).toEqual([persistent]);
    expect(() => suite.effects.clear()).not.toThrow();
    suite.effects.destroy();
  });

  it("settles a replaced shake before capturing the replacement origin", () => {
    const target = new Container();
    target.x = 40;
    target.y = 25;
    const suite = createTransientSuite((id) => id === "Ema" ? target : undefined);
    const shake = {
      type: "shake" as const,
      target: "Ema",
      intensity: 0.5,
      durationMs: 80,
      count: 2,
      hor: true,
      ver: true,
      wait: true
    };

    suite.effects.run([shake], 1);
    suite.tweens.tick({ deltaMS: 30 } as never);
    expect([target.x, target.y]).not.toEqual([40, 25]);

    suite.effects.run([shake], 2);
    expect(suite.tasks.snapshot()).toEqual([
      expect.objectContaining({ kind: "shake", target: "Ema", revision: 2 })
    ]);
    for (let index = 0; index < 12; index += 1) suite.tweens.tick({ deltaMS: 40 } as never);

    expect(target.x).toBe(40);
    expect(target.y).toBe(25);
    expect(suite.tasks.snapshot()).toEqual([]);
  });

  it("keeps shakes for different targets independent", () => {
    const ema = new Container();
    const felix = new Container();
    ema.position.set(10, 20);
    felix.position.set(70, 90);
    const suite = createTransientSuite((id) => id === "Ema" ? ema : id === "Felix" ? felix : undefined);

    suite.effects.run([
      { type: "shake", target: "Ema", intensity: 0.4, durationMs: 30, count: 2, hor: true, ver: false, wait: true },
      { type: "shake", target: "Felix", intensity: 0.6, durationMs: 30, count: 2, hor: false, ver: true, wait: true }
    ], 3);
    expect(suite.tasks.snapshot()).toHaveLength(2);

    for (let index = 0; index < 12; index += 1) suite.tweens.tick({ deltaMS: 30 } as never);
    expect([ema.x, ema.y]).toEqual([10, 20]);
    expect([felix.x, felix.y]).toEqual([70, 90]);
    expect(suite.tasks.snapshot()).toEqual([]);
  });

  it("runs and cleans every remaining effect-lab transient with distinct shader programs", () => {
    const suite = createTransientSuite(() => undefined);
    suite.effects.run([
      { type: "impact", power: 1, origin: [0.5, 0.5], direction: 0, smear: 0.6, chroma: 0.25, durationMs: 60, wait: true },
      { type: "afterimage", target: "stage", power: 0.7, count: 4, offset: [-0.015, 0], decay: 0.7, tint: "#9fc2c7", edge: 0.55, durationMs: 60, wait: true },
      { type: "shutter", power: 1, shape: "eyelid", color: "#020304", hold: 0.08, skew: 0.18, durationMs: 60, wait: true },
      { type: "flicker", power: 1, bursts: 4, irregularity: 0.65, invert: 0.75, white: 0.7, tear: 0.65, chroma: 0.35, seed: 1, durationMs: 60, wait: true }
    ], 9);
    expect(suite.tasks.snapshot().map((task) => task.kind)).toEqual(["impact", "afterimage", "shutter", "flicker"]);
    const filters = suite.root.filters as unknown as Array<{ resources: { effectLabUniforms: { uniforms: { uMode: number } } } }>;
    expect(filters.map((filter) => filter.resources.effectLabUniforms.uniforms.uMode)).toEqual([4, 5, 6, 7]);
    for (let index = 0; index < 8; index += 1) suite.tweens.tick({ deltaMS: 20 } as never);
    expect(suite.tasks.snapshot()).toEqual([]);
    expect(suite.root.filters).toBeNull();
  });

  it("replaces a same-family lab transient while preserving different families", () => {
    const suite = createTransientSuite(() => undefined);
    const impact = {
      type: "impact" as const, power: 0.8, origin: [0.5, 0.5] as [number, number],
      direction: 0, smear: 0.6, chroma: 0.25, durationMs: 600, wait: true
    };
    suite.effects.run([impact, {
      type: "flicker", power: 0.7, bursts: 4, irregularity: 0.6, invert: 0.7,
      white: 0.6, tear: 0.6, chroma: 0.3, seed: 1, durationMs: 600, wait: true
    }], 1);
    suite.effects.run([{ ...impact, direction: 20 }], 2);

    expect(suite.tasks.snapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "flicker", revision: 1 }),
      expect.objectContaining({ kind: "impact", revision: 2 })
    ]));
    expect(suite.tasks.snapshot().filter((task) => task.kind === "impact")).toHaveLength(1);
    const modes = (suite.root.filters as unknown as Array<{
      resources: { effectLabUniforms: { uniforms: { uMode: number } } };
    }>).map((filter) => filter.resources.effectLabUniforms.uniforms.uMode);
    expect(modes).toEqual([7, 4]);
    suite.effects.destroy();
  });

  it("keeps actor afterimage local and expands its padding", () => {
    const actor = new Container();
    const suite = createTransientSuite((id) => id === "alice" ? actor : undefined);
    suite.effects.run([{
      type: "afterimage", target: "alice", power: 1, count: 6, offset: [-0.024, 0.005],
      decay: 0.78, tint: "#b7dce0", edge: 0.85, durationMs: 800, wait: true
    }], 4);

    expect(suite.root.filters).toBeUndefined();
    expect(actor.filters).toHaveLength(1);
    expect((actor.filters?.[0] as Filter).padding).toBeGreaterThan(32);
    suite.effects.destroy();
    expect(actor.filters).toBeNull();
  });
});

function createTransientSuite(resolve: (id: string) => Container | undefined) {
  const root = new Container();
  const options = { root, width: () => 960, height: () => 540 };
  const tweens = new TweenSystem();
  const tasks = new PresentationTaskController();
  const rootFilters = new RootFilterStack(options);
  const actors: TransientActorTargetResolver = { getLayerForEffects: resolve };
  const effects = new TransientEffectSystem(options, actors, rootFilters, tweens, tasks);
  return { effects, root, rootFilters, tasks, tweens };
}
