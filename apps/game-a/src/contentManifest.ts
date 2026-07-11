import { composeContentManifest } from "@v-ronpa/asset-registry";
import type { ContentManifestInput } from "@v-ronpa/contracts";
import {
  gameAFontFaces,
  gameARuntimeAssetFragments,
  gameARuntimeAssets,
  gameAScriptMetadataByPath
} from "./generatedAssets";

export const gameAVnScriptPath = "game-a/opening.nani";
const GAME_A_MAIN_BACKGROUND_ID = "bg:game-a-academy-hall-fullscreen";
const GAME_A_INNER_BACKGROUND_ID = "bg:game-a-snow-outskirts-frame";
const gameAOpeningScriptMetadata = gameAScriptMetadataByPath[gameAVnScriptPath];
if (!gameAOpeningScriptMetadata) throw new Error(`Missing generated metadata for '${gameAVnScriptPath}'.`);

export const gameAVnEntry = {
  id: "vn:game-a-opening",
  title: "Game A Opening",
  scriptPath: gameAVnScriptPath,
  scriptRevision: gameAOpeningScriptMetadata.scriptRevision,
  startLabel: "Start",
  profile: "vn2d" as const,
  assetRefs: [
    ...gameAOpeningScriptMetadata.assetRefs,
    { id: "bleep:game-a-dialogue", kind: "bleep" as const, tags: ["game-a", "vn"] },
    { id: "texture:ui:game-a-dialog-frame", kind: "texture" as const, tags: ["game-a", "ui", "vn"] },
    { id: GAME_A_MAIN_BACKGROUND_ID, kind: "background" as const, tags: ["game-a", "preload", "vn"] },
    { id: GAME_A_INNER_BACKGROUND_ID, kind: "background" as const, tags: ["game-a", "preload", "vn"] }
  ]
};

const gameAContentManifestInput = {
  version: 3,
  assets: [
    { id: "sfx:ui-hover-default", kind: "sfx" as const, tags: ["game-a", "ui"] },
    { id: "sfx:ui-click-default", kind: "sfx" as const, tags: ["game-a", "ui"] }
  ],
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

export const gameAContentManifest = composeContentManifest(gameAContentManifestInput, gameARuntimeAssetFragments);
