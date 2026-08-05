import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { NaniProjectAsset } from "../projectAssets";
import { SvgPreviewArtifactStore } from "../preview/artifactStore";
import {
  AssetImagePreviewEngine,
  assertPreviewImageBytes,
  isDirectlyPreviewableImageMimeType,
  isImageMimeType
} from "./engine";

const roots: string[] = [];
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lBY8WQAAAABJRU5ErkJggg==",
  "base64"
);

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("asset image preview engine", () => {
  it("recognizes image capability separately from direct preview support", () => {
    expect(isImageMimeType("image/png")).toBe(true);
    expect(isImageMimeType("image/ktx2")).toBe(true);
    expect(isImageMimeType("audio/ogg")).toBe(false);
    expect(isDirectlyPreviewableImageMimeType("image/png")).toBe(true);
    expect(isDirectlyPreviewableImageMimeType("image/webp")).toBe(true);
    expect(isDirectlyPreviewableImageMimeType("image/avif")).toBe(true);
    expect(isDirectlyPreviewableImageMimeType("image/ktx2")).toBe(false);
  });

  it("deduplicates concurrent reads and changes fingerprints with content", async () => {
    const root = tempRoot();
    let reads = 0;
    let current = png;
    const engine = new AssetImagePreviewEngine(
      new SvgPreviewArtifactStore(root),
      async () => {
        reads += 1;
        return current;
      }
    );
    await engine.initialize();
    const asset = imageAsset();
    const [first, duplicate] = await Promise.all([engine.generate(asset), engine.generate(asset)]);
    expect(first.path).toBe(duplicate.path);
    expect(reads).toBe(1);
    expect(readFileSync(first.path, "utf8")).toContain("preserveAspectRatio=\"xMidYMid meet\"");

    engine.invalidate();
    current = Buffer.concat([png, Buffer.from([0])]);
    const changed = await engine.generate(asset);
    expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(reads).toBe(2);
  });

  it("rejects mismatched bytes and refuses to decode KTX2", async () => {
    const webp = Buffer.alloc(12);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    const avif = Buffer.alloc(16);
    avif.writeUInt32BE(16, 0);
    avif.write("ftyp", 4, "ascii");
    avif.write("avif", 8, "ascii");
    expect(() => assertPreviewImageBytes("image/png", png)).not.toThrow();
    expect(() => assertPreviewImageBytes("image/webp", webp)).not.toThrow();
    expect(() => assertPreviewImageBytes("image/avif", avif)).not.toThrow();
    expect(() => assertPreviewImageBytes("image/png", Buffer.from("not-png"))).toThrow(/does not match/u);
    const engine = new AssetImagePreviewEngine(
      new SvgPreviewArtifactStore(tempRoot()),
      async () => Buffer.from("ktx")
    );
    expect(() => engine.generate({ ...imageAsset(), mimeType: "image/ktx2" })).toThrow(/not directly previewable/u);
  });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "vscode-nani-asset-preview-"));
  roots.push(root);
  return root;
}

function imageAsset(): NaniProjectAsset {
  return {
    id: "custom/deep/card",
    uri: "assets/custom/deep/card.png",
    mimeType: "image/png",
    sourcePath: "/assets/custom/deep/card.png"
  };
}
