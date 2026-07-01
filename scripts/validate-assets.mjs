import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  collectGameAFontFaces,
  collectGameARuntimeAssets,
  collectHarnessFontFaces,
  collectHarnessRuntimeAssets,
  generateGameARuntimeAssetsModule,
  generateHarnessRuntimeAssetsModule
} from "./generate-assets.mjs";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const {
  LayeredCharacterCompositionsSchema,
  LayeredCharacterDefinitionSchema,
  LayeredCharacterLayerMetadataSchema,
  LayeredCharacterLayersSchema
} = await import(pathToFileURL(join(repoRoot, "packages/contracts/src/index.ts")).href);
const harnessGeneratedPath = join(repoRoot, "apps/game-harness/src/harness/generatedAssets.ts");
const gameAGeneratedPath = join(repoRoot, "apps/game-a/src/generatedAssets.ts");
const gameAContentManifestPath = join(repoRoot, "apps/game-a/src/contentManifest.ts");
const pixiFxAssetsPath = join(repoRoot, "packages/pixi-presenter/src/internal/fxAssets.ts");
const bleepAssetsRoot = join(repoRoot, "apps/game-harness/public/harness/media/bleep");
const voiceAssetsRoot = join(repoRoot, "apps/game-harness/public/harness/media/voice");
const gameABleepAssetsRoot = join(repoRoot, "apps/game-a/public/game-a/media/bleep");
const gameAVoiceAssetsRoot = join(repoRoot, "apps/game-a/public/game-a/media/voice");
const gameAFontAssetsRoot = join(repoRoot, "apps/game-a/public/game-a/fonts");
const sourceRoots = ["apps/game-a/src", "apps/game-harness/src", "packages", "scripts"].map((path) => join(repoRoot, path));
const harnessReferenceFiles = [
  join(repoRoot, "apps/game-harness/src/harness/showcase/script.ts"),
  join(repoRoot, "apps/game-harness/src/harness/showcase/items.ts"),
  join(repoRoot, "apps/game-harness/src/harness/showcase/maps.ts"),
  join(repoRoot, "docs/nani/basic-p1-example.md"),
  ...fixtureNaniFiles(join(repoRoot, "packages/nani-parser/fixtures"))
];
const gameAReferenceFiles = [gameAContentManifestPath];
const hardcodedAssetPattern = /(["'`])(?:\/harness\/|\/game-a\/|\.\/assets\/|\.\.\/assets\/|https?:\/\/|data:image\/|blob:)[^"'`]*\.(?:json|png|webp|avif|ktx2|woff2?|ttf|otf|ogg|mp3|mp4|webm|gltf|glb)\1/u;
const assetIdPattern = /\b(?:bg|bgm|sfx|bleep|voice|video|model|texture|fx):[a-zA-Z0-9:_./-]+/gu;
const richTextFontFacePattern = /<font\b[^>]*\bface\s*=\s*(?:"(font:[a-zA-Z0-9:_./-]+)"|'(font:[a-zA-Z0-9:_./-]+)'|(font:[a-zA-Z0-9:_./-]+))/gu;
const bleepAssetIdPattern = /^[a-zA-Z0-9_-]+$/u;
const voiceTextIdPattern = /^[a-zA-Z0-9_-]+$/u;
const characterPackCommandPattern = /^\s*@(char|slide)\s+([^\s]+)/gmu;
const allowedHardcodedFiles = new Set([
  "apps/game-harness/src/harness/generatedAssets.ts",
  "apps/game-a/src/generatedAssets.ts",
  "packages/pixi-presenter/src/internal/fxAssets.ts",
  "scripts/generate-assets.mjs",
  "scripts/validate-assets.mjs"
]);

const appAssetConfigs = [
  {
    label: "harness",
    assets: collectHarnessRuntimeAssets(),
    fontFaces: collectHarnessFontFaces(),
    publicRoot: "apps/game-harness/public",
    referenceFiles: harnessReferenceFiles,
    includePixiFxIds: true
  },
  {
    label: "game-a",
    assets: collectGameARuntimeAssets(),
    fontFaces: collectGameAFontFaces(),
    publicRoot: "apps/game-a/public",
    referenceFiles: gameAReferenceFiles,
    includePixiFxIds: false
  }
];

let failed = false;

checkGeneratedAssets();
for (const config of appAssetConfigs) {
  checkGeneratedFilesExist(config.label, config.assets, config.publicRoot);
  checkGeneratedFontFacesResolve(config.label, config.assets, config.fontFaces);
}
checkBleepAssetLayout(bleepAssetsRoot, "apps/game-harness/public/harness/media/bleep");
checkBleepAssetLayout(gameABleepAssetsRoot, "apps/game-a/public/game-a/media/bleep");
checkVoiceAssetLayout(voiceAssetsRoot, "apps/game-harness/public/harness/media/voice");
checkVoiceAssetLayout(gameAVoiceAssetsRoot, "apps/game-a/public/game-a/media/voice");
checkFontAssetLayout(join(repoRoot, "apps/game-harness/public/harness/fonts"), "apps/game-harness/public/harness/fonts");
checkFontAssetLayout(gameAFontAssetsRoot, "apps/game-a/public/game-a/fonts");
checkCharacterPacks();
for (const config of appAssetConfigs) checkReferencesResolve(config);
checkNoHardcodedRuntimeAssetPaths();

if (failed) process.exitCode = 1;

function checkGeneratedAssets() {
  const generatedFiles = [
    { path: harnessGeneratedPath, expected: generateHarnessRuntimeAssetsModule() },
    { path: gameAGeneratedPath, expected: generateGameARuntimeAssetsModule() }
  ];
  for (const generated of generatedFiles) {
    const current = existsSync(generated.path) ? readFileSync(generated.path, "utf8") : "";
    if (current !== generated.expected) fail(`${relative(repoRoot, generated.path)} is out of date. Run pnpm generate:assets.`);
  }
}

function checkGeneratedFilesExist(label, assets, publicRoot) {
  const ids = new Set();
  for (const asset of assets) {
    if (ids.has(asset.id)) fail(`Duplicate generated asset id '${asset.id}'.`);
    ids.add(asset.id);
    const filePath = join(repoRoot, publicRoot, asset.optimizedUri.replace(/^\//u, ""));
    if (!existsSync(filePath)) fail(`Generated ${label} asset '${asset.id}' points to missing file ${relative(repoRoot, filePath)}.`);
  }
}

function checkGeneratedFontFacesResolve(label, assets, fontFaces) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const faceIds = new Set();
  for (const face of fontFaces) {
    if (faceIds.has(face.id)) fail(`Duplicate generated ${label} font face id '${face.id}'.`);
    faceIds.add(face.id);
    const asset = byId.get(face.sourceRef);
    if (!asset) {
      fail(`Generated ${label} font face '${face.id}' references undeclared runtime asset '${face.sourceRef}'.`);
    } else if (asset.kind !== "font") {
      fail(`Generated ${label} font face '${face.id}' references '${face.sourceRef}', which is '${asset.kind}', not 'font'.`);
    }
  }
}

function checkVoiceAssetLayout(root, labelPath) {
  if (!existsSync(root)) return;
  for (const filePath of walkFiles(root)) {
    const rel = toPosix(relative(root, filePath));
    const parts = rel.split("/");
    const filename = parts.at(-1) ?? "";
    const ext = extname(filename);
    const textId = filename.slice(0, -ext.length);
    if (parts.length !== 2 || ext !== ".ogg") {
      fail(`${toPosix(relative(repoRoot, filePath))} must use ${labelPath}/<locale>/<textId>.ogg.`);
      continue;
    }
    if (!voiceTextIdPattern.test(textId)) {
      fail(`${toPosix(relative(repoRoot, filePath))} uses invalid voice textId '${textId}'. Use only letters, numbers, '_' and '-'.`);
    }
  }
}

function checkFontAssetLayout(root, labelPath) {
  if (!existsSync(root)) return;
  const seenStems = new Map();
  for (const filePath of walkFiles(root)) {
    const rel = toPosix(relative(root, filePath));
    const parts = rel.split("/");
    const filename = parts.at(-1) ?? "";
    const ext = extname(filename);
    if (rel === "README.md") continue;
    if (parts.length !== 1 || ![".woff", ".woff2", ".ttf", ".otf"].includes(ext)) {
      fail(`${toPosix(relative(repoRoot, filePath))} must use ${labelPath}/<fontId>.{woff,woff2,ttf,otf}.`);
      continue;
    }
    const stem = filename.slice(0, -ext.length);
    const previous = seenStems.get(stem);
    if (previous) {
      fail(`${toPosix(relative(repoRoot, filePath))} duplicates font stem '${stem}' already provided by ${previous}; keep only the shipped runtime format.`);
    } else {
      seenStems.set(stem, toPosix(relative(repoRoot, filePath)));
    }
  }
}

function checkBleepAssetLayout(root, labelPath) {
  if (!existsSync(root)) return;
  for (const filePath of walkFiles(root)) {
    const rel = toPosix(relative(root, filePath));
    const parts = rel.split("/");
    const filename = parts.at(-1) ?? "";
    const ext = extname(filename);
    const bleepId = filename.slice(0, -ext.length);
    if (parts.length !== 1 || ext !== ".ogg") {
      fail(`${toPosix(relative(repoRoot, filePath))} must use ${labelPath}/<bleepId>.ogg.`);
      continue;
    }
    if (!bleepAssetIdPattern.test(bleepId)) {
      fail(`${toPosix(relative(repoRoot, filePath))} uses invalid bleep id '${bleepId}'. Use only letters, numbers, '_' and '-'.`);
    }
  }
}

function checkCharacterPacks() {
  for (const asset of collectHarnessRuntimeAssets().filter((item) => item.kind === "character-pack")) {
    const entryPath = join(repoRoot, "apps/game-harness/public", asset.optimizedUri.replace(/^\//u, ""));
    if (!existsSync(entryPath)) {
      fail(`Character pack '${asset.id}' points to missing entry ${relative(repoRoot, entryPath)}.`);
      continue;
    }
    const packRoot = dirname(entryPath);
    try {
      const character = LayeredCharacterDefinitionSchema.parse(readJsonFile(entryPath));
      const layers = LayeredCharacterLayersSchema.parse(readJsonFile(join(packRoot, "layers.json")));
      const compositions = LayeredCharacterCompositionsSchema.parse(readJsonFile(join(packRoot, "compositions.json")));
      if (character.id !== asset.id) fail(`Character pack '${asset.id}' has mismatched character id '${character.id}'.`);
      if (!compositions.tokens.Default || compositions.tokens.Default.length === 0) {
        fail(`Character pack '${asset.id}' must define a non-empty Default composition token.`);
      }
      for (const [groupName, group] of Object.entries(layers.groups)) {
        for (const [layerName, ref] of Object.entries(group.layers)) {
          const texturePath = resolvePackPath(packRoot, ref.src);
          const metadataPath = resolvePackPath(packRoot, ref.metadata);
          if (!texturePath) fail(`Character pack '${asset.id}' layer ${groupName}>${layerName} uses out-of-pack texture path '${ref.src}'.`);
          else if (!existsSync(texturePath)) fail(`Character pack '${asset.id}' layer ${groupName}>${layerName} texture is missing: ${ref.src}.`);
          if (!metadataPath) fail(`Character pack '${asset.id}' layer ${groupName}>${layerName} uses out-of-pack metadata path '${ref.metadata}'.`);
          else if (!existsSync(metadataPath)) fail(`Character pack '${asset.id}' layer ${groupName}>${layerName} metadata is missing: ${ref.metadata}.`);
          else LayeredCharacterLayerMetadataSchema.parse(readJsonFile(metadataPath));
        }
      }
    } catch (error) {
      fail(`Character pack '${asset.id}' failed schema validation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function checkReferencesResolve(config) {
  const { knownAssetIds, knownFontFaceIds } = collectRegisteredIds(config);
  for (const filePath of config.referenceFiles) {
    const content = readFileSync(filePath, "utf8");
    for (const match of content.matchAll(assetIdPattern)) {
      const id = match[0];
      if (!knownAssetIds.has(id)) {
        fail(`${toPosix(relative(repoRoot, filePath))} references undeclared runtime asset '${id}'.`);
      }
    }
    for (const match of content.matchAll(characterPackCommandPattern)) {
      const command = match[1];
      const primary = match[2];
      const id = characterPackIdForCommand(command, primary);
      if (id && !knownAssetIds.has(id)) {
        fail(`${toPosix(relative(repoRoot, filePath))} references undeclared character-pack asset '${id}' in @${command}.`);
      }
    }
    for (const match of content.matchAll(richTextFontFacePattern)) {
      const fontId = match[1] ?? match[2] ?? match[3];
      if (fontId && !knownFontFaceIds.has(fontId)) {
        fail(`${toPosix(relative(repoRoot, filePath))} references undeclared rich text font face '${fontId}'.`);
      }
    }
  }
}

function characterPackIdForCommand(command, primary) {
  if (!primary || primary === "*") return undefined;
  const value = primary.startsWith("id:") ? primary.slice(3) : primary;
  if (command === "slide" && !value.includes(".")) return undefined;
  const id = value.split(/[.,]/u)[0];
  return id && id !== "*" && !id.includes(":") ? id : undefined;
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolvePackPath(packRoot, relativePath) {
  const resolved = resolve(packRoot, relativePath);
  return resolved === packRoot || resolved.startsWith(`${packRoot}${sep}`) ? resolved : undefined;
}

function collectRegisteredIds(config) {
  const ids = new Set(config.assets.map((asset) => asset.id));
  if (config.includePixiFxIds && existsSync(pixiFxAssetsPath)) {
    const content = readFileSync(pixiFxAssetsPath, "utf8");
    for (const match of content.matchAll(/runtimeFxAsset\("([^"]+)"/gu)) {
      if (match[1]) ids.add(`fx:${match[1]}`);
    }
  }
  return {
    knownAssetIds: ids,
    knownFontFaceIds: new Set(config.fontFaces.map((font) => font.id))
  };
}

function checkNoHardcodedRuntimeAssetPaths() {
  for (const root of sourceRoots) {
    for (const filePath of walkFiles(root)) {
      const rel = toPosix(relative(repoRoot, filePath));
      if (allowedHardcodedFiles.has(rel)) continue;
      if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
      if (!/\.(ts|tsx|mjs)$/u.test(filePath)) continue;
      const content = readFileSync(filePath, "utf8");
      if (hardcodedAssetPattern.test(content)) fail(`${rel} contains a hardcoded runtime asset path; use AssetRegistry.`);
    }
  }
}

function walkFiles(root) {
  const output = [];
  if (!existsSync(root)) return output;
  for (const name of readdirSync(root)) {
    if (shouldSkipDirectory(name)) continue;
    const absolutePath = join(root, name);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) output.push(...walkFiles(absolutePath));
    else if (extname(name)) output.push(absolutePath);
  }
  return output;
}

function fixtureNaniFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => name.endsWith(".nani"))
    .map((name) => join(root, name));
}

function shouldSkipDirectory(name) {
  return name === "node_modules" || name === "dist" || name === "coverage" || name === ".turbo";
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function fail(message) {
  failed = true;
  console.error(message);
}
