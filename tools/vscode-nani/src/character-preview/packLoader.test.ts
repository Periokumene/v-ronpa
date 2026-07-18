import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadResolvedCharacterPreview, pngDimensions } from "./packLoader";
import type { CharacterPreviewRequest } from "./types";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("layered character preview pack loading", () => {
  it("loads only active metadata and PNG files in resolver order", async () => {
    const fixture = packFixture();
    const reads: string[] = [];
    const loaded = await loadResolvedCharacterPreview(fixture.descriptor, request("EYE1"), async (path) => {
      reads.push(path);
      return import("node:fs/promises").then((fs) => fs.readFile(path));
    });

    expect(loaded.layers.map((layer) => layer.id)).toEqual(["MAIN>BODY", "MAIN/EYE>1"]);
    expect(loaded.layers.map((layer) => [layer.width, layer.height])).toEqual([[1, 1], [1, 1]]);
    expect(reads).toContain(join(fixture.root, "assets/layers/BODY.png"));
    expect(reads).toContain(join(fixture.root, "assets/layers/EYE1.png"));
    expect(reads).not.toContain(join(fixture.root, "assets/layers/EYE0.png"));
    expect(reads).not.toContain(join(fixture.root, "assets/layers/EYE0.json"));
    expect(loaded.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("rejects unknown appearance tokens without reading any PNG", async () => {
    const fixture = packFixture();
    const reads: string[] = [];
    await expect(loadResolvedCharacterPreview(fixture.descriptor, request("Missing"), async (path) => {
      reads.push(path);
      return import("node:fs/promises").then((fs) => fs.readFile(path));
    })).rejects.toMatchObject({ code: "invalid-appearance" });
    expect(reads.some((path) => path.endsWith(".png"))).toBe(false);
  });

  it("reports missing active metadata and malformed PNGs as local preview failures", async () => {
    const fixture = packFixture();
    rmSync(join(fixture.root, "assets/layers/EYE1.json"));
    await expect(loadResolvedCharacterPreview(fixture.descriptor, request("EYE1")))
      .rejects.toMatchObject({ code: "pack-load-failed" });

    const second = packFixture();
    writeFileSync(join(second.root, "assets/layers/EYE1.png"), "not png");
    await expect(loadResolvedCharacterPreview(second.descriptor, request("EYE1")))
      .rejects.toMatchObject({ code: "invalid-png" });
  });

  it("reads PNG IHDR dimensions without decoding image content", () => {
    expect(pngDimensions(png1x1())).toEqual({ width: 1, height: 1 });
    expect(() => pngDimensions(Buffer.from("bad"))).toThrow(/PNG/u);
  });

  it("assembles the real Alice default and multi-token compositions", async () => {
    const root = resolve(process.cwd(), "../../apps/game-a/public/game-a/characters/alice");
    const descriptor = { id: "alice", rootPath: root, characterPath: join(root, "character.json") };
    const defaultPreview = await loadResolvedCharacterPreview(descriptor, request(""));
    const expressionPreview = await loadResolvedCharacterPreview(
      descriptor,
      request("EYE4,MOUTH5,ArmL4,ArmR2,EFFECT0")
    );

    expect(defaultPreview.layers.length).toBeGreaterThan(0);
    expect(expressionPreview.layers.map((layer) => layer.id)).toEqual(expect.arrayContaining([
      "MAIN/EYE>4",
      "MAIN/MOUTH>5",
      "MAIN/ArmL>4",
      "MAIN/ArmR>2",
      "MAIN/EFFECT>0"
    ]));
    expect(expressionPreview.bounds.maxX).toBeGreaterThan(expressionPreview.bounds.minX);
    expect(expressionPreview.bounds.maxY).toBeGreaterThan(expressionPreview.bounds.minY);
  });
});

function packFixture() {
  const root = mkdtempSync(join(tmpdir(), "vscode-nani-char-pack-"));
  roots.push(root);
  mkdirSync(join(root, "assets/layers"), { recursive: true });
  writeJson(join(root, "character.json"), {
    id: "alice",
    defaultComposition: ["Default"],
    renderSpace: { stageScale: 1, characterAnchor: [0, 0] }
  });
  writeJson(join(root, "layers.json"), {
    groups: {
      MAIN: { layers: { BODY: { src: "assets/layers/BODY.png", metadata: "assets/layers/BODY.json" } } },
      "MAIN/EYE": {
        layers: {
          "0": { src: "assets/layers/EYE0.png", metadata: "assets/layers/EYE0.json" },
          "1": { src: "assets/layers/EYE1.png", metadata: "assets/layers/EYE1.json" }
        }
      }
    }
  });
  writeJson(join(root, "compositions.json"), {
    tokens: {
      Default: ["MAIN>BODY", "MAIN/EYE>0"],
      EYE1: ["MAIN/EYE>1"]
    }
  });
  writeJson(join(root, "assets/layers/BODY.json"), metadata(0));
  writeJson(join(root, "assets/layers/EYE0.json"), metadata(1));
  writeJson(join(root, "assets/layers/EYE1.json"), metadata(2));
  for (const name of ["BODY.png", "EYE0.png", "EYE1.png"]) {
    writeFileSync(join(root, "assets/layers", name), png1x1());
  }
  return {
    root,
    descriptor: { id: "alice", rootPath: root, characterPath: join(root, "character.json") }
  };
}

function request(appearanceExpression: string): CharacterPreviewRequest {
  return {
    documentUri: "file:///story.nani",
    documentVersion: 1,
    line: 0,
    identityRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 20 } },
    characterId: "alice",
    appearanceExpression
  };
}

function metadata(drawOrder: number) {
  return {
    sourcePath: `fixture/${drawOrder}`,
    drawOrder,
    sprite: { pivot: { x: 0, y: 0 }, pixelsPerUnit: 1 },
    localTransform: {
      position: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0 }
    },
    renderer: { color: { r: 1, g: 1, b: 1, a: 1 }, flipX: false, flipY: false }
  };
}

function png1x1(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lBY8WQAAAABJRU5ErkJggg==",
    "base64"
  );
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
