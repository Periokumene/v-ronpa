import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import gameAAssetConfig from "../apps/game-a/asset.config.mjs";
import gameANaniConfig from "../apps/game-a/nani.config.mjs";
import harnessAssetConfig from "../apps/game-harness/asset.config.mjs";
import {
  analyzeGameANaniProduction,
  analyzeGameANaniTests,
  analyzeHarnessNaniProduction,
  generateGameAAssetsModule,
  generateGameANaniProductionModule,
  generateGameANaniTestsModule,
  generateHarnessAssetsModule,
  generateHarnessNaniProductionModule
} from "./generate-assets.mjs";
import {
  assetProjectGeneratedModule,
  assetProjectRoot,
  scanAssetProject
} from "../packages/asset-project/src/index.ts";
import {
  ContentManifestSchema,
  LayeredCharacterCompositionsSchema,
  LayeredCharacterDefinitionSchema,
  LayeredCharacterLayerMetadataSchema,
  LayeredCharacterLayersSchema
} from "../packages/contracts/src/index.ts";
import { createAssetRegistry } from "../packages/asset-registry/src/index.ts";
import {
  resolveLayeredCharacterLayerRefs,
  resolveLayeredCharacterSourcePixelScale
} from "../packages/layered-character/src/index.ts";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const apps = [
  {
    label: "game-a",
    config: gameAAssetConfig,
    generatedAssets: generateGameAAssetsModule,
    generatedNani: [
      [join(repoRoot, "apps/game-a/src/generatedNaniProduction.ts"), generateGameANaniProductionModule],
      [join(repoRoot, "apps/game-a/src/generatedNaniTests.ts"), generateGameANaniTestsModule]
    ]
  },
  {
    label: "game-harness",
    config: harnessAssetConfig,
    generatedAssets: generateHarnessAssetsModule,
    generatedNani: [
      [join(repoRoot, "apps/game-harness/src/harness/generatedNaniProduction.ts"), generateHarnessNaniProductionModule]
    ]
  }
];

let failed = false;
const scans = new Map();
const analyses = new Map();

for (const app of apps) {
  try {
    scans.set(app.label, await scanAssetProject(app.config));
  } catch (error) {
    fail(`${app.label} asset scan failed: ${errorMessage(error)}`);
  }
}

await checkGeneratedModules();
await checkNaniBindings();
for (const app of apps) {
  const scan = scans.get(app.label);
  if (!scan) continue;
  checkAssetFiles(app, scan);
  checkAudioAndVoiceLayout(app, scan);
  checkCharacterPacks(app, scan);
  checkVoiceOrphans(app, scan, analyses.get(app.label) ?? []);
}
await checkFinalManifests();
checkConsumerSourcePaths();

if (failed) process.exitCode = 1;

async function checkGeneratedModules() {
  for (const app of apps) {
    const generated = [
      [assetProjectGeneratedModule(app.config), app.generatedAssets],
      ...app.generatedNani
    ];
    for (const [path, generate] of generated) {
      const expected = await generate();
      const current = existsSync(path) ? readFileSync(path, "utf8") : "";
      if (current !== expected) fail(`${toPosix(relative(repoRoot, path))} is out of date. Run pnpm generate:assets.`);
    }
  }
}

async function checkNaniBindings() {
  const gameA = [
    ["Game A production", await analyzeGameANaniProduction("strict")],
    ...await Promise.all(Object.keys(gameANaniConfig.testEntries).map(async (name) => [
      `Game A test '${name}'`,
      await analyzeGameANaniTests(name, "strict")
    ]))
  ];
  const harness = [["Harness production", await analyzeHarnessNaniProduction("strict")]];
  analyses.set("game-a", gameA.map(([, analysis]) => analysis));
  analyses.set("game-harness", harness.map(([, analysis]) => analysis));
  for (const [label, analysis] of [...gameA, ...harness]) {
    for (const diagnostic of analysis.diagnostics.filter((item) => item.disposition === "fatal")) {
      fail(`${label} binding failed at ${diagnostic.scriptPath ?? "catalog"}: ${diagnostic.message}`);
    }
  }
}

