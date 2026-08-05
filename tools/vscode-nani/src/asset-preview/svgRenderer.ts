export const ASSET_IMAGE_PREVIEW_WIDTH = 320;
export const ASSET_IMAGE_PREVIEW_HEIGHT = 180;
export const ASSET_IMAGE_PREVIEW_PADDING = 8;

export interface AssetImagePreviewRenderInput {
  assetId: string;
  mimeType: string;
  bytes: Buffer;
}

export class StaticSvgAssetImagePreviewRenderer {
  render(input: AssetImagePreviewRenderInput): string {
    const innerWidth = ASSET_IMAGE_PREVIEW_WIDTH - ASSET_IMAGE_PREVIEW_PADDING * 2;
    const innerHeight = ASSET_IMAGE_PREVIEW_HEIGHT - ASSET_IMAGE_PREVIEW_PADDING * 2;
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${ASSET_IMAGE_PREVIEW_WIDTH}" height="${ASSET_IMAGE_PREVIEW_HEIGHT}" viewBox="0 0 ${ASSET_IMAGE_PREVIEW_WIDTH} ${ASSET_IMAGE_PREVIEW_HEIGHT}" role="img" aria-labelledby="preview-title">`,
      `<title id="preview-title">${escapeXml(input.assetId)} asset preview</title>`,
      "<defs>",
      "<pattern id=\"checker\" width=\"16\" height=\"16\" patternUnits=\"userSpaceOnUse\"><rect width=\"16\" height=\"16\" fill=\"#ececec\"/><path d=\"M0 0h8v8H0zM8 8h8v8H8z\" fill=\"#d7d7d7\"/></pattern>",
      "</defs>",
      `<rect x="0.5" y="0.5" width="${ASSET_IMAGE_PREVIEW_WIDTH - 1}" height="${ASSET_IMAGE_PREVIEW_HEIGHT - 1}" rx="2" fill="url(#checker)" stroke="#737373"/>`,
      `<image x="${ASSET_IMAGE_PREVIEW_PADDING}" y="${ASSET_IMAGE_PREVIEW_PADDING}" width="${innerWidth}" height="${innerHeight}" preserveAspectRatio="xMidYMid meet" href="data:${input.mimeType};base64,${input.bytes.toString("base64")}"/>`,
      "</svg>"
    ].join("");
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}
