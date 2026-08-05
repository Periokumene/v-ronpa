import type { PixiWeatherSnapshot } from "@v-ronpa/contracts";
import { Container, Filter, Rectangle, Sprite, type Ticker } from "pixi.js";
import { GodrayFilter } from "pixi-filters";
import { getBuiltInPixiFxTexture } from "../../fxAssets";
import type { NumericLiveState } from "../animation";
import type { WeatherEffectRenderer } from "./types";

interface SunFilter { gain: number; destroy(destroyPrograms?: boolean): void }

export class SunWeatherRenderer implements WeatherEffectRenderer {
  private readonly particle: Sprite;
  private filter: SunFilter | undefined;
  private width: number;
  private height: number;

  constructor(private readonly container: Container, width: number, height: number) {
    this.width = width;
    this.height = height;
    this.particle = new Sprite(getBuiltInPixiFxTexture("godray-mask"));
    this.particle.anchor.set(0.5);
    this.particle.x = Math.random() * width;
    this.particle.y = Math.random() * height;
    container.addChild(this.particle);
  }

  apply(snapshot: PixiWeatherSnapshot, live: NumericLiveState): void {
    if (snapshot.kind !== "sun") return;
    const power = clamp01(live.power ?? snapshot.power);
    if (!this.filter) this.filter = createFilter(power);
    else this.filter.gain = Math.max(0.35, power);
    this.container.filters = [this.filter as unknown as Filter];
    this.container.filterArea = new Rectangle(0, 0, this.width, this.height);
    const scale = live.scale ?? snapshot.scale?.[0] ?? 1;
    this.particle.visible = true;
    this.particle.alpha = 0.26 + power * 0.36;
    this.particle.scale.set(2.4 * scale);
  }

  tick(ticker: Ticker): void {
    this.particle.x += 0.25 * ticker.deltaMS * 0.06;
    this.particle.y += 6 * ticker.deltaMS * 0.06;
    if (this.particle.y > this.height + 80 || this.particle.x < -80 || this.particle.x > this.width + 80) {
      this.particle.x = Math.random() * this.width;
      this.particle.y = -Math.random() * 80;
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.container.filterArea = new Rectangle(0, 0, width, height);
    this.particle.x = clamp(this.particle.x, 0, width);
    this.particle.y = clamp(this.particle.y, 0, height);
  }

  destroy(): void {
    this.filter?.destroy();
    this.filter = undefined;
  }
}

function createFilter(power: number): SunFilter {
  if (typeof document === "undefined") return { gain: Math.max(0.35, power), destroy: () => undefined };
  return new GodrayFilter({ gain: Math.max(0.35, power), lacunarity: 2.6, parallel: true });
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
