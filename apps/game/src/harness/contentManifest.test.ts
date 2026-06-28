import { describe, expect, it } from "vitest";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import { ContentManifestSchema } from "@v-ronpa/contracts";
import { builtInPixiFxRuntimeAssets } from "@v-ronpa/pixi-presenter";
import { harnessContentManifest } from "./contentManifest";

describe("harness content manifest", () => {
  it("parses as ContentManifest v2 and resolves declared runtime asset references", () => {
    const manifest = ContentManifestSchema.parse(harnessContentManifest);
    const registry = createAssetRegistry(manifest);

    expect(manifest.version).toBe(2);
    expect(manifest.audio?.dialogueBleep?.enabled).toBe(true);
    expect(manifest.audio?.dialogueBleep?.speakerOverrides).toEqual({
      Felix: { sourceRef: "bleep:dialogue-felix", gain: 0.55 },
      Narrator: null
    });
    expect(registry.diagnostics).toEqual([]);
    expect(registry.validateReferences()).toEqual([]);
    expect(registry.resolve({ id: "bg:harness", kind: "background" }).uri).toBe("/harness/backgrounds/harness.png");
    expect(registry.resolve({ id: "bleep:dialogue-default", kind: "bleep" }).uri).toBe("/harness/media/bleep/dialogue-default.ogg");
    expect(registry.resolve({ id: "bleep:dialogue-felix", kind: "bleep" }).uri).toBe("/harness/media/bleep/dialogue-felix.ogg");
    expect(registry.resolve({ id: "Ema", kind: "character-pack" }).uri).toBe("/harness/characters/Ema/character.json");
    expect(registry.resolve({ id: "model:academy-hall", kind: "glb" }).uri).toBe("/harness/models/academy-hall.gltf");
    expect(registry.resolve({ id: "texture:evidence:keycard-thumbnail", kind: "texture" }).uri).toBe("/harness/thumbnails/evidence-keycard.png");
    expect(registry.resolve({ id: "voice:zh:voice_validation_0001", kind: "voice" }).uri).toBe("/harness/media/voice/zh/voice_validation_0001.ogg");
    expect(registry.resolve({ id: "voice:zh:0102Adv03_Ema001", kind: "voice" }).uri).toBe("/harness/media/voice/zh/0102Adv03_Ema001.ogg");
    expect(registry.resolve({ id: "voice:zh:0102Adv04_Sherry004", kind: "voice" }).uri).toBe("/harness/media/voice/zh/0102Adv04_Sherry004.ogg");
  });

  it("composes Pixi built-in FX assets into the app manifest", () => {
    const manifestAssetIds = new Set(harnessContentManifest.runtimeAssets.map((asset) => asset.id));

    for (const asset of builtInPixiFxRuntimeAssets) {
      expect(manifestAssetIds.has(asset.id)).toBe(true);
    }
  });
});
