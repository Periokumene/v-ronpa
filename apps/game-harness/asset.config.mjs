export default {
  id: "game-harness",
  publicRoot: "apps/game-harness/public/harness",
  publicBaseUri: "/harness",
  outputPath: "apps/game-harness/src/harness/generatedAssets.ts",
  exportName: "harnessRuntimeAssets",
  fontFacesExportName: "harnessFontFaces",
  fragmentsExportName: "harnessRuntimeAssetFragments",
  entryLocatorExportName: "harnessVnEntryLocator",
  scriptMetadataExportName: "harnessScriptMetadataByPath",
  scriptCatalogExportName: "harnessScriptCatalog",
  scriptSourcesExportName: "harnessScriptSourcesByPath",
  entry: {
    id: "vn:harness-showcase",
    initialScriptPath: "harness/harness-showcase.nani",
    startLabel: "Start"
  },
  providers: ["pixi"],
  voiceLocales: ["zh"],
  scripts: [
    {
      sourceFile: "apps/game-harness/src/harness/showcase/script.ts",
      sourceFormat: "typescript-template",
      scriptPath: "harness/harness-showcase.nani"
    }
  ],
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
