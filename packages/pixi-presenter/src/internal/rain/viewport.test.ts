import { describe, expect, it } from "vitest";
import { rainDesignAspect, resolveRainViewportCover } from "./viewport";

describe("rain viewport mapping", () => {
  it("keeps the design frame unchanged when canvas aspect matches the rain design", () => {
    const mapping = resolveRainViewportCover(1384, 646);

    expect(mapping.designAspect).toBeCloseTo(rainDesignAspect);
    expect(mapping.frameMin).toEqual([0, 0]);
    expect(mapping.frameSize).toEqual([1, 1]);
    expect(mapping.guideResolution).toEqual([1384, 646]);
  });

  it("covers wide canvases by cropping the rain design vertically", () => {
    const mapping = resolveRainViewportCover(1920, 540);

    expect(mapping.frameSize[0]).toBe(1);
    expect(mapping.frameSize[1]).toBeGreaterThan(1);
    expect(mapping.frameMin[0]).toBe(0);
    expect(mapping.frameMin[1]).toBeLessThan(0);
    expect(mapping.guideResolution[0]).toBe(1920);
    expect(mapping.guideResolution[1]).toBeGreaterThan(540);
  });

  it("covers narrow canvases by cropping the rain design horizontally", () => {
    const mapping = resolveRainViewportCover(720, 720);

    expect(mapping.frameSize[0]).toBeGreaterThan(1);
    expect(mapping.frameSize[1]).toBe(1);
    expect(mapping.frameMin[0]).toBeLessThan(0);
    expect(mapping.frameMin[1]).toBe(0);
    expect(mapping.guideResolution[0]).toBeGreaterThan(720);
    expect(mapping.guideResolution[1]).toBe(720);
  });
});