function checkAssetFiles(app, scan) {
  const root = assetProjectRoot(app.config);
  for (const asset of scan.assets) {
    if (!asset.uri.startsWith(`${app.config.mount}/`)) {
      fail(`${app.label} asset '${asset.id}' URI must begin with '${app.config.mount}/'.`);
      continue;
    }
    const relativePath = asset.uri.slice(`${app.config.mount}/`.length);
    if (!existsSync(join(root, relativePath))) {
      fail(`${app.label} asset '${asset.id}' points to missing source file '${relativePath}'.`);
    }
  }
}

function checkAudioAndVoiceLayout(app, scan) {
  for (const file of scan.files) {
    const [top] = file.relativePath.split("/");
    if (["bgm", "sfx", "bleep", "voice"].includes(top) && extname(file.relativePath) === ".webm") {
      fail(`${app.label} audio asset '${file.relativePath}' must not use WebM; remux it to OGG.`);
    }
    if (["bgm", "sfx", "bleep", "voice"].includes(top) && extname(file.relativePath) === ".ogg") {
      const bytes = readFileSync(file.absolutePath);
      const header = bytes.subarray(0, Math.min(bytes.length, 512));
      if (bytes.subarray(0, 4).toString("ascii") !== "OggS") {
        fail(`${app.label} audio asset '${file.relativePath}' is not an Ogg container.`);
      } else if (!header.includes(Buffer.from("OpusHead")) && !header.includes(Buffer.from("vorbis"))) {
        fail(`${app.label} audio asset '${file.relativePath}' has no supported Opus/Vorbis stream header.`);
      }
    }
  }
  for (const asset of scan.assets.filter(({ id }) => id.startsWith("voice/"))) {
    const parts = asset.id.split("/");
    if (parts.length !== 3) {
      fail(`${app.label} voice '${asset.id}' must use voice/<locale>/<stem>.`);
      continue;
    }
    const locale = parts[1] ?? "";
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/u.test(locale)) {
      fail(`${app.label} voice '${asset.id}' uses invalid lowercase BCP47 locale '${locale}'.`);
    }
    if (asset.mimeType !== "audio/ogg") {
      fail(`${app.label} voice '${asset.id}' must ship as audio/ogg, received '${asset.mimeType}'.`);
    }
  }
}

function checkVoiceOrphans(app, scan, appAnalyses) {
  const indexed = new Set();
  for (const analysis of appAnalyses) {
    for (const localeIndex of Object.values(analysis.voiceIndex)) {
      for (const assetId of Object.values(localeIndex)) indexed.add(assetId);
    }
  }
  for (const asset of scan.assets.filter(({ id }) => id.startsWith("voice/"))) {
    if (!indexed.has(asset.id)) {
      fail(`${app.label} voice '${asset.id}' has no matching Nani textId in any configured scope.`);
    }
  }
}

function checkCharacterPacks(app, scan) {
  const characterIdByAssetId = new Map(
    Object.entries(scan.characterAssetIdByCharacterId).map(([characterId, assetId]) => [assetId, characterId])
  );
  for (const asset of scan.assets.filter(({ id }) => id.startsWith("char/"))) {
    const characterId = characterIdByAssetId.get(asset.id);
    if (!characterId) {
      fail(`${app.label} character asset '${asset.id}' has no generated CharacterId binding.`);
      continue;
    }
    const entryPath = join(assetProjectRoot(app.config), asset.uri.slice(`${app.config.mount}/`.length));
    const packRoot = dirname(entryPath);
    try {
      const character = LayeredCharacterDefinitionSchema.parse(readJson(entryPath));
      const layers = LayeredCharacterLayersSchema.parse(readJson(join(packRoot, "layers.json")));
      const compositions = LayeredCharacterCompositionsSchema.parse(readJson(join(packRoot, "compositions.json")));
      if (character.id !== characterId) {
        fail(`${app.label} '${asset.id}' declares CharacterId '${character.id}', expected '${characterId}'.`);
      }
      const sourcePixelLayers = [];
      for (const [groupName, group] of Object.entries(layers.groups)) {
        for (const [layerName, ref] of Object.entries(group.layers)) {
          const texturePath = resolvePackPath(packRoot, ref.src);
          const metadataPath = resolvePackPath(packRoot, ref.metadata);
          if (!texturePath || !existsSync(texturePath)) {
            fail(`${app.label} '${asset.id}' layer ${groupName}>${layerName} texture is missing or escapes its pack: ${ref.src}.`);
          } else {
            checkPng(texturePath, `${app.label} '${asset.id}' layer ${groupName}>${layerName}`);
          }
          if (!metadataPath || !existsSync(metadataPath)) {
            fail(`${app.label} '${asset.id}' layer ${groupName}>${layerName} metadata is missing or escapes its pack: ${ref.metadata}.`);
          } else {
            sourcePixelLayers.push({
              id: `${groupName}>${layerName}`,
              metadata: LayeredCharacterLayerMetadataSchema.parse(readJson(metadataPath))
            });
          }
        }
      }
      const sourcePixelScale = resolveLayeredCharacterSourcePixelScale(sourcePixelLayers);
      if (!sourcePixelScale.ok) fail(`${app.label} '${asset.id}' source-pixel scale: ${sourcePixelScale.message}`);
      const resolvedDefault = resolveLayeredCharacterLayerRefs({
        character,
        layers,
        compositions,
        appearanceExpression: ""
      });
      if (resolvedDefault.diagnostics.length > 0 || resolvedDefault.activeLayers.length === 0) {
        fail(`${app.label} '${asset.id}' default composition must resolve to active layers without diagnostics.`);
      }
    } catch (error) {
      fail(`${app.label} character '${asset.id}' failed validation: ${errorMessage(error)}`);
    }
  }
}

