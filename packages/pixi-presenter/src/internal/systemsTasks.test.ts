import { describe, expect, it } from "vitest";
import { Container, type Ticker } from "pixi.js";
import type { PixiActorSnapshot, PixiStageSnapshot, PixiWeatherSnapshot } from "@v-ronpa/contracts";
import { createInitialPixiStageSnapshot } from "../stageSnapshot";
import { ActorSystem, FilterSystem, TransientEffectSystem, TweenSystem, WeatherSystem } from "./systems";
import { PresentationTaskController } from "./presentationTasks";

describe("pixi presentation task system integration", () => {
  it("creates and completes an actor transition task", () => {
    const { actors, tasks, tweens } = createSystems();
    actors.reconcile(stageWithActor(backgroundActor({ durationMs: 100 }), 1), true);

    expect(tasks.snapshot()).toMatchObject([{ kind: "actor-transition", target: "MainBackground", revision: 1, status: "running" }]);

    tick(tweens, 120);

    expect(tasks.snapshot()).toEqual([]);
  });

  it("does not create actor transition tasks when animation is disabled", () => {
    const { actors, tasks } = createSystems();
    actors.reconcile(stageWithActor(backgroundActor({ durationMs: 100 }), 1), false);

    expect(tasks.snapshot()).toEqual([]);
  });

  it("creates and completes flash tasks through transient effects", () => {
    const { effects, tasks, tweens } = createSystems();
    effects.run([{ type: "flash", color: "#ffffff", durationMs: 80, wait: false }], 2);

    expect(tasks.snapshot()).toMatchObject([{ kind: "flash", target: "screen", revision: 2, status: "running" }]);

    tick(tweens, 100);

    expect(tasks.snapshot()).toEqual([]);
  });

  it("creates and completes weather transition tasks for power changes", () => {
    const { tasks, tweens, weather } = createSystems();
    weather.reconcile(stageWithWeather(weatherSnapshot({ power: 0.3, durationMs: 0 }), 1), false);

    weather.reconcile(stageWithWeather(weatherSnapshot({ power: 0.85, durationMs: 100 }), 2), true);

    expect(tasks.snapshot()).toMatchObject([{ kind: "weather-transition", target: "rain", revision: 2, status: "running" }]);

    tick(tweens, 120);

    expect(tasks.snapshot()).toEqual([]);
  });
});

function createSystems() {
  const root = new Container({ label: "test-root" });
  const options = { root, width: () => 960, height: () => 540 };
  const filters = new FilterSystem(options);
  const tweens = new TweenSystem();
  const tasks = new PresentationTaskController();
  const actors = new ActorSystem(options, filters, tweens, tasks);
  const weather = new WeatherSystem(options, filters, tweens, tasks);
  const effects = new TransientEffectSystem(options, actors, filters, tweens, tasks);
  return { actors, effects, tasks, tweens, weather };
}

function tick(tweens: TweenSystem, deltaMS: number): void {
  tweens.tick({ deltaMS } as Ticker);
}

function stageWithActor(actor: PixiActorSnapshot, revision: number): PixiStageSnapshot {
  return {
    ...createInitialPixiStageSnapshot(),
    revision,
    backgroundsById: { MainBackground: actor },
    actorOrder: ["MainBackground"]
  };
}

function backgroundActor({ durationMs }: { durationMs: number }): PixiActorSnapshot {
  return {
    id: "MainBackground",
    kind: "background",
    appearance: "bg:test",
    visible: true,
    alpha: 1,
    z: 0,
    filters: {},
    transition: { durationMs, lazy: false, wait: false }
  };
}

function stageWithWeather(weather: PixiWeatherSnapshot, revision: number): PixiStageSnapshot {
  return {
    ...createInitialPixiStageSnapshot(),
    revision,
    weather: {
      rain: weather
    }
  };
}

function weatherSnapshot({ power, durationMs }: { power: number; durationMs: number }): PixiWeatherSnapshot {
  return {
    kind: "rain",
    power,
    transition: { durationMs, lazy: false, wait: false }
  };
}
