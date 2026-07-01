import { ContentManifestSchema, type ContentManifestInput } from "@v-ronpa/contracts";
import { builtInPixiFxRuntimeAssets } from "@v-ronpa/pixi-presenter";
import { defaultHarnessInputBindings } from "./inputActions";
import { harnessShowcaseEvidence, harnessShowcaseItem, harnessShowcaseMaps, harnessShowcaseTrial } from "./showcase";
import { harnessFontFaces, harnessRuntimeAssets } from "./generatedAssets";

const harnessContentManifestInput = {
  version: 3,
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
  runtimeAssets: [
    ...harnessRuntimeAssets,
    ...builtInPixiFxRuntimeAssets
  ],
  collisionProxies: [],
  input: defaultHarnessInputBindings,
  maps: harnessShowcaseMaps,
  items: [harnessShowcaseItem],
  evidence: [harnessShowcaseEvidence],
  trials: [harnessShowcaseTrial]
} satisfies ContentManifestInput;

export const harnessContentManifest = ContentManifestSchema.parse(harnessContentManifestInput);
