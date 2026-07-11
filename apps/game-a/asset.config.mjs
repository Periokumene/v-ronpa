export default {
  id: "game-a",
  publicRoot: "apps/game-a/public/game-a",
  publicBaseUri: "/game-a",
  outputPath: "apps/game-a/src/generatedAssets.ts",
  exportName: "gameARuntimeAssets",
  fontFacesExportName: "gameAFontFaces",
  fragmentsExportName: "gameARuntimeAssetFragments",
  scriptMetadataExportName: "gameAScriptMetadataByPath",
  providers: ["pixi"],
  voiceLocales: ["zh"],
  scripts: [
    {
      sourceFile: "apps/game-a/src/nani/opening.nani",
      scriptPath: "game-a/opening.nani"
    },
    {
      sourceFile: "apps/game-a/src/nani/smoke.nani",
      scriptPath: "game-a/smoke.nani",
      testOnly: true
    }
  ],
  idOverrides: {},
  fontFaceOverrides: {
    "font:fusion-pixel-12px-proportional-zh-hans": {
      id: "font:fusion-pixel-zh-hans",
      family: "Fusion Pixel 12px zh-Hans"
    }
  },
  tags: ["game-a", "vn"],
  uiTextureTags: ["game-a", "ui", "vn"]
};
