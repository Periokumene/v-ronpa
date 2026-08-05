import { describe, expect, it } from "vitest";
import {
  ASSET_IMAGE_PREVIEW_HEIGHT,
  ASSET_IMAGE_PREVIEW_PADDING,
  ASSET_IMAGE_PREVIEW_WIDTH,
  StaticSvgAssetImagePreviewRenderer
} from "./svgRenderer";

describe("static asset image preview renderer", () => {
  it("renders a fixed framed contain preview without needing source dimensions", () => {
    const svg = new StaticSvgAssetImagePreviewRenderer().render({
      assetId: "custom/deep/card",
      mimeType: "image/png",
      bytes: Buffer.from("fixture")
    });

    expect(svg).toContain(`width="${ASSET_IMAGE_PREVIEW_WIDTH}" height="${ASSET_IMAGE_PREVIEW_HEIGHT}"`);
    expect(svg).toContain(`x="${ASSET_IMAGE_PREVIEW_PADDING}" y="${ASSET_IMAGE_PREVIEW_PADDING}"`);
    expect(svg).toContain("preserveAspectRatio=\"xMidYMid meet\"");
    expect(svg).toContain("fill=\"url(#checker)\"");
    expect(svg).toContain("stroke=\"#737373\"");
    expect(svg).toContain("data:image/png;base64,");
    expect(svg).not.toMatch(/naturalWidth|naturalHeight|sourceWidth|sourceHeight/u);
  });

  it("escapes an AssetId before writing it into SVG metadata", () => {
    const svg = new StaticSvgAssetImagePreviewRenderer().render({
      assetId: "custom/<card>",
      mimeType: "image/webp",
      bytes: Buffer.from("fixture")
    });

    expect(svg).toContain("custom/&lt;card&gt; asset preview");
    expect(svg).not.toContain("custom/<card> asset preview");
  });
});
