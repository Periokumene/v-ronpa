import { describe, expect, it } from "vitest";
import { composeContentManifest, createAssetRegistry } from "@v-ronpa/asset-registry";
import { PIXI_FX_ASSET_IDS, pixiRuntimeAssetFragment, pixiRuntimeAssetId } from "./index";

describe("runtime-assets-pixi", () => {
  it("participates in the one final AssetRegistry through the shared fragment protocol", () => {
    const manifest = composeContentManifest(
      {
        version: 3,
        assets: [],
        runtimeAssets: [],
        collisionProxies: [],
        vnEntries: [],
        maps: [],
        items: [],
        evidence: [],
        trials: []
      },
      [pixiRuntimeAssetFragment]
    );
    const registry = createAssetRegistry(manifest);

    expect(registry.diagnostics).toEqual([]);
    for (const id of PIXI_FX_ASSET_IDS) {
      expect(registry.resolve({ id: pixiRuntimeAssetId(id), kind: "fx" }).uri).toBeTruthy();
    }
  });
});
