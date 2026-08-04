import { describe, expect, it } from "vitest";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import { ContentManifestSchema } from "@v-ronpa/contracts";
import { gameAContentManifest, gameAVnEntry } from "./contentManifest";

describe("game-a content manifest", () => {
  it("publishes one v5 App-relative asset registry", () => {
    const manifest = ContentManifestSchema.parse(gameAContentManifest);
    const registry = createAssetRegistry(manifest);

    expect(manifest.version).toBe(5);
    expect(registry.diagnostics).toEqual([]);
    expect(registry.validateReferences()).toEqual([]);
    expect(manifest.vnEntries).toEqual([gameAVnEntry]);
    expect(new Set(gameAVnEntry.requirements.map(({ id }) => id))).toEqual(new Set([
      "bg/academy-hall",
      "bg/home",
      "bg/inner/snow-outskirts",
      "bgm/dead-fish-riffle",
      "bleep/dialogue",
      "char/alice",
      "sfx/gentle-rain-loop",
      "sfx/glug-glug-glug",
      "sfx/noise-6hz",
      "ui/dialog-frame"
    ]));
    expect(manifest.requirements).toEqual([
      { id: "bg/title", capability: "image" },
      { id: "sfx/ui-hover-default", capability: "audio" },
      { id: "sfx/ui-click-default", capability: "audio" }
    ]);
    expect(manifest.fonts).toEqual([{
      id: "default",
      family: "Fusion Pixel zh-Hans",
      source: { type: "asset", assetId: "font/fusion-pixel-zh-hans" },
      weight: "400",
      style: "normal"
    }]);
  });

  it("resolves stable assets/ URLs by MIME capability", () => {
    const registry = createAssetRegistry(gameAContentManifest, { baseUri: "/subpath/" });

    expect(registry.url({ id: "bg/home", capability: "image" })).toBe("/subpath/assets/bg/home.png");
    expect(registry.url({ id: "bgm/dark-ambient-home", capability: "audio" })).toBe(
      "/subpath/assets/bgm/dark-ambient-home.ogg"
    );
    expect(registry.url({ id: "char/alice", capability: "json" })).toBe(
      "/subpath/assets/char/alice/character.json"
    );
    expect(registry.url({ id: "voice/zh/voice-0001", capability: "audio" })).toBe(
      "/subpath/assets/voice/zh/voice-0001.ogg"
    );
  });
});
