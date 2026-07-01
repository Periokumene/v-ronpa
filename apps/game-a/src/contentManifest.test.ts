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
        assetRefs: expect.arrayContaining([
          { id: "bg:game-a-academy-hall-fullscreen", kind: "background", tags: ["game-a", "vn"] },
          { id: "bg:game-a-snow-outskirts-frame", kind: "background", tags: ["game-a", "vn"] },
          { id: "bgm:game-a-main", kind: "bgm", tags: ["game-a", "vn"] },
          { id: "sfx:game-a-chime", kind: "sfx", tags: ["game-a", "vn"] },
          { id: "bleep:game-a-dialogue", kind: "bleep", tags: ["game-a", "vn"] },
          { id: "voice:zh:game_a_voice_0001", kind: "voice", tags: ["game-a", "vn"] },
          { id: "video:game-a-intro", kind: "video", tags: ["game-a", "vn"] },
          { id: "texture:ui:game-a-dialog-frame", kind: "texture", tags: ["game-a", "ui", "vn"] }
        ])
      })
    ]);
    expect(gameAContentManifest.fonts).toEqual([
      {
        id: "font:jinghua-laosong-gb",
        family: "font:jinghua-laosong-gb",
        sourceRef: "font:jinghua-laosong-gb",
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
    expect(registry.url({ id: "bgm:game-a-main", kind: "bgm" })).toBe("/game-a/media/bgm/game-a-main.ogg");
    expect(registry.url({ id: "sfx:game-a-chime", kind: "sfx" })).toBe("/game-a/media/sfx/game-a-chime.ogg");
    expect(registry.url({ id: "bleep:game-a-dialogue", kind: "bleep" })).toBe("/game-a/media/bleep/game-a-dialogue.ogg");
    expect(registry.url({ id: "voice:zh:game_a_voice_0001", kind: "voice" })).toBe(
      "/game-a/media/voice/zh/game_a_voice_0001.ogg"
    );
    expect(registry.url({ id: "video:game-a-intro", kind: "video" })).toBe("/game-a/media/video/game-a-intro.mp4");
    expect(registry.url({ id: "texture:ui:game-a-dialog-frame", kind: "texture" })).toBe(
      "/game-a/ui/game-a-dialog-frame.png"
    );
    expect(registry.url({ id: "font:jinghua-laosong-gb", kind: "font" })).toBe(
      "/game-a/fonts/jinghua-laosong-gb.woff2"
    );
  });
});
