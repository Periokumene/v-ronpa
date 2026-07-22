export default {
  id: "game-a",
  publicRoot: "apps/game-a/public/game-a",
  publicBaseUri: "/game-a",
  outputPath: "apps/game-a/src/generatedAssets.ts",
  exportName: "gameARuntimeAssets",
  fontFacesExportName: "gameAFontFaces",
  fragmentsExportName: "gameARuntimeAssetFragments",
  entryLocatorExportName: "gameAVnEntryLocator",
  scriptMetadataExportName: "gameAScriptMetadataByPath",
  scriptCatalogExportName: "gameAScriptCatalog",
  scriptSourcesExportName: "gameAScriptSourcesByPath",
  testScriptOutputPath: "apps/game-a/src/generatedTestScripts.ts",
  testEntryLocatorsExportName: "gameATestEntryLocators",
  testScriptMetadataExportName: "gameATestScriptMetadataByPath",
  testScriptCatalogsExportName: "gameATestScriptCatalogs",
  testScriptSourcesExportName: "gameATestScriptSourcesByPath",
  entry: {
    id: "vn:game-a-main",
    initialScriptPath: "game-a/opening.nani",
    startLabel: "Start"
  },
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
  testCatalogs: {
    smoke: {
      entry: {
        id: "vn:game-a-test-smoke",
        initialScriptPath: "game-a/test/smoke.nani",
        startLabel: "Start"
      },
      scripts: [
        {
          sourceFile: "apps/game-a/src/test-nani/smoke.nani",
          scriptPath: "game-a/test/smoke.nani"
        }
      ]
    },
    characterSmoke: {
      entry: {
        id: "vn:game-a-test-character",
        initialScriptPath: "game-a/test/character-smoke.nani",
        startLabel: "Start"
      },
      scripts: [
        {
          sourceFile: "apps/game-a/src/test-nani/character-smoke.nani",
          scriptPath: "game-a/test/character-smoke.nani"
        }
      ]
    }
  },
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
