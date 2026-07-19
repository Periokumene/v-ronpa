import { composeContentManifest } from "@v-ronpa/asset-registry";
import type { ContentManifestInput } from "@v-ronpa/contracts";
import { defaultHarnessInputBindings } from "./inputActions";
import { harnessShowcaseEvidence, harnessShowcaseItem, harnessShowcaseMaps, harnessShowcaseTrial } from "./showcase";
import {
  harnessFontFaces,
  harnessRuntimeAssetFragments,
  harnessRuntimeAssets,
  harnessScriptMetadataByPath
} from "./generatedAssets";

export const harnessShowcaseScriptPath = "harness/harness-showcase.nani";
const harnessShowcaseScriptMetadata = harnessScriptMetadataByPath[harnessShowcaseScriptPath];
if (!harnessShowcaseScriptMetadata) throw new Error(`Missing generated metadata for '${harnessShowcaseScriptPath}'.`);

export const harnessShowcaseCharacterPreloadPlan = harnessShowcaseScriptMetadata.characterPreloadPlan;

export const harnessShowcaseVnEntry = {
  id: "vn:harness-showcase",
  title: "Harness Showcase",
  initialScriptPath: harnessShowcaseScriptPath,
  startLabel: "Start",
  profile: "vn2d" as const,
  assetRefs: harnessShowcaseScriptMetadata.assetRefs
};

const harnessContentManifestInput = {
  version: 4,
  audio: {
    dialogueBleep: {
      defaultSound: { sourceRef: "bleep:dialogue-default", gain: 0.45 },
      speakerOverrides: {
        Felix: { sourceRef: "bleep:dialogue-felix", gain: 0.55 },
        Narrator: null
      }
    }
  },
  assets: [],
  fonts: harnessFontFaces,
  runtimeAssets: harnessRuntimeAssets,
  collisionProxies: [],
  input: defaultHarnessInputBindings,
  maps: harnessShowcaseMaps,
  items: [harnessShowcaseItem],
  evidence: [harnessShowcaseEvidence],
  trials: [harnessShowcaseTrial],
  vnEntries: [harnessShowcaseVnEntry]
} satisfies ContentManifestInput;

export const harnessContentManifest = composeContentManifest(harnessContentManifestInput, harnessRuntimeAssetFragments);
