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
          { id: "bg:game-a-room", kind: "background", tags: ["game-a", "vn"] },
          { id: "bgm:game-a-main", kind: "bgm", tags: ["game-a", "vn"] },
          { id: "sfx:game-a-chime", kind: "sfx", tags: ["game-a", "vn"] },
          { id: "bleep:game-a-dialogue", kind: "bleep", tags: ["game-a", "vn"] },
          { id: "voice:zh:game_a_voice_0001", kind: "voice", tags: ["game-a", "vn"] },
          { id: "video:game-a-intro", kind: "video", tags: ["game-a", "vn"] },
          { id: "texture:ui:game-a-dialog-frame", kind: "texture", tags: ["game-a", "ui", "vn"] }
        ])
      })
    ]);
    expect(registry.url({ id: "bg:game-a-room", kind: "background" })).toBe("/game-a/backgrounds/vn-room.png");
    expect(registry.url({ id: "bgm:game-a-main", kind: "bgm" })).toBe("/game-a/media/bgm/main.ogg");
    expect(registry.url({ id: "sfx:game-a-chime", kind: "sfx" })).toBe("/game-a/media/sfx/chime.ogg");
    expect(registry.url({ id: "bleep:game-a-dialogue", kind: "bleep" })).toBe("/game-a/media/bleep/dialogue.ogg");
    expect(registry.url({ id: "voice:zh:game_a_voice_0001", kind: "voice" })).toBe(
      "/game-a/media/voice/zh/game_a_voice_0001.ogg"
    );
    expect(registry.url({ id: "video:game-a-intro", kind: "video" })).toBe("/game-a/media/video/intro.mp4");
    expect(registry.url({ id: "texture:ui:game-a-dialog-frame", kind: "texture" })).toBe(
      "/game-a/ui/dialog-frame.png"
    );
  });
});
