import { composeContentManifest } from "@v-ronpa/asset-registry";
import type { ContentManifestInput } from "@v-ronpa/contracts";
import {
  gameAFontFaces,
  gameARuntimeAssetFragments,
  gameARuntimeAssets,
  gameAVnEntryLocator,
  gameAScriptMetadataByPath
} from "./generatedAssets";

const GAME_A_MAIN_BACKGROUND_ID = "bg:game-a-academy-hall-fullscreen";
const GAME_A_INNER_BACKGROUND_ID = "bg:game-a-snow-outskirts-frame";
const gameAScriptAssetRefs = Object.values(gameAScriptMetadataByPath).flatMap((metadata) => metadata.assetRefs);

export const gameAVnEntry = {
  ...gameAVnEntryLocator,
  title: "Game A",
  profile: "vn2d" as const,
  assetRefs: [
    ...dedupeAssetRefs(gameAScriptAssetRefs),
    { id: "bleep:game-a-dialogue", kind: "bleep" as const, tags: ["game-a", "vn"] },
    { id: "texture:ui:game-a-dialog-frame", kind: "texture" as const, tags: ["game-a", "ui", "vn"] },
    { id: GAME_A_MAIN_BACKGROUND_ID, kind: "background" as const, tags: ["game-a", "preload", "vn"] },
    { id: GAME_A_INNER_BACKGROUND_ID, kind: "background" as const, tags: ["game-a", "preload", "vn"] }
  ]
};

const gameAContentManifestInput = {
  version: 4,
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

function dedupeAssetRefs<T extends { id: string; kind: string }>(refs: readonly T[]): T[] {
  return [...new Map(refs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values()];
}
