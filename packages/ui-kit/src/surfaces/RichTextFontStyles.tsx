import { useEffect, useMemo } from "react";
import type { AssetDefinition, AssetRequirement, FontFaceDefinition } from "@v-ronpa/contracts";
import { richTextFontCssVariableName } from "./RichTextRenderer";

export interface RichTextFontAssetResolver {
  resolve(input: AssetRequirement): {
    asset?: Pick<AssetDefinition, "mimeType">;
    uri?: string;
    diagnostic?: { message: string };
  };
}

export interface RichTextFontDiagnostic {
  code: "font-asset-unresolved" | "font-asset-format-unsupported";
  severity: "warning" | "error";
  message: string;
  fontFaceId: string;
  assetId: string;
}

export interface RichTextFontCssResult {
  cssText: string;
  diagnostics: RichTextFontDiagnostic[];
}

export interface CreateRichTextFontCssInput {
  fonts: FontFaceDefinition[];
  assetResolver: RichTextFontAssetResolver;
}

export interface RichTextFontRuntimeDiagnostic {
  code: RichTextFontDiagnostic["code"] | "font-load-failed";
  severity: "warning" | "error";
  message: string;
  assetId: string;
  capability: "font";
  fontFaceId: string;
}

export interface RichTextFontStylesProps extends CreateRichTextFontCssInput {
  onDiagnostic?: (diagnostic: RichTextFontRuntimeDiagnostic) => void;
  testId?: string;
}

export function createRichTextFontCss({ fonts, assetResolver }: CreateRichTextFontCssInput): RichTextFontCssResult {
  const diagnostics: RichTextFontDiagnostic[] = [];
  const fontFaces: string[] = [];
  const variables: string[] = [];

  for (const font of fonts) {
    const family = cssString(font.family);
    variables.push(`  ${richTextFontCssVariableName(font.id)}: ${family};`);
    if (font.source.type === "system") continue;

    const resolved = assetResolver.resolve({ id: font.source.assetId, capability: "font" });
    if (!resolved.asset || !resolved.uri) {
      diagnostics.push({
        code: "font-asset-unresolved",
        severity: "warning",
        fontFaceId: font.id,
        assetId: font.source.assetId,
        message: resolved.diagnostic?.message ?? `Font asset '${font.source.assetId}' could not be resolved.`
      });
      continue;
    }
    const format = fontFormatForMime(resolved.asset.mimeType);
    if (!format) {
      diagnostics.push({
        code: "font-asset-format-unsupported",
        severity: "warning",
        fontFaceId: font.id,
        assetId: font.source.assetId,
        message: `Font asset '${font.source.assetId}' uses unsupported MIME '${resolved.asset.mimeType}'.`
      });
      continue;
    }
    fontFaces.push([
      "@font-face {",
      `  font-family: ${family};`,
      `  src: url(${cssUrl(resolved.uri)}) format("${format}");`,
      `  font-weight: ${font.weight};`,
      `  font-style: ${font.style};`,
      "  font-display: swap;",
      "}"
    ].join("\n"));
  }

  return {
    cssText: [...fontFaces, variables.length > 0 ? `:root {\n${variables.join("\n")}\n}` : ""]
      .filter(Boolean)
      .join("\n"),
    diagnostics
  };
}

export function RichTextFontStyles({
  assetResolver,
  fonts,
  onDiagnostic,
  testId = "rich-text-font-faces"
}: RichTextFontStylesProps) {
  const result = useMemo(() => createRichTextFontCss({ fonts, assetResolver }), [assetResolver, fonts]);

  useEffect(() => {
    if (!onDiagnostic) return;
    for (const diagnostic of result.diagnostics) {
      onDiagnostic({ ...diagnostic, capability: "font" });
    }
  }, [onDiagnostic, result.diagnostics]);

  useEffect(() => {
    if (!onDiagnostic || typeof document === "undefined" || !document.fonts) return;
    let cancelled = false;
    for (const font of fonts) {
      if (font.source.type !== "asset") continue;
      const assetId = font.source.assetId;
      void document.fonts
        .load(`${font.style} ${font.weight} 16px ${cssString(font.family)}`)
        .catch((error: unknown) => {
          if (cancelled) return;
          onDiagnostic({
            code: "font-load-failed",
            severity: "warning",
            message: `Font '${font.id}' failed to load: ${error instanceof Error ? error.message : String(error)}`,
            assetId,
            capability: "font",
            fontFaceId: font.id
          });
        });
    }
    return () => { cancelled = true; };
  }, [fonts, onDiagnostic]);

  return result.cssText ? <style data-testid={testId}>{result.cssText}</style> : null;
}

function fontFormatForMime(mimeType: string): string | undefined {
  if (mimeType === "font/woff") return "woff";
  if (mimeType === "font/woff2") return "woff2";
  if (mimeType === "font/ttf") return "truetype";
  if (mimeType === "font/otf") return "opentype";
  return undefined;
}

function cssString(value: string): string {
  return `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"")}"`;
}

function cssUrl(value: string): string {
  return `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"")}"`;
}
