import { Container } from "pixi.js";
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
