import type { ContentManifest } from "@v-ronpa/contracts";
import { builtInPixiFxRuntimeAssets } from "@v-ronpa/pixi-presenter";
import { defaultHarnessInputBindings } from "./inputActions";
import { verticalSliceEvidence, verticalSliceItem, verticalSliceMaps, verticalSliceTrial } from "./fixtures/verticalSlice";
import { harnessRuntimeAssets } from "./generatedAssets";

export const harnessContentManifest = {
  version: 2,
  assets: [],
  uiAssets: [],
  interactionStyles: [],
  runtimeAssets: [...harnessRuntimeAssets, ...builtInPixiFxRuntimeAssets],
  collisionProxies: [],
  input: defaultHarnessInputBindings,
  maps: verticalSliceMaps,
  items: [verticalSliceItem],
  evidence: [verticalSliceEvidence],
  trials: [verticalSliceTrial]
} satisfies ContentManifest;
