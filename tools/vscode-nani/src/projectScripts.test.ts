import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectScriptConfig } from "./projectScripts";
import { loadProjectAssets } from "./projectAssetLoader";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("project script catalogs", () => {
  it("builds one production+development graph and one shared test graph from roots", async () => {
    const fixture = createFixture();
    mkdirSync(join(fixture.root, "app/nani/chapter"), { recursive: true });
    writeFileSync(join(fixture.root, "app/nani/opening.nani"), "#Start\n@end\n");
    writeFileSync(join(fixture.root, "app/nani/chapter/02.nani"), "#Start\n@end\n");
    writeFileSync(join(fixture.root, "app/nani-dev/draft.nani"), "#Start\n@end\n");
    writeFileSync(join(fixture.root, "app/nani-test/smoke.nani"), "#Start\n@end\n");
    writeFileSync(join(fixture.root, "app/nani-test/character.nani"), "#Start\n@end\n");
    writeFileSync(join(fixture.root, "app/nani/ignored.txt"), "ignored\n");

    const loaded = await loadProjectScriptConfig(
      fixture.configPath,
      fixture.root,
      emptyAssetBindings,
      async (path) => ({ default: path.endsWith("nani.config.mjs") ? naniConfig() : assetConfig(fixture.appRoot) })
    );

    expect(loaded.errors).toEqual([]);
    expect(loaded.catalogs.map((catalog) => catalog.catalogId)).toEqual(["development", "test"]);
    expect(loaded.catalogs[0]?.scripts.map((script) => [script.scope, script.scriptPath])).toEqual([
      ["production", "game/chapter/02.nani"],
      ["development", "game/dev/draft.nani"],
      ["production", "game/opening.nani"]
    ]);
    expect(loaded.catalogs[1]?.entries.map((entry) => entry.id)).toEqual([
      "vn:test-smoke",
      "vn:test-character"
    ]);
    expect(loaded.catalogs[1]?.scripts.map((script) => script.scriptPath)).toEqual([
      "game/test/character.nani",
      "game/test/smoke.nani"
    ]);
  });

  it("reports shared discovery failures instead of maintaining extension-only rules", async () => {
    const fixture = createFixture();
    const invalid = naniConfig();
    invalid.scopes.production.sourceRoot = "app/missing";

    const loaded = await loadProjectScriptConfig(
      fixture.configPath,
      fixture.root,
      emptyAssetBindings,
      async (path) => ({ default: path.endsWith("nani.config.mjs") ? invalid : assetConfig(fixture.appRoot) })
    );

    expect(loaded.catalogs).toEqual([]);
    expect(loaded.errors).toEqual([expect.stringContaining("does not exist")]);
  });

  it("indexes the real Game A managed roots without per-file registration", async () => {
    const root = resolve(process.cwd(), "../..");
    const assets = await loadProjectAssets(join(root, "apps/game-a/asset.config.mjs"), root);
    const loaded = await loadProjectScriptConfig(
      join(root, "apps/game-a/asset.config.mjs"),
      root,
      assets.assetBindings
    );

    expect(loaded.errors).toEqual([]);
    expect(loaded.catalogs.map((catalog) => catalog.catalogId)).toEqual(["development", "test"]);
    expect(loaded.catalogs[0]?.scripts.map((script) => script.scriptPath)).toEqual([
      "game-a/chapter-02.nani",
      "game-a/dev/home-quarrel.nani",
      "game-a/opening.nani"
    ]);
    expect(loaded.catalogs[1]?.scripts).toHaveLength(2);
  });
});

const emptyAssetBindings = {
  appId: "example",
  assets: [],
  characterAssetIdByCharacterId: {}
} as const;

function createFixture(): { root: string; appRoot: string; configPath: string } {
  const root = mkdtempSync(join(tmpdir(), "vscode-nani-scripts-"));
  roots.push(root);
  const appRoot = join(root, "app");
  for (const directory of ["app/nani", "app/nani-dev", "app/nani-test"]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
  const configPath = join(root, "app/asset.config.mjs");
  writeFileSync(configPath, "export default {};\n");
  mkdirSync(join(appRoot, "assets"), { recursive: true });
  writeFileSync(join(appRoot, "nani.config.mjs"), "export default {};\n");
  return { root, appRoot, configPath };
}

function assetConfig(configDir: string) {
  return {
    appId: "example",
    root: "assets",
    mount: "assets",
    generatedModule: "src/generatedAssets.ts",
    bundleRoots: [],
    configDir
  };
}

function naniConfig() {
  return {
    scopes: {
      production: { sourceRoot: "app/nani", scriptRoot: "game" },
      development: { sourceRoot: "app/nani-dev", scriptRoot: "game/dev" },
      test: { sourceRoot: "app/nani-test", scriptRoot: "game/test" }
    },
    mainEntry: {
      id: "vn:main",
      scope: "production",
      initialScriptPath: "game/opening.nani",
      startLabel: "Start"
    },
    testEntries: {
      smoke: {
        id: "vn:test-smoke",
        scope: "test",
        initialScriptPath: "game/test/smoke.nani",
        startLabel: "Start"
      },
      character: {
        id: "vn:test-character",
        scope: "test",
        initialScriptPath: "game/test/character.nani",
        startLabel: "Start"
      }
    },
    voiceLocales: []
  };
}
