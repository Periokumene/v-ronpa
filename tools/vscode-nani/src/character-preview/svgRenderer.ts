import { calculateLayerGeometry } from "./geometry";
import type { CharacterPreviewArtifactRenderer, ResolvedCharacterPreview } from "./types";

export const CHARACTER_PREVIEW_WIDTH = 320;
export const CHARACTER_PREVIEW_HEIGHT = 420;
export const CHARACTER_TOKEN_PREVIEW_WIDTH = 320;
export const CHARACTER_TOKEN_PREVIEW_HEIGHT = 180;

export interface StaticSvgCharacterPreviewRendererOptions {
  width?: number;
  height?: number;
}

export class StaticSvgCharacterPreviewRenderer implements CharacterPreviewArtifactRenderer {
  private readonly width: number;
  private readonly height: number;

  constructor(options: StaticSvgCharacterPreviewRendererOptions = {}) {
    this.width = options.width ?? CHARACTER_PREVIEW_WIDTH;
    this.height = options.height ?? CHARACTER_PREVIEW_HEIGHT;
  }

  render(input: ResolvedCharacterPreview): string {
    const boundsWidth = Math.max(1e-6, input.bounds.maxX - input.bounds.minX);
    const boundsHeight = Math.max(1e-6, input.bounds.maxY - input.bounds.minY);
    const paddedWidth = boundsWidth * 1.12;
    const paddedHeight = boundsHeight * 1.12;
    const fitScale = Math.min(this.width / paddedWidth, this.height / paddedHeight);
    const centerX = (input.bounds.minX + input.bounds.maxX) / 2;
    const centerY = (input.bounds.minY + input.bounds.maxY) / 2;
    const filters = input.layers.map((layer, index) => tintFilter(layer.metadata.renderer.color, index)).filter(Boolean).join("");
    const images = input.layers.map((layer, index) => {
      const geometry = calculateLayerGeometry({
        width: layer.width,
        height: layer.height,
        metadata: layer.metadata,
        stageScale: input.stageScale,
        characterAnchor: input.characterAnchor
      });
      const color = layer.metadata.renderer.color;
      const filter = isWhite(color) ? "" : ` filter="url(#tint-${index})"`;
      return `<g data-layer="${escapeXml(layer.id)}" transform="translate(${number(geometry.x)} ${number(geometry.y)}) rotate(${number(geometry.rotationDegrees)}) scale(${number(geometry.scaleX)} ${number(geometry.scaleY)})" opacity="${number(color.a)}"${filter}><image x="${number(geometry.imageX)}" y="${number(geometry.imageY)}" width="${layer.width}" height="${layer.height}" href="data:image/png;base64,${layer.png.toString("base64")}"/></g>`;
    }).join("");
    const title = `${input.request.characterId} ${input.request.appearanceExpression || "default"}`;
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" role="img" aria-labelledby="preview-title">`,
      `<title id="preview-title">${escapeXml(title)}</title>`,
      "<defs>",
      "<pattern id=\"checker\" width=\"16\" height=\"16\" patternUnits=\"userSpaceOnUse\"><rect width=\"16\" height=\"16\" fill=\"#ececec\"/><path d=\"M0 0h8v8H0zM8 8h8v8H8z\" fill=\"#d7d7d7\"/></pattern>",
      filters,
      "</defs>",
      `<rect width="${this.width}" height="${this.height}" fill="url(#checker)"/>`,
      `<g transform="translate(${this.width / 2} ${this.height / 2}) scale(${number(fitScale)}) translate(${number(-centerX)} ${number(-centerY)})">`,
      images,
      "</g>",
      "</svg>"
    ].join("");
  }
}

function tintFilter(color: { r: number; g: number; b: number }, index: number): string {
  if (isWhite(color)) return "";
  return `<filter id="tint-${index}" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="linear" slope="${number(color.r)}"/><feFuncG type="linear" slope="${number(color.g)}"/><feFuncB type="linear" slope="${number(color.b)}"/><feFuncA type="identity"/></feComponentTransfer></filter>`;
}

function isWhite(color: { r: number; g: number; b: number }): boolean {
  return color.r === 1 && color.g === 1 && color.b === 1;
}

function number(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Character preview SVG received non-finite number ${value}.`);
  const rounded = Math.abs(value) < 1e-10 ? 0 : value;
  return Number(rounded.toFixed(6)).toString();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}
