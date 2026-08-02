export default {
  id: "game-harness",
  publicRoot: "apps/game-harness/public/harness",
  publicBaseUri: "/harness",
  runtimeAssetOutputPath: "apps/game-harness/src/harness/generatedRuntimeAssets.ts",
  naniProductionOutputPath: "apps/game-harness/src/harness/generatedNaniProduction.ts",
  exportName: "harnessRuntimeAssets",
  fontFacesExportName: "harnessFontFaces",
  fragmentsExportName: "harnessRuntimeAssetFragments",
  providers: ["pixi"],
  naniProject: {
    scopes: {
      production: {
        sourceRoot: "apps/game-harness/src/nani",
        scriptRoot: "harness"
      }
    },
    mainEntry: {
      id: "vn:harness-showcase",
      scope: "production",
      initialScriptPath: "harness/harness-showcase.nani",
      startLabel: "Start"
    },
    testEntries: {},
    voiceLocales: ["zh"]
  },
  idOverrides: {
    "media/bgm/bgm-validation-main.ogg": "bgm:validation-main",
    "media/bgm/bgm-validation-alt.ogg": "bgm:validation-alt",
    "media/bgm/bgm-validation-layer.ogg": "bgm:validation-layer",
    "media/bgm/bgm-validation-extra.ogg": "bgm:validation-extra",
    "media/video/movie-validation-intro.mp4": "video:validation-intro",
    "thumbnails/evidence-keycard.png": "texture:evidence:keycard-thumbnail",
    "thumbnails/item-notebook.png": "texture:item:notebook-thumbnail"
  },
  fontFaceOverrides: {
    "font:rich-serif": {
      id: "font:serif",
      family: "V Ronpa Rich Serif"
    }
  },
  tags: ["harness"]
};
