import { describe, expect, it } from "vitest";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import { gameAContentManifest, gameAVnEntry } from "./contentManifest";

describe("game-a content manifest", () => {
  it("declares its VN entry and resolves referenced assets through AssetRegistry", () => {
    const registry = createAssetRegistry(gameAContentManifest);

    expect(registry.diagnostics).toEqual([]);
    expect(registry.validateReferences()).toEqual([]);
    expect(gameAContentManifest.vnEntries).toHaveLength(1);
    expect(gameAContentManifest.vnEntries[0]).toMatchObject({
      id: gameAVnEntry.id,
      scriptPath: gameAVnEntry.scriptPath,
      scriptRevision: gameAVnEntry.scriptRevision
    });
    expect(new Set(gameAVnEntry.assetRefs.map((ref) => ref.id))).toEqual(
      new Set([
        "alice",
        "bg:home-outside",
        "bgm:dead-fish-riffle",
        "sfx:gentle-rain-loop",
        "sfx:glug-glug-glug",
        "sfx:noise-6hz",
        "bleep:game-a-dialogue",
        "texture:ui:game-a-dialog-frame",
        "bg:game-a-academy-hall-fullscreen",
        "bg:game-a-snow-outskirts-frame"
      ])
    );
    expect(gameAContentManifest.vnEntries.some((entry) => entry.id === "vn:game-a-smoke")).toBe(false);
    expect(gameAContentManifest.assets).toEqual([
      { id: "sfx:ui-hover-default", kind: "sfx", tags: ["game-a", "ui"] },
      { id: "sfx:ui-click-default", kind: "sfx", tags: ["game-a", "ui"] }
    ]);
    expect(gameAContentManifest.runtimeAssets.some((asset) => asset.id === "fx:noise")).toBe(true);
    expect(gameAContentManifest.fonts).toEqual([
      {
        id: "font:fusion-pixel-zh-hans",
        family: "Fusion Pixel 12px zh-Hans",
        sourceRef: "font:fusion-pixel-12px-proportional-zh-hans",
        weight: "400",
        style: "normal"
      }
    ]);
    expect(registry.url({ id: "bg:game-a-academy-hall-fullscreen", kind: "background" })).toBe(
      "/game-a/backgrounds/game-a-academy-hall-fullscreen.png"
    );
    expect(registry.url({ id: "bg:game-a-snow-outskirts-frame", kind: "background" })).toBe(
      "/game-a/backgrounds/game-a-snow-outskirts-frame.png"
    );
    expect(registry.url({ id: "bg:home-outside", kind: "background" })).toBe("/game-a/backgrounds/home-outside.png");
    expect(registry.url({ id: "bgm:dead-fish-riffle", kind: "bgm" })).toBe(
      "/game-a/media/bgm/dead-fish-riffle.mp3"
    );
    expect(registry.url({ id: "bgm:game-a-main", kind: "bgm" })).toBe("/game-a/media/bgm/game-a-main.ogg");
    expect(registry.url({ id: "sfx:game-a-chime", kind: "sfx" })).toBe("/game-a/media/sfx/game-a-chime.ogg");
    expect(registry.url({ id: "sfx:gentle-rain-loop", kind: "sfx" })).toBe(
      "/game-a/media/sfx/gentle-rain-loop.mp3"
    );
    expect(registry.url({ id: "sfx:glug-glug-glug", kind: "sfx" })).toBe(
      "/game-a/media/sfx/glug-glug-glug.mp3"
    );
    expect(registry.url({ id: "sfx:noise-6hz", kind: "sfx" })).toBe("/game-a/media/sfx/noise-6hz.mp3");
    expect(registry.url({ id: "sfx:ui-hover-default", kind: "sfx" })).toBe(
      "/game-a/media/sfx/ui-hover-default.ogg"
    );
    expect(registry.url({ id: "sfx:ui-click-default", kind: "sfx" })).toBe(
      "/game-a/media/sfx/ui-click-default.ogg"
    );
    expect(registry.url({ id: "bleep:game-a-dialogue", kind: "bleep" })).toBe("/game-a/media/bleep/game-a-dialogue.ogg");
    expect(registry.url({ id: "voice:zh:game_a_voice_0001", kind: "voice" })).toBe(
      "/game-a/media/voice/zh/game_a_voice_0001.ogg"
    );
    expect(registry.url({ id: "video:game-a-intro", kind: "video" })).toBe("/game-a/media/video/game-a-intro.mp4");
    expect(registry.url({ id: "texture:ui:game-a-dialog-frame", kind: "texture" })).toBe(
      "/game-a/ui/game-a-dialog-frame.png"
    );
    expect(registry.url({ id: "alice", kind: "character-pack" })).toBe(
      "/game-a/characters/alice/character.json"
    );
    expect(registry.url({ id: "font:fusion-pixel-12px-proportional-zh-hans", kind: "font" })).toBe(
      "/game-a/fonts/fusion-pixel-12px-proportional-zh-hans.woff2"
    );
  });
});
