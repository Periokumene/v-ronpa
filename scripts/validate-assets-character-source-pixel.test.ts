import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LayeredCharacterLayerMetadataSchema,
  LayeredCharacterLayersSchema,
  type LayeredCharacterLayerMetadata
} from "../packages/contracts/src/index";
import {
  resolveLayeredCharacterSourcePixelScale,
  type LayeredCharacterSourcePixelLayer
} from "../packages/layered-character/src/index";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("shipped character-pack source-pixel validation", () => {
  it("accepts the current Alice and Ema packs at their canonical source-pixel units", () => {
    expect(resolveLayeredCharacterSourcePixelScale(loadPackLayers("apps/game-a/public/game-a/characters/alice")))
      .toEqual({ ok: true, unitsPerPixel: 1 });
    expect(resolveLayeredCharacterSourcePixelScale(loadPackLayers("apps/game-harness/public/harness/characters/Ema")))
      .toEqual({ ok: true, unitsPerPixel: 0.006 });
  });

  it("rejects zero, non-square, and mixed-density pack fixtures", () => {
    const source = loadPackLayers("apps/game-a/public/game-a/characters/alice");
    const zero = cloneLayers(source);
    zero[0]!.metadata.localTransform.scale.x = 0;
    expect(resolveLayeredCharacterSourcePixelScale(zero)).toMatchObject({
      ok: false,
      code: "invalid-source-pixel-scale"
    });

    const nonSquare = cloneLayers(source);
    nonSquare[0]!.metadata.localTransform.scale.y = 2;
    expect(resolveLayeredCharacterSourcePixelScale(nonSquare)).toMatchObject({
      ok: false,
      code: "non-square-source-pixels"
    });

    const mixed = cloneLayers(source);
    mixed[1]!.metadata.localTransform.scale.x = 2;
    mixed[1]!.metadata.localTransform.scale.y = 2;
    expect(resolveLayeredCharacterSourcePixelScale(mixed)).toMatchObject({
      ok: false,
      code: "inconsistent-source-pixel-scale"
    });
  });
});

function loadPackLayers(relativePackRoot: string): LayeredCharacterSourcePixelLayer[] {
  const packRoot = join(repoRoot, relativePackRoot);
  const layers = LayeredCharacterLayersSchema.parse(readJson(join(packRoot, "layers.json")));
  return Object.entries(layers.groups).flatMap(([groupName, group]) => (
    Object.entries(group.layers).map(([layerName, ref]) => ({
      id: `${groupName}>${layerName}`,
      metadata: LayeredCharacterLayerMetadataSchema.parse(readJson(join(packRoot, ref.metadata)))
    }))
  ));
}

function cloneLayers(layers: LayeredCharacterSourcePixelLayer[]): Array<{
  id: string;
  metadata: LayeredCharacterLayerMetadata;
}> {
  return layers.map((layer) => ({ id: layer.id, metadata: structuredClone(layer.metadata) }));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}
