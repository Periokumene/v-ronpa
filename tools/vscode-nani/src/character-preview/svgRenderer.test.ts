import type { LayeredCharacterLayerMetadata } from "@v-ronpa/contracts";
import { describe, expect, it } from "vitest";
import { StaticSvgCharacterPreviewRenderer } from "./svgRenderer";
import type { ResolvedCharacterPreview } from "./types";

describe("static SVG character renderer", () => {
  it("renders ordered embedded layers with geometry, tint, alpha, and a checkerboard", () => {
    const svg = new StaticSvgCharacterPreviewRenderer().render(preview());
    expect(svg).toContain('width="320" height="420"');
    expect(svg).toContain('fill="url(#checker)"');
    expect(svg.indexOf('data-layer="back"')).toBeLessThan(svg.indexOf('data-layer="front&amp;&lt;"'));
    expect(svg).toContain('href="data:image/png;base64,');
    expect(svg).toContain('transform="translate(10 -20) rotate(-15) scale(-2 2)"');
    expect(svg).toContain('opacity="0.5" filter="url(#tint-1)"');
    expect(svg).toContain('<feFuncR type="linear" slope="0.25"/>');
    expect(svg).toContain('front&amp;&lt;');
  });

  it("does not emit executable, external, or outline content", () => {
    const svg = new StaticSvgCharacterPreviewRenderer().render(preview());
    expect(svg).not.toMatch(/<script|foreignObject|stroke=|outline/iu);
    const hrefs = [...svg.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);
    expect(hrefs.every((href) => href?.startsWith("data:image/png;base64,"))).toBe(true);
  });
});

function preview(): ResolvedCharacterPreview {
  return {
    request: {
      documentUri: "file:///story.nani",
      documentVersion: 1,
      line: 0,
      identityRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 20 } },
      characterId: "alice",
      appearanceExpression: "EYE1"
    },
    stageScale: 2,
    characterAnchor: [5, 10],
    bounds: { minX: -100, minY: -200, maxX: 100, maxY: 200 },
    fingerprint: "fingerprint",
    packRoot: "/pack",
    layers: [
      { id: "back", png: Buffer.from("back"), width: 10, height: 20, metadata: metadata(0, false) },
      { id: "front&<", png: Buffer.from("front"), width: 10, height: 20, metadata: metadata(1, true) }
    ]
  };
}

function metadata(drawOrder: number, tinted: boolean): LayeredCharacterLayerMetadata {
  return {
    sourcePath: "fixture",
    drawOrder,
    sprite: { pivot: { x: 0.5, y: 0.25 }, pixelsPerUnit: 1 },
    localTransform: {
      position: { x: 10, y: 20, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 15 }
    },
    renderer: {
      color: tinted ? { r: 0.25, g: 0.5, b: 0.75, a: 0.5 } : { r: 1, g: 1, b: 1, a: 1 },
      flipX: tinted,
      flipY: false
    }
  };
}
