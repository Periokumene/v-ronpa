import { describe, expect, it } from "vitest";
import type { WorldMapDef } from "@v-ronpa/contracts";
import { resolveMapModelAsset } from "./stages";

describe("R3F stage asset resolution", () => {
  it("resolves map model assets from id-only WorldMapDef.assetRefs", () => {
    const calls: unknown[] = [];
    const result = resolveMapModelAsset(mapWithAssets([{ id: "model:academy-hall", kind: "glb", tags: [] }]), {
      resolve(input) {
        calls.push(input);
        return { uri: "/resolved/academy-hall.gltf" };
      }
    });

    expect(calls).toEqual([{ id: "model:academy-hall", kind: "glb" }]);
    expect(result).toEqual({ assetId: "model:academy-hall", uri: "/resolved/academy-hall.gltf" });
  });

  it("reports missing model assets through the existing fallback path", () => {
    const result = resolveMapModelAsset(mapWithAssets([{ id: "model:missing", kind: "glb", tags: [] }]), {
      resolve() {
        return { diagnostic: { code: "asset-missing", severity: "error", message: "missing model" } };
      }
    });

    expect(result).toEqual({
      assetId: "model:missing",
      fallbackReason: "asset-error",
      diagnostic: {
        source: "asset",
        code: "asset-missing",
        severity: "error",
        assetId: "model:missing",
        kind: "glb",
        message: "missing model"
      }
    });
  });

  it("keeps the no-model fallback for maps without model refs", () => {
    expect(resolveMapModelAsset(mapWithAssets([]), undefined)).toEqual({ fallbackReason: "no-model" });
  });
});

function mapWithAssets(assetRefs: WorldMapDef["assetRefs"]): WorldMapDef {
  return {
    id: "map:test",
    name: "Test Map",
    spawn: [0, 1, 2],
    assetRefs,
    interactables: [],
    collisionProxyIds: []
  };
}
