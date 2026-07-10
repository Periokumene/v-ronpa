import type { VnRuntimeEntry } from "@v-ronpa/app-vn-runtime";
import { gameAVnEntry } from "./contentManifest";
import openingNaniSource from "./nani/opening.nani?raw";

export const gameAOpeningNaniSource = openingNaniSource;

export const gameAOpeningRuntimeEntry = {
  id: gameAVnEntry.id,
  scriptRevision: gameAVnEntry.scriptRevision,
  profile: gameAVnEntry.profile,
  scriptPath: gameAVnEntry.scriptPath,
  sourceText: gameAOpeningNaniSource,
  ...(gameAVnEntry.startLabel ? { startLabel: gameAVnEntry.startLabel } : {})
} satisfies VnRuntimeEntry;
