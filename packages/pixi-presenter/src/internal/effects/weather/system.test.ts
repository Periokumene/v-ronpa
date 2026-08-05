import type { PixiStageSnapshot, PixiWeatherSnapshot } from "@v-ronpa/contracts";
import { createInitialPixiStageSnapshot } from "@v-ronpa/pixi-stage-model";
import { Container, type Ticker } from "pixi.js";
import { describe, expect, it } from "vitest";
import { PresentationTaskController } from "../../presentationTasks";
import { TweenSystem } from "../animation";
import { WeatherSystem } from "./system";

describe("WeatherSystem family", () => {
  it("restores rain and snow immediately with no tween or task", () => {
    const suite = createSuite();
    suite.weather.reconcile(stage({ rain: rain(), snow: snow() }, 7), false);

    expect(find(suite.root, "rain")?.alpha).toBeCloseTo(0.7);
    expect(find(suite.root, "snow")?.alpha).toBeCloseTo(0.9);
    expect(suite.tasks.snapshot()).toEqual([]);
  });

  it("removes snow without touching rain and tolerates repeated clear/destroy", () => {
    const suite = createSuite();
    suite.weather.reconcile(stage({ rain: rain(), snow: snow() }, 1), false);
    suite.weather.reconcile(
      stage({ rain: rain() }, 2),
      true,
      [{ type: "weather-remove", kind: "snow", durationMs: 100, easing: "linear", wait: true }]
    );
    suite.tweens.tick({ deltaMS: 120 } as Ticker);

    expect(find(suite.root, "rain")).toBeDefined();
    expect(find(suite.root, "snow")).toBeUndefined();
    expect(suite.tasks.snapshot()).toEqual([]);
    expect(() => {
      suite.weather.clear();
      suite.weather.clear();
      suite.weather.destroy();
    }).not.toThrow();
  });
});

function createSuite() {
  const root = new Container();
  const tweens = new TweenSystem();
  const tasks = new PresentationTaskController();
  return {
    root,
    tweens,
    tasks,
    weather: new WeatherSystem({ root, width: () => 960, height: () => 540 }, tweens, tasks)
  };
}

function stage(weather: PixiStageSnapshot["weather"], revision: number): PixiStageSnapshot {
  return { ...createInitialPixiStageSnapshot(), revision, weather };
}

function rain(): Extract<PixiWeatherSnapshot, { kind: "rain" }> {
  return {
    kind: "rain",
    commandParams: { power: 0.7, wind: -0.5, hue: 215, tint: 0.55 },
    transition: { durationMs: 0, easing: "linear", lazy: false, wait: false }
  };
}

function snow(): Extract<PixiWeatherSnapshot, { kind: "snow" }> {
  return {
    kind: "snow",
    power: 0.9,
    density: 1.2,
    seed: 23,
    transition: { durationMs: 0, easing: "linear", lazy: false, wait: false }
  };
}

function find(root: Container, kind: string): Container | undefined {
  for (const layer of root.children) {
    if (!(layer instanceof Container)) continue;
    const match = layer.children.find((child) => child instanceof Container && child.label === `weather:${kind}`);
    if (match instanceof Container) return match;
  }
  return undefined;
}
