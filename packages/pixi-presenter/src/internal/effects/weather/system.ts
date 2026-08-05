import type { PixiStageSnapshot, PixiWeatherKind, PixiWeatherSnapshot } from "@v-ronpa/contracts";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import { Container, type Ticker } from "pixi.js";
import type { PresentationTaskController } from "../../presentationTasks";
import type { PixiPresenterSystemsOptions } from "../../systemTypes";
import { LiveParamTransition, type NumericLiveState, type TweenSystem } from "../animation";
import { WEATHER_EFFECT_KINDS } from "../registries";
import { RainWeatherRenderer } from "./rain";
import { SnowWeatherRenderer } from "./snow";
import { SunWeatherRenderer } from "./sun";
import type { WeatherEffectRenderer } from "./types";

interface WeatherRecord {
  snapshot: PixiWeatherSnapshot;
  container: Container;
  live: NumericLiveState;
  transition: LiveParamTransition;
  renderer: WeatherEffectRenderer;
}

type RendererFactory = (container: Container, options: PixiPresenterSystemsOptions) => WeatherEffectRenderer;

const weatherRendererRegistry = {
  rain: (container, options) => new RainWeatherRenderer(container, options.width(), options.height(), options.renderer),
  snow: (container, options) => new SnowWeatherRenderer(container, options.width(), options.height()),
  sun: (container, options) => new SunWeatherRenderer(container, options.width(), options.height())
} satisfies Record<PixiWeatherKind, RendererFactory>;

export class WeatherSystem {
  private readonly backLayer = new Container({ label: "weather-back" });
  private readonly frontLayer = new Container({ label: "weather-front" });
  private readonly records = new Map<PixiWeatherKind, WeatherRecord>();

  constructor(
    private readonly options: PixiPresenterSystemsOptions,
    private readonly tweens: TweenSystem,
    private readonly tasks: PresentationTaskController
  ) {
    this.backLayer.zIndex = 5;
    this.frontLayer.zIndex = 20;
    options.root.sortableChildren = true;
    options.root.addChild(this.backLayer, this.frontLayer);
  }

  reconcile(snapshot: PixiStageSnapshot, animate: boolean, hints: PixiStageRenderHint[] = []): void {
    const removals = new Map(
      hints
        .filter((hint): hint is Extract<PixiStageRenderHint, { type: "weather-remove" }> => hint.type === "weather-remove")
        .map((hint) => [hint.kind, hint])
    );
    for (const kind of WEATHER_EFFECT_KINDS) {
      const weather = snapshot.weather[kind];
      if (!weather) continue;
      if (weatherPower(weather) <= 0) this.remove(kind);
      else this.upsert(kind, weather, animate, snapshot.revision);
    }
    for (const kind of [...this.records.keys()]) {
      if (snapshot.weather[kind]) continue;
      const removal = removals.get(kind);
      if (animate && removal && removal.durationMs > 0) this.fadeOutAndRemove(kind, removal, snapshot.revision);
      else this.remove(kind);
    }
  }

  tick(ticker: Ticker): void {
    for (const record of this.records.values()) {
      record.renderer.resize(this.options.width(), this.options.height());
      record.renderer.tick(ticker);
    }
  }

  clear(): void {
    for (const kind of [...this.records.keys()]) this.remove(kind);
  }

  destroy(): void {
    this.clear();
    this.backLayer.removeFromParent();
    this.frontLayer.removeFromParent();
    this.backLayer.destroy({ children: true });
    this.frontLayer.destroy({ children: true });
  }

  relayoutViewport(): void {
    for (const record of this.records.values()) record.renderer.resize(this.options.width(), this.options.height());
  }

  private upsert(kind: PixiWeatherKind, snapshot: PixiWeatherSnapshot, animate: boolean, revision: number): void {
    let record = this.records.get(kind);
    const targetLive = weatherLiveParams(snapshot);
    if (!record) {
      const container = new Container({ label: `weather:${kind}` });
      container.alpha = 0;
      (kind === "sun" ? this.backLayer : this.frontLayer).addChild(container);
      const live = { ...targetLive };
      if (animate && snapshot.transition.durationMs > 0) live.power = 0;
      record = {
        snapshot,
        container,
        live,
        transition: new LiveParamTransition(this.tweens, this.tasks),
        renderer: weatherRendererRegistry[kind](container, this.options)
      };
      this.records.set(kind, record);
    }
    record.snapshot = snapshot;
    record.transition.start({
      state: record.live,
      to: targetLive,
      animate,
      durationMs: snapshot.transition.durationMs,
      easing: snapshot.transition.easing,
      forceTask: snapshot.transition.wait,
      task: { kind: "weather-transition", target: kind, revision },
      onUpdate: () => this.apply(record)
    });
  }

  private apply(record: WeatherRecord): void {
    record.container.alpha = clamp01(record.live.power ?? weatherPower(record.snapshot));
    record.renderer.apply(record.snapshot, record.live);
    record.renderer.resize(this.options.width(), this.options.height());
  }

  private fadeOutAndRemove(
    kind: PixiWeatherKind,
    hint: Extract<PixiStageRenderHint, { type: "weather-remove" }>,
    revision: number
  ): void {
    const record = this.records.get(kind);
    if (!record) return;
    const cleanup = () => this.remove(kind, false);
    record.transition.start({
      state: record.live,
      to: { ...record.live, power: 0 },
      animate: true,
      durationMs: hint.durationMs,
      easing: hint.easing,
      forceTask: hint.wait,
      task: { kind: "weather-transition", target: kind, revision },
      onUpdate: () => this.apply(record),
      onComplete: cleanup,
      onSettle: cleanup,
      onCancel: cleanup
    });
  }

  private remove(kind: PixiWeatherKind, cancelTasks = true): void {
    const record = this.records.get(kind);
    if (!record) return;
    record.transition.cancel(false);
    if (cancelTasks) this.tasks.cancelTarget(kind);
    record.renderer.destroy();
    record.container.removeFromParent();
    record.container.destroy({ children: true });
    this.records.delete(kind);
  }
}

function weatherPower(snapshot: PixiWeatherSnapshot): number {
  return snapshot.kind === "rain" ? snapshot.commandParams.power : snapshot.power;
}

function weatherLiveParams(snapshot: PixiWeatherSnapshot): NumericLiveState {
  if (snapshot.kind === "rain") return {
    power: clamp01(snapshot.commandParams.power),
    wind: snapshot.commandParams.wind,
    hue: snapshot.commandParams.hue,
    tint: snapshot.commandParams.tint
  };
  if (snapshot.kind === "snow") return {
    power: clamp01(snapshot.power),
    xSpeed: snapshot.xSpeed ?? 0.25,
    ySpeed: snapshot.ySpeed ?? 0.45,
    density: snapshot.density ?? 1,
    flakeScale: snapshot.flakeScale ?? snapshot.scale?.[0] ?? 1,
    sway: snapshot.sway ?? 1,
    fog: snapshot.fog ?? 0.25,
    noise: snapshot.noise ?? 0.01
  };
  return { power: clamp01(snapshot.power), scale: snapshot.scale?.[0] ?? 1 };
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
