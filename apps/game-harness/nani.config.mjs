export default {
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
};