function checkPng(path, label) {
  const buffer = readFileSync(path);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length < 24 || !signature.every((byte, index) => buffer[index] === byte) || buffer.subarray(12, 16).toString("ascii") !== "IHDR") {
    fail(`${label} is not a valid PNG.`);
    return;
  }
  if (buffer.readUInt32BE(16) === 0 || buffer.readUInt32BE(20) === 0) fail(`${label} has zero dimensions.`);
}

async function checkFinalManifests() {
  const { createServer } = await import("vite");
  const server = await createServer({ root: repoRoot, appType: "custom", server: { middlewareMode: true } });
  try {
    const modules = await Promise.all([
      server.ssrLoadModule("/apps/game-a/src/contentManifest.ts"),
      server.ssrLoadModule("/apps/game-harness/src/harness/contentManifest.ts")
    ]);
    const inputs = [modules[0].gameAContentManifest, modules[1].harnessContentManifest];
    for (const [index, input] of inputs.entries()) {
      const label = apps[index].label;
      try {
        const manifest = ContentManifestSchema.parse(input);
        const registry = createAssetRegistry(manifest);
        for (const diagnostic of registry.validateReferences()) fail(`${label} manifest: ${diagnostic.message}`);
      } catch (error) {
        fail(`${label} manifest failed validation: ${errorMessage(error)}`);
      }
    }
  } finally {
    await server.close();
  }
}

function checkConsumerSourcePaths() {
  const roots = [
    join(repoRoot, "apps/game-a/src"),
    join(repoRoot, "apps/game-harness/src"),
    join(repoRoot, "packages")
  ];
  const rawPath = /["'`](?:\/assets\/|\/game-a\/|\/harness\/|https?:\/\/)[^"'`]*\.(?:json|png|webp|woff2?|ttf|otf|ogg|mp3|mp4|webm|gltf|glb)["'`]/u;
  for (const root of roots) {
    for (const path of walkFiles(root)) {
      if (!/\.(ts|tsx|mjs)$/u.test(path) || /\.test\.(ts|tsx)$/u.test(path)) continue;
      const rel = toPosix(relative(repoRoot, path));
      const content = readFileSync(path, "utf8");
      if (rawPath.test(content)) fail(`${rel} contains a raw published asset URL; resolve an AssetId through the App registry.`);
    }
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolvePackPath(root, path) {
  const resolved = resolve(root, path);
  return resolved === root || resolved.startsWith(`${root}${sep}`) ? resolved : undefined;
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const name of readdirSync(root)) {
    if (["node_modules", "dist", "coverage", ".turbo"].includes(name)) continue;
    const path = join(root, name);
    if (statSync(path).isDirectory()) files.push(...walkFiles(path));
    else files.push(path);
  }
  return files;
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  failed = true;
  console.error(message);
}
