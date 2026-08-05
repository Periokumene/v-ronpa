import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { NaniProjectAsset } from "../projectAssets";
import { SvgPreviewArtifactStore, type SvgPreviewArtifact } from "../preview/artifactStore";
import { StaticSvgAssetImagePreviewRenderer } from "./svgRenderer";

const RENDERER_REVISION = "asset-image-preview-v1";
const directlyPreviewableMimeTypes = new Set(["image/png", "image/webp", "image/avif"]);

export type AssetImagePreviewFileReader = (path: string) => Promise<Buffer>;

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function isDirectlyPreviewableImageMimeType(mimeType: string): boolean {
  return directlyPreviewableMimeTypes.has(mimeType);
}

export class AssetImagePreviewEngine {
  private readonly renderer = new StaticSvgAssetImagePreviewRenderer();
  private readonly pending = new Map<string, Promise<SvgPreviewArtifact>>();

  constructor(
    private readonly artifacts: SvgPreviewArtifactStore,
    private readonly fileReader: AssetImagePreviewFileReader = readFile
  ) {}

  initialize(): Promise<void> {
    return this.artifacts.initialize();
  }

  generate(asset: NaniProjectAsset): Promise<SvgPreviewArtifact> {
    if (!isDirectlyPreviewableImageMimeType(asset.mimeType)) {
      throw new Error(`Asset MIME '${asset.mimeType}' is not directly previewable.`);
    }
    const key = `${asset.id}\0${asset.mimeType}\0${asset.sourcePath}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const pending = this.fileReader(asset.sourcePath)
      .then((bytes) => {
        assertPreviewImageBytes(asset.mimeType, bytes);
        const fingerprint = createHash("sha256")
          .update(RENDERER_REVISION)
          .update("\0")
          .update(asset.id)
          .update("\0")
          .update(asset.mimeType)
          .update("\0")
          .update(bytes)
          .digest("hex");
        return this.artifacts.getOrCreate(fingerprint, () => this.renderer.render({
          assetId: asset.id,
          mimeType: asset.mimeType,
          bytes
        }));
      })
      .finally(() => {
        if (this.pending.get(key) === pending) this.pending.delete(key);
      });
    this.pending.set(key, pending);
    return pending;
  }

  invalidate(): void {
    this.pending.clear();
    this.artifacts.clearMemory();
  }
}

export function assertPreviewImageBytes(mimeType: string, bytes: Buffer): void {
  const valid = mimeType === "image/png"
    ? isPng(bytes)
    : mimeType === "image/webp"
      ? isWebp(bytes)
      : mimeType === "image/avif"
        ? isAvif(bytes)
        : false;
  if (!valid) throw new Error(`Asset content does not match preview MIME '${mimeType}'.`);
}

function isPng(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function isWebp(bytes: Buffer): boolean {
  return bytes.length >= 12
    && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP";
}

function isAvif(bytes: Buffer): boolean {
  if (bytes.length < 16 || bytes.toString("ascii", 4, 8) !== "ftyp") return false;
  const declaredSize = bytes.readUInt32BE(0);
  const boxEnd = Math.min(bytes.length, declaredSize >= 16 ? declaredSize : bytes.length);
  for (let offset = 8; offset + 4 <= boxEnd; offset += 4) {
    const brand = bytes.toString("ascii", offset, offset + 4);
    if (brand === "avif" || brand === "avis") return true;
  }
  return false;
}
