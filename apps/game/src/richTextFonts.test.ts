import { describe, expect, it } from "vitest";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import type { ContentManifest, RuntimeAsset } from "@v-ronpa/contracts";
import { createRichTextFontCss } from "./richTextFonts";

describe("rich text font CSS", () => {
  it("generates controlled font-face CSS from manifest font assets", () => {
    const result = createRichTextFontCss(
      manifestWithAssets([
        runtimeAsset("font:serif-runtime", "font", "/harness/fonts/rich-serif.woff2", "woff2")
      ], [{ id: "font:serif", family: "Serif Fixture", sourceRef: "font:serif-runtime", weight: "400", style: "normal" }]),
      createAssetRegistry(
        manifestWithAssets([
          runtimeAsset("font:serif-runtime", "font", "/harness/fonts/rich-serif.woff2", "woff2")
        ], [{ id: "font:serif", family: "Serif Fixture", sourceRef: "font:serif-runtime", weight: "400", style: "normal" }])
      )
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.cssText).toContain("@font-face");
    expect(result.cssText).toContain('url("/harness/fonts/rich-serif.woff2") format("woff2")');
    expect(result.cssText).toContain("--v-ronpa-rich-font-font_serif");
  });

  it("diagnoses missing, wrong-kind, and unsupported-format font assets", () => {
    const manifest = manifestWithAssets(
      [
        runtimeAsset("texture:wrong-kind", "texture", "/harness/thumbnails/wrong.png", "png"),
        runtimeAsset("font:wrong-format", "font", "/harness/fonts/wrong.png", "png")
      ],
      [
        { id: "font:missing", family: "Missing", sourceRef: "font:missing", weight: "400", style: "normal" },
        { id: "font:wrong-kind", family: "Wrong Kind", sourceRef: "texture:wrong-kind", weight: "400", style: "normal" },
        { id: "font:wrong-format", family: "Wrong Format", sourceRef: "font:wrong-format", weight: "400", style: "normal" }
      ]
    );

    expect(createRichTextFontCss(manifest, createAssetRegistry(manifest)).diagnostics).toMatchObject([
      { code: "font-asset-unresolved", fontId: "font:missing", sourceRef: "font:missing" },
      { code: "font-asset-unresolved", fontId: "font:wrong-kind", sourceRef: "texture:wrong-kind" },
      { code: "font-asset-format-unsupported", fontId: "font:wrong-format", sourceRef: "font:wrong-format" }
    ]);
  });
});

function manifestWithAssets(runtimeAssets: RuntimeAsset[], fonts: ContentManifest["fonts"]): ContentManifest {
  return {
    version: 2,
    assets: [],
    fonts,
    runtimeAssets,
    uiAssets: [],
    interactionStyles: [],
    collisionProxies: [],
    maps: [],
    items: [],
    evidence: [],
    trials: []
  };
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
