import { describe, expect, it } from "vitest";
import type { WorldMapDef } from "@v-ronpa/contracts";
import { resolveExplorationFrameloop, resolveMapModelAsset } from "./stages";

describe("R3F exploration render scheduling", () => {
  it("renders continuously only while exploration is active", () => {
    expect(resolveExplorationFrameloop(true)).toBe("always");
    expect(resolveExplorationFrameloop(false)).toBe("demand");
  });
});

describe("R3F stage asset resolution", () => {
  it("resolves map model assets from id-only WorldMapDef.requirements", () => {
    const calls: unknown[] = [];
    const result = resolveMapModelAsset(mapWithAssets([{ id: "model/academy-hall", capability: "model" }]), {
      resolve(input) {
        calls.push(input);
        return { uri: "/resolved/academy-hall.gltf" };
      }
    });

    expect(calls).toEqual([{ id: "model/academy-hall", capability: "model" }]);
    expect(result).toEqual({ assetId: "model/academy-hall", uri: "/resolved/academy-hall.gltf" });
  });

  it("reports missing model assets through the existing fallback path", () => {
    const result = resolveMapModelAsset(mapWithAssets([{ id: "model/missing", capability: "model" }]), {
      resolve() {
        return { diagnostic: { code: "asset-missing", severity: "error", message: "missing model" } };
      }
    });

    expect(result).toEqual({
      assetId: "model/missing",
      fallbackReason: "asset-error",
      diagnostic: {
        source: "asset",
        code: "asset-missing",
        severity: "error",
        assetId: "model/missing",
        capability: "model",
        message: "missing model"
      }
    });
  });

  it("keeps the no-model fallback for maps without model refs", () => {
    expect(resolveMapModelAsset(mapWithAssets([]), undefined)).toEqual({ fallbackReason: "no-model" });
  });
});

function mapWithAssets(requirements: WorldMapDef["requirements"]): WorldMapDef {
  return {
    id: "map:test",
    name: "Test Map",
    spawn: [0, 1, 2],
    requirements,
    interactables: [],
    collisionProxyIds: []
  };
}
