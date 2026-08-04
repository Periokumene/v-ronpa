import type { AssetRequirement, ContentManifestInput } from "@v-ronpa/contracts";
import { ContentManifestSchema } from "@v-ronpa/contracts";
import { gameAAssets } from "./generatedAssets";
import {
  gameAVnEntryLocator,
  gameAScriptMetadataByPath
} from "./generatedNaniProduction";

const gameAScriptRequirements = Object.values(gameAScriptMetadataByPath)
  .flatMap((metadata) => metadata.requirements);

export const gameAVnEntry = {
  ...gameAVnEntryLocator,
  title: "Game A",
  profile: "vn2d" as const,
  requirements: dedupeRequirements([
    ...gameAScriptRequirements,
    { id: "bleep/dialogue", capability: "audio" },
    { id: "ui/dialog-frame", capability: "image" },
    { id: "bg/academy-hall", capability: "image" },
    { id: "bg/inner/snow-outskirts", capability: "image" }
  ])
};

const gameAContentManifestInput = {
  version: 5,
  assets: gameAAssets,
  requirements: [
    { id: "bg/title", capability: "image" },
    { id: "sfx/ui-hover-default", capability: "audio" },
    { id: "sfx/ui-click-default", capability: "audio" }
  ],
  audio: {
    dialogueBleep: {
      enabled: true,
      defaultSound: { assetId: "bleep/dialogue", gain: 1 },
      speakerOverrides: {}
    }
  },
  fonts: [{
    id: "default",
    family: "Fusion Pixel zh-Hans",
    source: { type: "asset", assetId: "font/fusion-pixel-zh-hans" },
    weight: "400",
    style: "normal"
  }],
  collisionProxies: [],
  vnEntries: [gameAVnEntry],
  maps: [],
  items: [],
  evidence: [],
  trials: []
} satisfies ContentManifestInput;

export const gameAContentManifest = ContentManifestSchema.parse(gameAContentManifestInput);

function dedupeRequirements(requirements: readonly AssetRequirement[]): AssetRequirement[] {
  return [...new Map(requirements.map((requirement) => [
    `${requirement.capability}:${requirement.id}`,
    requirement
  ])).values()];
}
