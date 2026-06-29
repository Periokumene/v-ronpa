import type { AssetResolver } from "@v-ronpa/asset-registry";
import type { ContentManifest, RuntimeAssetFormat } from "@v-ronpa/contracts";
import { richTextFontCssVariableName } from "@v-ronpa/ui-kit";

export interface RichTextFontDiagnostic {
  code: "font-asset-unresolved" | "font-asset-format-unsupported";
  severity: "warning" | "error";
  message: string;
  fontId: string;
  sourceRef: string;
}

export interface RichTextFontCssResult {
  cssText: string;
  diagnostics: RichTextFontDiagnostic[];
}

export function createRichTextFontCss(manifest: Pick<ContentManifest, "fonts">, assetResolver: AssetResolver): RichTextFontCssResult {
  const diagnostics: RichTextFontDiagnostic[] = [];
  const fontFaces: string[] = [];
  const variables: string[] = [];

  for (const font of manifest.fonts) {
    const resolved = assetResolver.resolve({ id: font.sourceRef, kind: "font" });
    if (!resolved.asset || !resolved.uri) {
      diagnostics.push({
        code: "font-asset-unresolved",
        severity: "warning",
        fontId: font.id,
        sourceRef: font.sourceRef,
        message: resolved.diagnostic?.message ?? `Font asset '${font.sourceRef}' could not be resolved.`
      });
      continue;
    }
    if (!isFontFormat(resolved.asset.format)) {
      diagnostics.push({
        code: "font-asset-format-unsupported",
        severity: "warning",
        fontId: font.id,
        sourceRef: font.sourceRef,
        message: `Font asset '${font.sourceRef}' uses unsupported format '${resolved.asset.format}'.`
      });
      continue;
    }

    const family = cssString(font.family);
    fontFaces.push(
      [
        "@font-face {",
        `  font-family: ${family};`,
        `  src: ${fontSource(resolved.uri, resolved.asset.format)};`,
        `  font-weight: ${font.weight};`,
        `  font-style: ${font.style};`,
        "  font-display: swap;",
        "}"
      ].join("\n")
    );
    variables.push(`  ${richTextFontCssVariableName(font.id)}: ${family};`);
  }

  return {
    cssText: [...fontFaces, variables.length > 0 ? `:root {\n${variables.join("\n")}\n}` : ""].filter(Boolean).join("\n"),
    diagnostics
  };
}

function cssString(value: string): string {
  return `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"")}"`;
}

function cssUrl(value: string): string {
  return `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"")}"`;
}

function fontSource(uri: string, format: RuntimeAssetFormat): string {
  return `url(${cssUrl(uri)}) format("${fontFormat(format)}")`;
}

function isFontFormat(format: RuntimeAssetFormat): boolean {
  return format === "woff" || format === "woff2" || format === "ttf" || format === "otf";
}

function fontFormat(format: RuntimeAssetFormat): string {
  if (format === "ttf") return "truetype";
  if (format === "otf") return "opentype";
  return format;
}
