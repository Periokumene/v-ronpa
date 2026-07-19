export default {
  id: "game-a",
  publicRoot: "apps/game-a/public/game-a",
  publicBaseUri: "/game-a",
  outputPath: "apps/game-a/src/generatedAssets.ts",
  exportName: "gameARuntimeAssets",
  fontFacesExportName: "gameAFontFaces",
  fragmentsExportName: "gameARuntimeAssetFragments",
  scriptMetadataExportName: "gameAScriptMetadataByPath",
  scriptSourcesExportName: "gameAScriptSourcesByPath",
  testScriptOutputPath: "apps/game-a/src/generatedTestScripts.ts",
  testScriptMetadataExportName: "gameATestScriptMetadataByPath",
  testScriptSourcesExportName: "gameATestScriptSourcesByPath",
  entryInitialScriptPath: "game-a/opening.nani",
  entryStartLabel: "Start",
  providers: ["pixi"],
  voiceLocales: ["zh"],
  scripts: [
    {
      sourceFile: "apps/game-a/src/nani/opening.nani",
      scriptPath: "game-a/opening.nani"
    },
    {
      sourceFile: "apps/game-a/src/nani/chapter-02.nani",
      scriptPath: "game-a/chapter-02.nani"
    }
  ],
  testScripts: [
    {
      sourceFile: "apps/game-a/src/test-nani/smoke.nani",
      scriptPath: "game-a/test/smoke.nani"
    },
    {
      sourceFile: "apps/game-a/src/test-nani/character-smoke.nani",
      scriptPath: "game-a/test/character-smoke.nani"
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
