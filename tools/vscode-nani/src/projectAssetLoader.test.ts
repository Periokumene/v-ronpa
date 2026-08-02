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
    const root = tempRoot();
    const app = join(root, "apps/example");
    const script = join(app, "src/nani/story.nani");
    mkdirSync(join(app, "src/nani"), { recursive: true });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
    writeFileSync(join(app, "asset.config.mjs"), "export default {};\n");
    writeFileSync(script, "@end\n");

    expect(findNearestAssetConfig(script, root)).toBe(join(app, "asset.config.mjs"));
    expect(findNaniProjectRoot(join(app, "asset.config.mjs"), root)).toBe(root);
    expect(findNearestAssetConfig(join(root, "other/story.nani"), root)).toBeUndefined();
  });

  it("enables project execution only for trusted local workspaces", () => {
    expect(projectAssetLoadingEnabled(true, "file")).toBe(true);
    expect(projectAssetLoadingEnabled(false, "file")).toBe(false);
    expect(projectAssetLoadingEnabled(true, "untitled")).toBe(false);
  });

  it("loads generated IDs and live character composition tokens", async () => {
    const fixture = createAssetFixture();
    const loaded = await loadProjectAssets(fixture.configPath, fixture.root);

    expect(loaded.index.assets.map((asset) => asset.id)).toEqual(["alice", "bgm:main"]);
    expect(loaded.index.characterTokens.alice).toEqual(["Default", "EYE0"]);
    expect(loaded.characterPacks.alice).toEqual({
      id: "alice",
      rootPath: dirname(fixture.compositionsPath),
      characterPath: join(dirname(fixture.compositionsPath), "character.json")
    });
    expect(loaded.watchedPaths).toEqual(
      expect.arrayContaining([
        fixture.configPath,
        fixture.outputPath,
        fixture.compositionsPath,
        join(dirname(fixture.compositionsPath), "character.json"),
        join(dirname(fixture.compositionsPath), "layers.json")
      ])
    );
    expect(loaded.warnings).toEqual([]);
  });

  it("hard-rejects the legacy outputPath key without a fallback", async () => {
    const fixture = createAssetFixture();
    const current = {
      publicRoot: "apps/example/public/example",
      publicBaseUri: "/example",
      runtimeAssetOutputPath: "apps/example/src/generatedAssets.ts",
      exportName: "exampleAssets"
    };

    await expect(loadProjectAssets(fixture.configPath, fixture.root, async () => ({
      default: { ...current, outputPath: current.runtimeAssetOutputPath }
    }))).rejects.toThrow("'outputPath' is not supported");
    await expect(loadProjectAssets(fixture.configPath, fixture.root, async () => ({
      default: {
        publicRoot: current.publicRoot,
        publicBaseUri: current.publicBaseUri,
        outputPath: current.runtimeAssetOutputPath,
        exportName: current.exportName
      }
    }))).rejects.toThrow("'outputPath' is not supported");
  });

  it("degrades malformed or missing character compositions to warnings while retaining assets", async () => {
    const fixture = createAssetFixture();
    writeFileSync(fixture.compositionsPath, '{"tokens":[]}');
    const loaded = await loadProjectAssets(fixture.configPath, fixture.root);

    expect(loaded.index.assets).toHaveLength(2);
    expect(loaded.index.characterTokens).toEqual({});
    expect(loaded.warnings[0]).toContain("Could not read");
  });

  it("preserves config and generated output watch paths when generated data cannot load", async () => {
    const fixture = createAssetFixture();
    writeFileSync(fixture.outputPath, "export const wrong = [];\n");

    await expect(loadProjectAssets(fixture.configPath, fixture.root)).rejects.toMatchObject({
      name: "ProjectAssetLoadError",
      watchedPaths: [fixture.configPath, fixture.outputPath]
    });
  });

  it("invalidates cached loads after watched content changes or deletion", async () => {
    const cache = new ProjectAssetCache();
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return { index: { assets: [], characterTokens: {} }, characterPacks: {}, watchedPaths: [], warnings: [] };
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

  it("loads the real Game A generated IDs and current Alice tokens", async () => {
    const repoRoot = resolve(process.cwd(), "../..");
    const configPath = join(repoRoot, "apps/game-a/asset.config.mjs");
    const loaded = await loadProjectAssets(configPath, repoRoot);

    expect(loaded.index.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "alice", kind: "character-pack" }),
        expect.objectContaining({ id: "alice-kid", kind: "character-pack" }),
        expect.objectContaining({ id: "bg:home-kitchen", kind: "background" }),
        expect.objectContaining({ id: "bg:home-outside", kind: "background" }),
        expect.objectContaining({ id: "bgm:dead-fish-riffle", kind: "bgm" }),
        expect.objectContaining({ id: "bgm:game-a-main", kind: "bgm" }),
        expect.objectContaining({ id: "sfx:glug-glug-glug", kind: "sfx" })
      ])
    );
    expect(loaded.index.characterTokens.alice).toEqual(
      expect.arrayContaining(["default", "sourcePreview", "body0", "eye5", "mouth6", "armR5", "armL5"])
    );
    expect(loaded.index.characterTokens["alice-kid"]).toEqual(
      expect.arrayContaining(["default", "body0", "effect0", "effect2", "effectOff"])
    );
  });

  it("loads the split Harness runtime module through its own public base URI", async () => {
    const repoRoot = resolve(process.cwd(), "../..");
    const loaded = await loadProjectAssets(
      join(repoRoot, "apps/game-harness/asset.config.mjs"),
      repoRoot
    );

    expect(loaded.index.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "Ema", kind: "character-pack" }),
      expect.objectContaining({ id: "bg:inner-academy-hall", kind: "background" }),
      expect.objectContaining({ id: "bgm:validation-main", kind: "bgm" })
    ]));
    expect(loaded.index.assets.find((asset) => asset.id === "Ema")?.optimizedUri)
      .toMatch(/^\/harness\//u);
  });
});

