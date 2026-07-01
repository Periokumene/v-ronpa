import { describe, expect, it } from "vitest";
import type { FontFaceDefinition, RuntimeAsset } from "@v-ronpa/contracts";
import { createRichTextFontCss, type RichTextFontAssetResolver } from "./RichTextFontStyles";

describe("rich text font CSS", () => {
  it("generates controlled font-face CSS from manifest font assets", () => {
    const result = createRichTextFontCss({
      fonts: [
        {
          id: "font:serif",
          family: "Serif Fixture",
          sourceRef: "font:serif-runtime",
          weight: "400",
          style: "normal"
        }
      ],
      assetResolver: resolverWithAssets([runtimeAsset("font:serif-runtime", "font", "/harness/fonts/rich-serif.woff2", "woff2")])
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.cssText).toContain("@font-face");
    expect(result.cssText).toContain('font-family: "Serif Fixture";');
    expect(result.cssText).toContain('url("/harness/fonts/rich-serif.woff2") format("woff2")');
    expect(result.cssText).toContain('--v-ronpa-rich-font-font_serif: "Serif Fixture";');
  });

  it("diagnoses missing and unsupported font assets", () => {
    const result = createRichTextFontCss({
      fonts: [
        fontFace("font:missing", "Missing", "font:missing"),
        fontFace("font:wrong-kind", "Wrong Kind", "texture:wrong-kind"),
        fontFace("font:wrong-format", "Wrong Format", "font:wrong-format")
      ],
      assetResolver: resolverWithAssets([
        runtimeAsset("texture:wrong-kind", "texture", "/harness/thumbnails/wrong.png", "png"),
        runtimeAsset("font:wrong-format", "font", "/harness/fonts/wrong.png", "png")
      ])
    });

    expect(result.diagnostics).toMatchObject([
      { code: "font-asset-unresolved", fontId: "font:missing", sourceRef: "font:missing" },
      { code: "font-asset-unresolved", fontId: "font:wrong-kind", sourceRef: "texture:wrong-kind" },
      { code: "font-asset-format-unsupported", fontId: "font:wrong-format", sourceRef: "font:wrong-format" }
    ]);
  });

  it("escapes font families and urls in generated CSS", () => {
    const result = createRichTextFontCss({
      fonts: [fontFace("font:quote", 'Quote "Font"', "font:quote")],
      assetResolver: resolverWithAssets([runtimeAsset("font:quote", "font", '/fonts/quote"font.woff2', "woff2")])
    });

    expect(result.cssText).toContain('font-family: "Quote \\"Font\\"";');
    expect(result.cssText).toContain('url("/fonts/quote\\"font.woff2") format("woff2")');
  });
});

function fontFace(id: string, family: string, sourceRef: string): FontFaceDefinition {
  return { id, family, sourceRef, weight: "400", style: "normal" };
}

function runtimeAsset(id: RuntimeAsset["id"], kind: RuntimeAsset["kind"], optimizedUri: string, format: RuntimeAsset["format"]): RuntimeAsset {
  return {
    id,
    kind,
    optimizedUri,
    format,
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: []
  };
}

function resolverWithAssets(assets: RuntimeAsset[]): RichTextFontAssetResolver {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    resolve(input) {
      const asset = byId.get(input.id);
      if (!asset) return { diagnostic: { message: `Missing ${input.id}.` } };
      if (asset.kind !== input.kind) return { asset, diagnostic: { message: `${input.id} is ${asset.kind}.` } };
      return { asset, uri: asset.optimizedUri };
    }
  };
}
