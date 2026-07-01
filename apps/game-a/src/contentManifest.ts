import { ContentManifestSchema, type ContentManifestInput } from "@v-ronpa/contracts";
import { gameAFontFaces, gameARuntimeAssets } from "./generatedAssets";

export const gameAVnScriptPath = "game-a/opening.nani";
const GAME_A_MAIN_BACKGROUND_ID = "bg:game-a-academy-hall-fullscreen";
const GAME_A_INNER_BACKGROUND_ID = "bg:game-a-snow-outskirts-frame";

export const gameAVnEntry = {
  id: "vn:game-a-opening",
  title: "Game A Opening",
  scriptPath: gameAVnScriptPath,
  startLabel: "Start",
  profile: "vn2d" as const,
  assetRefs: [
    { id: GAME_A_MAIN_BACKGROUND_ID, kind: "background" as const, tags: ["game-a", "vn"] },
    { id: GAME_A_INNER_BACKGROUND_ID, kind: "background" as const, tags: ["game-a", "vn"] },
    { id: "bgm:game-a-main", kind: "bgm" as const, tags: ["game-a", "vn"] },
    { id: "sfx:game-a-chime", kind: "sfx" as const, tags: ["game-a", "vn"] },
    { id: "bleep:game-a-dialogue", kind: "bleep" as const, tags: ["game-a", "vn"] },
    { id: "voice:zh:game_a_voice_0001", kind: "voice" as const, tags: ["game-a", "vn"] },
    { id: "video:game-a-intro", kind: "video" as const, tags: ["game-a", "vn"] },
    { id: "texture:ui:game-a-dialog-frame", kind: "texture" as const, tags: ["game-a", "ui", "vn"] }
  ]
};

const gameAContentManifestInput = {
  version: 3,
  assets: [],
  audio: {
    dialogueBleep: {
      enabled: true,
      defaultSound: { sourceRef: "bleep:game-a-dialogue", gain: 1 },
      speakerOverrides: {}
    }
  },
  fonts: gameAFontFaces,
  runtimeAssets: gameARuntimeAssets,
  collisionProxies: [],
  vnEntries: [gameAVnEntry],
  maps: [],
  items: [],
  evidence: [],
  trials: []
} satisfies ContentManifestInput;

export const gameAContentManifest = ContentManifestSchema.parse(gameAContentManifestInput);
