import { describe, expect, it } from "vitest";
import { PixelRainFilter } from "./PixelRainFilter";
import { resolveRainSettingsFromCommandParams } from "./settings";

describe("PixelRainFilter", () => {
  it("quantizes auto playback frame uniforms to preview fps steps for near-rain motion", () => {
    const settings = resolveRainSettingsFromCommandParams({ power: 1, wind: -1, hue: 215, tint: 0.55 });
    const filter = new PixelRainFilter(settings, 960, 540, { layer: "near" });
    const uniforms = (filter.filter.resources as any).rainUniforms.uniforms as { uFrame: number; uTime: number };
    const startTime = (filter as any).startTime as number;

    expect(uniforms.uFrame).toBe(0);

    filter.updateTime(startTime + 35);
    expect(uniforms.uTime).toBeGreaterThan(0);
    expect(uniforms.uFrame).toBe(0);

    filter.updateTime(startTime + 80);
    expect(uniforms.uFrame).toBe(1);
  });
});
