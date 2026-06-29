import { ContentManifestSchema, type ContentManifestInput } from "@v-ronpa/contracts";
import { builtInPixiFxRuntimeAssets } from "@v-ronpa/pixi-presenter";
import { defaultHarnessInputBindings } from "./inputActions";
import { verticalSliceEvidence, verticalSliceItem, verticalSliceMaps, verticalSliceTrial } from "./fixtures/verticalSlice";
import { harnessRuntimeAssets } from "./generatedAssets";

const harnessContentManifestInput = {
  version: 2,
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
  fonts: [
    {
      id: "font:serif",
      family: "V Ronpa Rich Serif",
      sourceRef: "font:rich-serif",
      weight: "400",
      style: "normal"
    }
  ],
  uiAssets: [],
  interactionStyles: [],
  runtimeAssets: [
    ...harnessRuntimeAssets,
    ...builtInPixiFxRuntimeAssets
  ],
  collisionProxies: [],
  input: defaultHarnessInputBindings,
  maps: verticalSliceMaps,
  items: [verticalSliceItem],
  evidence: [verticalSliceEvidence],
  trials: [verticalSliceTrial]
} satisfies ContentManifestInput;

export const harnessContentManifest = ContentManifestSchema.parse(harnessContentManifestInput);
