import { describe, expect, it } from "vitest";
import type { AssetDefinition, FontFaceDefinition } from "@v-ronpa/contracts";
import { createRichTextFontCss, type RichTextFontAssetResolver } from "./RichTextFontStyles";

describe("rich text font CSS", () => {
  it("generates controlled font-face CSS from manifest font assets", () => {
    const result = createRichTextFontCss({
      fonts: [
        {
          id: "serif",
          family: "Serif Fixture",
          source: { type: "asset", assetId: "font/rich-serif" },
          weight: "400",
          style: "normal"
        }
      ],
      assetResolver: resolverWithAssets([asset("font/rich-serif", "font/woff2", "/harness/fonts/rich-serif.woff2")])
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.cssText).toContain("@font-face");
    expect(result.cssText).toContain('font-family: "Serif Fixture";');
    expect(result.cssText).toContain('url("/harness/fonts/rich-serif.woff2") format("woff2")');
    expect(result.cssText).toContain('--v-ronpa-rich-font-serif: "Serif Fixture";');
  });

  it("diagnoses missing and unsupported font assets", () => {
    const result = createRichTextFontCss({
      fonts: [
        fontFace("missing", "Missing", "font/missing"),
        fontFace("wrong-kind", "Wrong Kind", "texture/wrong-kind"),
        fontFace("wrong-format", "Wrong Format", "font/wrong-format")
      ],
      assetResolver: resolverWithAssets([
        asset("texture/wrong-kind", "image/png", "/harness/thumbnails/wrong.png"),
        asset("font/wrong-format", "font/collection", "/harness/fonts/wrong.ttc")
      ])
    });

    expect(result.diagnostics).toMatchObject([
      { code: "font-asset-unresolved", fontFaceId: "missing", assetId: "font/missing" },
      { code: "font-asset-unresolved", fontFaceId: "wrong-kind", assetId: "texture/wrong-kind" },
      { code: "font-asset-format-unsupported", fontFaceId: "wrong-format", assetId: "font/wrong-format" }
    ]);
  });

  it("escapes font families and urls in generated CSS", () => {
    const result = createRichTextFontCss({
      fonts: [fontFace("quote", 'Quote "Font"', "font/quote")],
      assetResolver: resolverWithAssets([asset("font/quote", "font/woff2", '/fonts/quote"font.woff2')])
    });

    expect(result.cssText).toContain('font-family: "Quote \\"Font\\"";');
    expect(result.cssText).toContain('url("/fonts/quote\\"font.woff2") format("woff2")');
  });
});

function fontFace(id: string, family: string, assetId: string): FontFaceDefinition {
  return { id, family, source: { type: "asset", assetId }, weight: "400", style: "normal" };
}

function asset(id: string, mimeType: string, uri: string): AssetDefinition {
  return { id, mimeType, uri };
}

function resolverWithAssets(assets: AssetDefinition[]): RichTextFontAssetResolver {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    resolve(input) {
      const asset = byId.get(input.id);
      if (!asset) return { diagnostic: { message: `Missing ${input.id}.` } };
      if (!asset.mimeType.startsWith("font/")) return { diagnostic: { message: `${input.id} is ${asset.mimeType}.` } };
      return { asset, uri: asset.uri };
    }
  };
}
