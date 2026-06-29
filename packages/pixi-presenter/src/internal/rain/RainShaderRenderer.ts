import { Container, RenderTexture, Sprite, Texture, type Renderer } from "pixi.js";
import { midRainRenderScale, PixelRainFilter } from "./PixelRainFilter";
import type { RainSettings } from "./settings";

export class RainShaderRenderer {
  readonly container = new Container({ label: "weather:rain:shader" });
  private readonly midWorkSurface = new Sprite(Texture.WHITE);
  private readonly midSurface: Sprite;
  private readonly nearSurface = new Sprite(Texture.WHITE);
  private readonly midFilter: PixelRainFilter;
  private readonly nearFilter: PixelRainFilter;
  private midRenderTexture: RenderTexture;
  private width: number;
  private height: number;
  private settings: RainSettings;

  constructor(settings: RainSettings, width: number, height: number) {
    this.settings = settings;
    const initialWidth = Math.max(1, width);
    const initialHeight = Math.max(1, height);
    this.width = 0;
    this.height = 0;
    this.midRenderTexture = this.createMidRenderTexture(initialWidth, initialHeight);
    this.midSurface = new Sprite(this.midRenderTexture);
    this.midFilter = new PixelRainFilter(settings, initialWidth, initialHeight, { layer: "mid", resolution: 1 });
    this.nearFilter = new PixelRainFilter(settings, initialWidth, initialHeight, {
      layer: "near",
      opaqueBackground: false,
      resolution: 1
    });

    this.midWorkSurface.filters = [this.midFilter.filter];
    this.nearSurface.filters = [this.nearFilter.filter];
    this.midSurface.blendMode = "add";
    this.nearSurface.blendMode = "add";
    this.resize(initialWidth, initialHeight);
    this.syncVisibility();
    this.container.addChild(this.nearSurface, this.midSurface);
  }

  updateSettings(settings: RainSettings): void {
    this.settings = settings;
    this.midFilter.updateSettings(settings);
    this.nearFilter.updateSettings(settings);
    this.syncVisibility();
  }

  resize(width: number, height: number): void {
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));
    if (nextWidth === this.width && nextHeight === this.height) return;

    this.width = nextWidth;
    this.height = nextHeight;
    const midWidth = Math.max(1, Math.ceil(nextWidth * midRainRenderScale));
    const midHeight = Math.max(1, Math.ceil(nextHeight * midRainRenderScale));
    this.midRenderTexture.resize(midWidth, midHeight, 1);
    this.resizeSurface(this.midWorkSurface, midWidth, midHeight);
    this.resizeSurface(this.midSurface, nextWidth, nextHeight);
    this.resizeSurface(this.nearSurface, nextWidth, nextHeight);
    this.midFilter.resize(nextWidth, nextHeight);
    this.nearFilter.resize(nextWidth, nextHeight);
  }

  tick(renderer: Renderer | undefined, now = performance.now()): void {
    if (this.midSurface.renderable) this.midFilter.updateTime(now);
    if (this.nearSurface.renderable) this.nearFilter.updateTime(now);
    if (!renderer || !this.midSurface.renderable) return;
    renderer.render({
      container: this.midWorkSurface,
      target: this.midRenderTexture,
      clear: true,
      clearColor: [0, 0, 0, 0]
    });
  }

  destroy(): void {
    this.midFilter.filter.destroy();
    this.nearFilter.filter.destroy();
    this.midRenderTexture.destroy(true);
    this.container.destroy({ children: true });
  }

  private createMidRenderTexture(width: number, height: number): RenderTexture {
    return RenderTexture.create({
      width: Math.max(1, Math.ceil(width * midRainRenderScale)),
      height: Math.max(1, Math.ceil(height * midRainRenderScale)),
      resolution: 1,
      dynamic: true
    });
  }

  private resizeSurface(surface: Sprite, width: number, height: number): void {
    surface.width = width;
    surface.height = height;
  }

  private syncVisibility(): void {
    this.midSurface.renderable = this.settings.showMidRain && this.settings.midRainBands.some(Boolean);
    this.nearSurface.renderable = this.settings.showRain;
  }
}
