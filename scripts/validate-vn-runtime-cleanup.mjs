import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const legacyRuntimeSymbols = [
  "createVoiceAutoAdvanceGateController",
  "applyMediaRuntimeEffects",
  "resolveDialogueVoiceAssetAvailability",
  "createHarnessShowcaseRuntimeRestorePlan",
  "createHarnessShowcasePresentationTransaction",
  "MediaHandleStore",
  "ApplyMediaRuntimeEffectsInput",
  "ApplyMediaRuntimeEffectsResult",
  "VoiceAutoAdvanceGateController"
];

const failures = [];

checkLegacySymbols("apps/game-harness/src/interaction/useHarnessShowcaseRuntimeAdapter.ts");
checkLegacySymbols("apps/game-a/src/useGameAVnRuntime.ts");

if (failures.length > 0) {
  console.error("VN runtime legacy cleanup guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("VN runtime legacy cleanup guard passed.");

function checkLegacySymbols(path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return;
  const text = stripComments(readFileSync(absolute, "utf8"));
  for (const symbol of legacyRuntimeSymbols) {
    const pattern = new RegExp(`\\b${symbol}\\b`, "u");
    if (pattern.test(text)) failures.push(`${path}: legacy VN runtime symbol '${symbol}' must stay out of app adapters.`);
  }
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
