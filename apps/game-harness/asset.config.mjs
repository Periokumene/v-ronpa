import { defineAssetProject } from "@v-ronpa/asset-project";

export default defineAssetProject(import.meta.url, {
  appId: "game-harness",
  root: "assets",
  mount: "assets",
  generatedModule: "src/harness/generatedAssets.ts",
  bundleRoots: [{ path: "char", entry: "character.json" }]
});
