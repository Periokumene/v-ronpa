export default {
  id: "game-a",
  publicRoot: "apps/game-a/public/game-a",
  publicBaseUri: "/game-a",
  runtimeAssetOutputPath: "apps/game-a/src/generatedRuntimeAssets.ts",
  naniProductionOutputPath: "apps/game-a/src/generatedNaniProduction.ts",
  naniTestsOutputPath: "apps/game-a/src/generatedNaniTests.ts",
  exportName: "gameARuntimeAssets",
  fontFacesExportName: "gameAFontFaces",
  fragmentsExportName: "gameARuntimeAssetFragments",
  providers: ["pixi"],
  naniProject: {
    scopes: {
      production: {
        sourceRoot: "apps/game-a/src/nani",
        scriptRoot: "game-a"
      },
      development: {
        sourceRoot: "apps/game-a/src/nani-dev",
        scriptRoot: "game-a/dev"
      },
      test: {
        sourceRoot: "apps/game-a/src/nani-test",
        scriptRoot: "game-a/test"
      }
    },
    mainEntry: {
      id: "vn:game-a-main",
      scope: "production",
      initialScriptPath: "game-a/opening.nani",
      startLabel: "Start"
    },
    testEntries: {
      smoke: {
        id: "vn:game-a-test-smoke",
        scope: "test",
        initialScriptPath: "game-a/test/smoke.nani",
        startLabel: "Start"
      },
      character: {
        id: "vn:game-a-test-character",
        scope: "test",
        initialScriptPath: "game-a/test/character-smoke.nani",
        startLabel: "Start"
      }
    },
    voiceLocales: ["zh"]
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
