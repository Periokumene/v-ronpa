import type { VnRuntimeEntry } from "@v-ronpa/app-vn-runtime";
import { gameAScriptMetadataByPath } from "./generatedAssets";
import smokeNaniSource from "./nani/smoke.nani?raw";

const scriptPath = "game-a/smoke.nani";
const metadata = gameAScriptMetadataByPath[scriptPath];
if (!metadata) throw new Error(`Missing generated metadata for '${scriptPath}'.`);

export const gameASmokeRuntimeEntry = {
  id: "vn:game-a-smoke",
  scriptRevision: metadata.scriptRevision,
  profile: "vn2d",
  scriptPath,
  sourceText: smokeNaniSource,
  startLabel: "Start"
} satisfies VnRuntimeEntry;
