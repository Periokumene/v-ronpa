export default {
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
};