function createAssetFixture(): {
  root: string;
  configPath: string;
  outputPath: string;
  compositionsPath: string;
} {
  const root = tempRoot();
  const app = join(root, "apps/example");
  const outputPath = join(app, "src/generatedAssets.ts");
  const characterRoot = join(app, "public/example/characters/alice");
  const compositionsPath = join(characterRoot, "compositions.json");
  const configPath = join(app, "asset.config.mjs");
  mkdirSync(join(app, "src"), { recursive: true });
  mkdirSync(characterRoot, { recursive: true });
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
  writeFileSync(
    configPath,
    `export default {
      publicRoot: "apps/example/public/example",
      publicBaseUri: "/example",
      runtimeAssetOutputPath: "apps/example/src/generatedAssets.ts",
      exportName: "exampleAssets"
    };\n`
  );
  writeFileSync(
    outputPath,
    `export const exampleAssets = ${JSON.stringify([
      runtimeAsset("alice", "character-pack", "/example/characters/alice/character.json", "json"),
      runtimeAsset("bgm:main", "bgm", "/example/media/bgm/main.ogg", "ogg")
    ], null, 2)} satisfies RuntimeAsset[];\n`
  );
  writeFileSync(join(characterRoot, "character.json"), "{}\n");
  writeFileSync(compositionsPath, '{"tokens":{"Default":["MAIN>BODY"],"EYE0":["MAIN/EYE>0"]}}\n');
  return { root, configPath, outputPath, compositionsPath };
}

function runtimeAsset(id: string, kind: string, optimizedUri: string, format: string): Record<string, unknown> {
  return { id, kind, optimizedUri, format, compression: [], lods: [], collisionProxyIds: [], tags: [] };
}

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "vscode-nani-assets-"));
  tempRoots.push(root);
  return root;
}
