import type { PixiWeatherSnapshot } from "@v-ronpa/contracts";
import type { Ticker } from "pixi.js";
import type { NumericLiveState } from "../animation";

export interface WeatherEffectRenderer {
  apply(snapshot: PixiWeatherSnapshot, live: NumericLiveState): void;
  tick(ticker: Ticker): void;
  resize(width: number, height: number): void;
  destroy(): void;
}
