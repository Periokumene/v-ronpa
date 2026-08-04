import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  findNaniProjectRoot,
  findNearestAssetConfig,
  loadProjectAssets,
  projectAssetLoadingEnabled,
  ProjectAssetCache
} from "./projectAssetLoader";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("project asset loading", () => {
  it("finds the closest config and the workspace package root", () => {
    const fixture = createAssetFixture();
    const script = join(fixture.appRoot, "src/nani/story.nani");
    mkdirSync(dirname(script), { recursive: true });
    writeFileSync(script, "@end\n");

    expect(findNearestAssetConfig(script, fixture.root)).toBe(fixture.configPath);
    expect(findNaniProjectRoot(fixture.configPath, fixture.root)).toBe(fixture.root);
    expect(findNearestAssetConfig(join(fixture.root, "other/story.nani"), fixture.root)).toBeUndefined();
  });

  it("enables project execution only for trusted local workspaces", () => {
    expect(projectAssetLoadingEnabled(true, "file")).toBe(true);
    expect(projectAssetLoadingEnabled(false, "file")).toBe(false);
    expect(projectAssetLoadingEnabled(true, "untitled")).toBe(false);
  });

  it("scans source assets and explicit character bindings from the shared project rules", async () => {
    const fixture = createAssetFixture();
    const loaded = await loadProjectAssets(fixture.configPath, fixture.root);

    expect(loaded.index.assets).toEqual([
      { id: "bgm/main", uri: "assets/bgm/main.ogg", mimeType: "audio/ogg" },
      { id: "char/alice", uri: "assets/char/alice/character.json", mimeType: "application/json" }
    ]);
    expect(loaded.index.characters).toEqual([{ characterId: "alice", assetId: "char/alice" }]);
    expect(loaded.assetBindings.characterAssetIdByCharacterId).toEqual({ alice: "char/alice" });
    expect(loaded.index.characterTokens.alice).toEqual(["Default", "EYE0"]);
    expect(loaded.characterPacks.alice).toEqual({
      id: "alice",
      rootPath: dirname(fixture.compositionsPath),
      characterPath: join(dirname(fixture.compositionsPath), "character.json")
    });
    expect(loaded.watchedPaths).toEqual(expect.arrayContaining([
      fixture.configPath,
      fixture.compositionsPath,
      join(dirname(fixture.compositionsPath), "character.json")
    ]));
    expect(loaded.warnings).toEqual([]);
  });

  it("degrades malformed character compositions to warnings while retaining assets", async () => {
    const fixture = createAssetFixture();
    writeFileSync(fixture.compositionsPath, '{"tokens":[]}');

    const loaded = await loadProjectAssets(fixture.configPath, fixture.root);
    expect(loaded.index.assets).toHaveLength(2);
    expect(loaded.index.characterTokens).toEqual({});
    expect(loaded.warnings[0]).toContain("Could not read");
  });

  it("invalidates cached loads explicitly", async () => {
    const cache = new ProjectAssetCache();
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return {
        index: { assets: [], characters: [], characterTokens: {} },
        characterPacks: {},
        watchedPaths: [],
        warnings: [],
        assetBindings: { appId: "test", assets: [], characterAssetIdByCharacterId: {} }
      };
    };

    await cache.get("config", loader);
    await cache.get("config", loader);
    expect(loads).toBe(1);
    cache.invalidate("config");
    await cache.get("config", loader);
    expect(loads).toBe(2);
    cache.clear();
    await cache.get("config", loader);
    expect(loads).toBe(3);
  });

  it("loads both real App asset projects without legacy public namespaces", async () => {
    const repoRoot = resolve(process.cwd(), "../..");
    const gameA = await loadProjectAssets(join(repoRoot, "apps/game-a/asset.config.mjs"), repoRoot);
    const harness = await loadProjectAssets(join(repoRoot, "apps/game-harness/asset.config.mjs"), repoRoot);

    expect(gameA.index.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "char/alice", uri: "assets/char/alice/character.json" }),
      expect.objectContaining({ id: "bg/home", mimeType: "image/png" }),
      expect.objectContaining({ id: "bgm/main", mimeType: "audio/ogg" })
    ]));
    expect(harness.index.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "char/ema", uri: "assets/char/ema/character.json" }),
      expect.objectContaining({ id: "bg/inner/academy-hall", mimeType: "image/png" })
    ]));
    expect(harness.index.characters).toEqual([{ characterId: "Ema", assetId: "char/ema" }]);
  });
});

function createAssetFixture(): {
  root: string;
  appRoot: string;
  configPath: string;
  compositionsPath: string;
} {
  const root = tempRoot();
  const appRoot = join(root, "apps/example");
  const assetRoot = join(appRoot, "assets");
  const characterRoot = join(assetRoot, "char/alice");
  const compositionsPath = join(characterRoot, "compositions.json");
  const configPath = join(appRoot, "asset.config.mjs");
  mkdirSync(join(assetRoot, "bgm"), { recursive: true });
  mkdirSync(characterRoot, { recursive: true });
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
  writeFileSync(configPath, `export default ${JSON.stringify({
    appId: "example",
    root: "assets",
    mount: "assets",
    generatedModule: "src/generatedAssets.ts",
    bundleRoots: [{ path: "char", entry: "character.json" }],
    configDir: appRoot
  })};\n`);
  writeFileSync(join(assetRoot, "bgm/main.ogg"), "fixture");
  writeFileSync(join(characterRoot, "character.json"), '{"id":"alice"}\n');
  writeFileSync(compositionsPath, '{"tokens":{"Default":["MAIN>BODY"],"EYE0":["MAIN/EYE>0"]}}\n');
  return { root, appRoot, configPath, compositionsPath };
}

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "vscode-nani-assets-"));
  tempRoots.push(root);
  return root;
}
