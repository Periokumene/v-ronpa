import { describe, expect, it } from "vitest";
import type { ContentManifest } from "@v-ronpa/contracts";
import {
  collectManifestAssetRequirements,
  createAssetRegistry,
  isRawAssetReference,
  mimeSupportsCapability
} from "./index";

describe("app-owned AssetRegistry", () => {
  it("resolves App-relative assets against root and subpath base URIs", () => {
    const manifest = baseManifest();
    expect(createAssetRegistry(manifest).url({ id: "bg/home", capability: "image" }))
      .toBe("/assets/bg/home.png");
    expect(createAssetRegistry(manifest, { baseUri: "/games/a/" }).url({ id: "bg/home", capability: "image" }))
      .toBe("/games/a/assets/bg/home.png");
    expect(createAssetRegistry(manifest, { baseUri: "https://cdn.example/game/" }).url({ id: "bg/home", capability: "image" }))
      .toBe("https://cdn.example/game/assets/bg/home.png");
  });

  it("reports missing, invalid, raw URI, duplicate and capability mismatch diagnostics", () => {
    const registry = createAssetRegistry({
      ...baseManifest(),
      assets: [
        ...baseManifest().assets,
        { id: "bg/home", uri: "assets/bg/duplicate.png", mimeType: "image/png" }
      ]
    });
    expect(registry.diagnostics).toEqual([
      expect.objectContaining({ code: "duplicate-asset", id: "bg/home" })
    ]);
    expect(registry.resolve({ id: "missing/asset", capability: "image" }).diagnostic?.code).toBe("asset-missing");
    expect(registry.resolve({ id: "bg:home", capability: "image" }).diagnostic?.code).toBe("invalid-asset-id");
    expect(registry.resolve({ id: "/assets/bg/home.png", capability: "image" }).diagnostic?.code).toBe("raw-uri-disallowed");
    expect(registry.resolve({ id: "bg/home", capability: "audio" }).diagnostic?.code).toBe("asset-capability-mismatch");
  });

  it("collects requirements from every manifest consumer and deduplicates by capability", () => {
    const requirements = collectManifestAssetRequirements(baseManifest());
    expect(requirements).toEqual(expect.arrayContaining([
      { id: "bg/home", capability: "image" },
      { id: "bleep/dialogue", capability: "audio" },
      { id: "font/default", capability: "font" },
      { id: "model/hall", capability: "model" }
    ]));
  });

  it("treats capability as MIME loading ability rather than business use", () => {
    expect(mimeSupportsCapability("image/png", "image")).toBe(true);
    expect(mimeSupportsCapability("image/png", "audio")).toBe(false);
    expect(isRawAssetReference("https://example.test/a.png")).toBe(true);
    const registry = createAssetRegistry(baseManifest());
    expect(registry.resolve({ id: "bg/home", capability: "image" }).uri).toBeDefined();
    expect(registry.resolve({ id: "bg/home", capability: "image" }).uri).toBeDefined();
  });
});

function baseManifest(): ContentManifest {
  return {
    version: 5,
    assets: [
      { id: "bg/home", uri: "assets/bg/home.png", mimeType: "image/png" },
      { id: "bleep/dialogue", uri: "assets/bleep/dialogue.ogg", mimeType: "audio/ogg" },
      { id: "font/default", uri: "assets/font/default.woff2", mimeType: "font/woff2" },
      { id: "model/hall", uri: "assets/model/hall.gltf", mimeType: "model/gltf+json" }
    ],
    requirements: [{ id: "bg/home", capability: "image" }],
    audio: { dialogueBleep: { enabled: true, defaultSound: { assetId: "bleep/dialogue", gain: 1 }, speakerOverrides: {} } },
    fonts: [{
      id: "default",
      family: "Default",
      source: { type: "asset", assetId: "font/default" },
      weight: "400",
      style: "normal"
    }],
    collisionProxies: [{ id: "collision:hall", kind: "trimesh", assetId: "model/hall" }],
    vnEntries: [],
    maps: [],
    items: [],
    evidence: [],
    trials: []
  };
}
