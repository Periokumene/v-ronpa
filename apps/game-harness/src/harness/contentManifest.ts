import type { ContentManifestInput } from "@v-ronpa/contracts";
import { ContentManifestSchema } from "@v-ronpa/contracts";
import { defaultHarnessInputBindings } from "./inputActions";
import { harnessShowcaseEvidence, harnessShowcaseItem, harnessShowcaseMaps, harnessShowcaseTrial } from "./showcase";
import { harnessAssets } from "./generatedAssets";
import {
  harnessVnEntryLocator,
  harnessScriptMetadataByPath
} from "./generatedNaniProduction";

export const harnessShowcaseScriptPath = harnessVnEntryLocator.initialScriptPath;
const harnessShowcaseScriptMetadata = harnessScriptMetadataByPath[harnessShowcaseScriptPath];
if (!harnessShowcaseScriptMetadata) throw new Error(`Missing generated metadata for '${harnessShowcaseScriptPath}'.`);

export const harnessShowcaseCharacterPreloadPlan = harnessShowcaseScriptMetadata.characterPreloadPlan;

export const harnessShowcaseVnEntry = {
  ...harnessVnEntryLocator,
  title: "Harness Showcase",
  profile: "vn2d" as const,
  requirements: harnessShowcaseScriptMetadata.requirements
};

const harnessContentManifestInput = {
  version: 5,
  assets: harnessAssets,
  requirements: [],
  audio: {
    dialogueBleep: {
      defaultSound: { assetId: "bleep/dialogue-default", gain: 0.45 },
      speakerOverrides: {
        Felix: { assetId: "bleep/dialogue-felix", gain: 0.55 },
        Narrator: null
      }
    }
  },
  fonts: [{
    id: "serif",
    family: "V Ronpa Rich Serif",
    source: { type: "asset", assetId: "font/rich-serif" },
    weight: "400",
    style: "normal"
  }],
  collisionProxies: [],
  input: defaultHarnessInputBindings,
  maps: harnessShowcaseMaps,
  items: [harnessShowcaseItem],
  evidence: [harnessShowcaseEvidence],
  trials: [harnessShowcaseTrial],
  vnEntries: [harnessShowcaseVnEntry]
} satisfies ContentManifestInput;

export const harnessContentManifest = ContentManifestSchema.parse(harnessContentManifestInput);
