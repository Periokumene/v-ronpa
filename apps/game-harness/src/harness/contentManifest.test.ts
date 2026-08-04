import { describe, expect, it } from "vitest";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import { ContentManifestSchema } from "@v-ronpa/contracts";
import { harnessContentManifest } from "./contentManifest";

describe("harness content manifest", () => {
  it("parses as ContentManifest v5 and resolves all declared requirements", () => {
    const manifest = ContentManifestSchema.parse(harnessContentManifest);
    const registry = createAssetRegistry(manifest);

    expect(manifest.version).toBe(5);
    expect(manifest.audio?.dialogueBleep).toMatchObject({
      defaultSound: { assetId: "bleep/dialogue-default", gain: 0.45 },
      speakerOverrides: {
        Felix: { assetId: "bleep/dialogue-felix", gain: 0.55 },
        Narrator: null
      }
    });
    expect(registry.diagnostics).toEqual([]);
    expect(registry.validateReferences()).toEqual([]);
    expect(registry.resolve({ id: "bg/showcase", capability: "image" }).uri).toBe("/assets/bg/showcase.png");
    expect(registry.resolve({ id: "char/ema", capability: "json" }).uri).toBe("/assets/char/ema/character.json");
    expect(registry.resolve({ id: "font/rich-serif", capability: "font" }).uri).toBe("/assets/font/rich-serif.ttf");
    expect(registry.resolve({ id: "model/academy-hall", capability: "model" }).uri).toBe("/assets/model/academy-hall.gltf");
    expect(registry.resolve({ id: "thumb/evidence-keycard", capability: "image" }).uri).toBe("/assets/thumb/evidence-keycard.png");
    expect(registry.resolve({ id: "voice/zh/0102-adv03-ema001", capability: "audio" }).uri).toBe(
      "/assets/voice/zh/0102-adv03-ema001.ogg"
    );
  });

  it("keeps presenter-private FX out of the App manifest", () => {
    expect(harnessContentManifest.assets.every(({ id }) => !id.startsWith("fx/"))).toBe(true);
  });
});
