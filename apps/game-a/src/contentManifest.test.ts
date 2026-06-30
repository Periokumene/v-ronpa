import { describe, expect, it } from "vitest";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import { gameAContentManifest, gameAVnEntry } from "./contentManifest";

describe("game-a content manifest", () => {
  it("declares its VN entry and resolves referenced assets through AssetRegistry", () => {
    const registry = createAssetRegistry(gameAContentManifest);

    expect(registry.diagnostics).toEqual([]);
    expect(registry.validateReferences()).toEqual([]);
    expect(gameAContentManifest.vnEntries).toEqual([
      expect.objectContaining({
        id: gameAVnEntry.id,
        scriptPath: gameAVnEntry.scriptPath,
        assetRefs: [{ id: "bg:game-a-room", kind: "background", tags: ["game-a", "vn"] }]
      })
    ]);
    expect(registry.url({ id: "bg:game-a-room", kind: "background" })).toBe("/game-a/backgrounds/vn-room.png");
  });
});
