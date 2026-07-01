import { useEffect, useMemo } from "react";
import type { FontFaceDefinition, RuntimeAsset, RuntimeAssetFormat } from "@v-ronpa/contracts";
import { richTextFontCssVariableName } from "./RichTextRenderer";

export interface RichTextFontAssetResolver {
  resolve(input: { id: string; kind: "font" }): {
    asset?: Pick<RuntimeAsset, "format"> | undefined;
    uri?: string | undefined;
    diagnostic?: { message: string } | undefined;
  };
}

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

export interface CreateRichTextFontCssInput {
  fonts: FontFaceDefinition[];
  assetResolver: RichTextFontAssetResolver;
}

export interface RichTextFontRuntimeDiagnostic {
  code: RichTextFontDiagnostic["code"] | "font-load-failed";
  severity: "warning" | "error";
  message: string;
  assetId: string;
  kind: "font";
  fontId: string;
}

export interface RichTextFontStylesProps extends CreateRichTextFontCssInput {
  onDiagnostic?: ((diagnostic: RichTextFontRuntimeDiagnostic) => void) | undefined;
  testId?: string | undefined;
}

export function createRichTextFontCss({ fonts, assetResolver }: CreateRichTextFontCssInput): RichTextFontCssResult {
  const diagnostics: RichTextFontDiagnostic[] = [];
  const fontFaces: string[] = [];
  const variables: string[] = [];

  for (const font of fonts) {
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
      onDiagnostic({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        assetId: diagnostic.sourceRef,
        kind: "font",
        fontId: diagnostic.fontId
      });
    }
  }, [onDiagnostic, result.diagnostics]);

  useEffect(() => {
    if (!onDiagnostic || typeof document === "undefined" || !document.fonts) return;
    let cancelled = false;
    for (const font of fonts) {
      void document.fonts
        .load(`${font.style} ${font.weight} 16px ${fontLoadFamily(font.family)}`)
        .then(() => undefined)
        .catch((error: unknown) => {
          if (cancelled) return;
          onDiagnostic({
            code: "font-load-failed",
            severity: "warning",
            message: `Font '${font.id}' failed to load: ${error instanceof Error ? error.message : String(error)}`,
            assetId: font.sourceRef,
            kind: "font",
            fontId: font.id
          });
        });
    }
    return () => {
      cancelled = true;
    };
  }, [fonts, onDiagnostic]);

  return result.cssText ? <style data-testid={testId}>{result.cssText}</style> : null;
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

function fontLoadFamily(family: string): string {
  return cssString(family);
}
