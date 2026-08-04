import { defineAssetProject } from "@v-ronpa/asset-project";

export default defineAssetProject(import.meta.url, {
  appId: "game-a",
  root: "assets",
  mount: "assets",
  generatedModule: "src/generatedAssets.ts",
  bundleRoots: [{ path: "char", entry: "character.json" }]
});
