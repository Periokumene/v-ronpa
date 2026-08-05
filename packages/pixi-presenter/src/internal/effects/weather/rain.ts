import type { PixiRainCommandParams, PixiWeatherSnapshot } from "@v-ronpa/contracts";
import type { Container, Renderer, Ticker } from "pixi.js";
import { RainShaderRenderer } from "../../rain/RainShaderRenderer";
import { resolveRainSettingsFromCommandParams } from "../../rain/settings";
import type { NumericLiveState } from "../animation";
import type { WeatherEffectRenderer } from "./types";

export class RainWeatherRenderer implements WeatherEffectRenderer {
  private readonly shader: RainShaderRenderer;

  constructor(container: Container, width: number, height: number, private readonly renderer?: Renderer) {
    this.shader = new RainShaderRenderer(resolveRainSettingsFromCommandParams(defaultParams()), width, height);
    container.addChild(this.shader.container);
  }

  apply(snapshot: PixiWeatherSnapshot, live: NumericLiveState): void {
    if (snapshot.kind !== "rain") return;
    this.shader.updateSettings(resolveRainSettingsFromCommandParams({
      power: clamp(live.power ?? snapshot.commandParams.power, 0, 1),
      wind: clamp(live.wind ?? snapshot.commandParams.wind, -1, 1),
      hue: clamp(live.hue ?? snapshot.commandParams.hue, 0, 360),
      tint: clamp(live.tint ?? snapshot.commandParams.tint, 0, 2)
    }));
  }

  tick(_ticker: Ticker): void {
    this.shader.tick(this.renderer);
  }

  resize(width: number, height: number): void {
    this.shader.resize(width, height);
  }

  destroy(): void {
    this.shader.destroy();
  }
}

function defaultParams(): PixiRainCommandParams {
  return { power: 0, wind: -1, hue: 215, tint: 0.55 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
