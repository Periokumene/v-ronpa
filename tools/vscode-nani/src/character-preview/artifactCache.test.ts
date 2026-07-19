import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CharacterPreviewArtifactCache } from "./artifactCache";
import type { CharacterPreviewArtifactRenderer, ResolvedCharacterPreview } from "./types";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("character preview artifact cache", () => {
  it("deduplicates concurrent content-addressed SVG generation", async () => {
    const cache = new CharacterPreviewArtifactCache(tempRoot());
    await cache.initialize();
    let renders = 0;
    const renderer: CharacterPreviewArtifactRenderer = {
      render: () => {
        renders += 1;
        return "<svg/>";
      }
    };
    const [first, second] = await Promise.all([
      cache.getOrCreate(preview("a"), renderer),
      cache.getOrCreate(preview("a"), renderer)
    ]);
    expect(first.path).toBe(second.path);
    expect(renders).toBe(1);
    await cache.getOrCreate(preview("a"), renderer);
    expect(renders).toBe(1);
  });

  it("retains only the configured number of newest artifacts", async () => {
    const root = tempRoot();
    const cache = new CharacterPreviewArtifactCache(root, { maxArtifacts: 2, maxBytes: 1024 });
    await cache.initialize();
    const renderer: CharacterPreviewArtifactRenderer = { render: () => "<svg>fixture</svg>" };
    await cache.getOrCreate(preview("a"), renderer);
    await cache.getOrCreate(preview("b"), renderer);
    await cache.getOrCreate(preview("c"), renderer);
    expect(readdirSync(root).filter((name) => name.endsWith(".svg"))).toHaveLength(2);
  });

  it("serializes cleanup when different artifacts fill a saturated cache concurrently", async () => {
    const root = tempRoot();
    const cache = new CharacterPreviewArtifactCache(root, { maxArtifacts: 2, maxBytes: 1024 });
    await cache.initialize();
    const renderer: CharacterPreviewArtifactRenderer = { render: () => "<svg>fixture</svg>" };
    const first = await cache.getOrCreate(preview("a"), renderer);
    const second = await cache.getOrCreate(preview("b"), renderer);
    const oldTime = new Date(1_000);
    utimesSync(first.path, oldTime, oldTime);
    utimesSync(second.path, oldTime, oldTime);

    const [complete, contribution] = await Promise.all([
      cache.getOrCreate(preview("complete"), renderer),
      cache.getOrCreate(preview("contribution"), renderer)
    ]);

    expect(existsSync(complete.path)).toBe(true);
    expect(existsSync(contribution.path)).toBe(true);
    expect(readdirSync(root).filter((name) => name.endsWith(".svg"))).toHaveLength(2);
  });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "vscode-nani-preview-cache-"));
  roots.push(root);
  return root;
}

function preview(fingerprint: string): ResolvedCharacterPreview {
  return {
    request: {
      documentUri: "file:///story.nani",
      documentVersion: 1,
      line: 0,
      identityRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 10 } },
      characterId: "alice",
      appearanceExpression: ""
    },
    stageScale: 1,
    characterAnchor: [0, 0],
    layers: [{
      id: "layer",
      png: Buffer.from("png"),
      width: 1,
      height: 1,
      metadata: {
        sourcePath: "fixture",
        drawOrder: 0,
        sprite: { pivot: { x: 0, y: 0 }, pixelsPerUnit: 1 },
        localTransform: {
          position: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          rotation: { x: 0, y: 0, z: 0 }
        },
        renderer: { color: { r: 1, g: 1, b: 1, a: 1 }, flipX: false, flipY: false }
      }
    }],
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    fingerprint,
    packRoot: "/pack"
  };
}
