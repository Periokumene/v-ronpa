import type { LayeredCharacterLayerMetadata } from "@v-ronpa/contracts";
import { describe, expect, it } from "vitest";
import { calculateLayerGeometry, unionPreviewBounds } from "./geometry";

describe("character preview geometry", () => {
  it("matches presenter anchor, pivot, scale, rotation, and flips", () => {
    const result = calculateLayerGeometry({
      width: 100,
      height: 50,
      metadata: metadata({ rotation: 90, flipX: true }),
      stageScale: 2,
      characterAnchor: [10, 20]
    });
    expect(result).toMatchObject({
      x: 20,
      y: -40,
      rotationDegrees: -90,
      scaleX: -4,
      scaleY: 2,
      imageX: -50,
      imageY: -25
    });
    expect(result.bounds.minX).toBeCloseTo(-30);
    expect(result.bounds.maxX).toBeCloseTo(70);
    expect(result.bounds.minY).toBeCloseTo(-240);
    expect(result.bounds.maxY).toBeCloseTo(160);
  });

  it("unions transformed bounds and rejects empty sets", () => {
    expect(unionPreviewBounds([
      { minX: 0, minY: 2, maxX: 10, maxY: 12 },
      { minX: -4, minY: 3, maxX: 7, maxY: 20 }
    ])).toEqual({ minX: -4, minY: 2, maxX: 10, maxY: 20 });
    expect(() => unionPreviewBounds([])).toThrow(/no active layers/u);
  });
});

function metadata(options: { rotation: number; flipX: boolean }): LayeredCharacterLayerMetadata {
  return {
    sourcePath: "fixture",
    drawOrder: 0,
    sprite: { pivot: { x: 0.5, y: 0.5 }, pixelsPerUnit: 1 },
    localTransform: {
      position: { x: 20, y: 40, z: 0 },
      scale: { x: 2, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: options.rotation }
    },
    renderer: {
      color: { r: 1, g: 1, b: 1, a: 1 },
      flipX: options.flipX,
      flipY: false
    }
  };
}
