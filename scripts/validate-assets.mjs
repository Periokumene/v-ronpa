import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collectHarnessRuntimeAssets, generateHarnessRuntimeAssetsModule } from "./generate-assets.mjs";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const {
  LayeredCharacterCompositionsSchema,
  LayeredCharacterDefinitionSchema,
  LayeredCharacterLayerMetadataSchema,
  LayeredCharacterLayersSchema
} = await import(pathToFileURL(join(repoRoot, "packages/contracts/src/index.ts")).href);
const generatedPath = join(repoRoot, "apps/game/src/harness/generatedAssets.ts");
const contentManifestPath = join(repoRoot, "apps/game/src/harness/contentManifest.ts");
const pixiFxAssetsPath = join(repoRoot, "packages/pixi-presenter/src/internal/fxAssets.ts");
const bleepAssetsRoot = join(repoRoot, "apps/game/public/harness/media/bleep");
const voiceAssetsRoot = join(repoRoot, "apps/game/public/harness/media/voice");
const sourceRoots = ["apps/game/src", "packages", "scripts"].map((path) => join(repoRoot, path));
const harnessReferenceFiles = [
  join(repoRoot, "apps/game/src/harness/fixtures/verticalSlice.ts"),
  join(repoRoot, "docs/nani/basic-p1-example.md"),
  ...fixtureNaniFiles(join(repoRoot, "packages/nani-parser/fixtures"))
];
const hardcodedAssetPattern = /(["'`])(?:\/harness\/|\.\/assets\/|\.\.\/assets\/|https?:\/\/|data:image\/|blob:)[^"'`]*\.(?:json|png|webp|avif|ktx2|woff2?|ttf|otf|ogg|mp3|mp4|webm|gltf|glb)\1/u;
const assetIdPattern = /\b(?:bg|bgm|sfx|bleep|voice|video|model|texture|fx):[a-zA-Z0-9:_./-]+/gu;
const richTextFontFacePattern = /<font\b[^>]*\bface\s*=\s*(?:"(font:[a-zA-Z0-9:_./-]+)"|'(font:[a-zA-Z0-9:_./-]+)'|(font:[a-zA-Z0-9:_./-]+))/gu;
const bleepAssetIdPattern = /^[a-zA-Z0-9_-]+$/u;
const voiceTextIdPattern = /^[a-zA-Z0-9_-]+$/u;
const characterPackCommandPattern = /^\s*@(char|slide)\s+([^\s]+)/gmu;
const allowedHardcodedFiles = new Set([
  "apps/game/src/harness/generatedAssets.ts",
  "packages/pixi-presenter/src/internal/fxAssets.ts",
  "scripts/generate-assets.mjs",
  "scripts/validate-assets.mjs"
]);

let failed = false;

checkGeneratedAssets();
checkHarnessFilesExist();
checkHarnessBleepAssetLayout();
checkHarnessVoiceAssetLayout();
checkHarnessFontAssetLayout();
checkCharacterPacks();
checkContentManifestReferencesResolve();
checkHarnessReferencesResolve();
checkNoHardcodedRuntimeAssetPaths();

if (failed) process.exitCode = 1;

function checkGeneratedAssets() {
  const expected = generateHarnessRuntimeAssetsModule();
  const current = existsSync(generatedPath) ? readFileSync(generatedPath, "utf8") : "";
  if (current !== expected) fail(`${relative(repoRoot, generatedPath)} is out of date. Run pnpm generate:assets.`);
}

function checkHarnessFilesExist() {
  const ids = new Set();
  for (const asset of collectHarnessRuntimeAssets()) {
    if (ids.has(asset.id)) fail(`Duplicate generated asset id '${asset.id}'.`);
    ids.add(asset.id);
    const filePath = join(repoRoot, "apps/game/public", asset.optimizedUri.replace(/^\//u, ""));
    if (!existsSync(filePath)) fail(`Generated asset '${asset.id}' points to missing file ${relative(repoRoot, filePath)}.`);
  }
}

function checkHarnessVoiceAssetLayout() {
  if (!existsSync(voiceAssetsRoot)) return;
  for (const filePath of walkFiles(voiceAssetsRoot)) {
    const rel = toPosix(relative(voiceAssetsRoot, filePath));
    const parts = rel.split("/");
    const filename = parts.at(-1) ?? "";
    const ext = extname(filename);
    const textId = filename.slice(0, -ext.length);
    if (parts.length !== 2 || ext !== ".ogg") {
      fail(`${toPosix(relative(repoRoot, filePath))} must use apps/game/public/harness/media/voice/<locale>/<textId>.ogg.`);
      continue;
    }
    if (!voiceTextIdPattern.test(textId)) {
      fail(`${toPosix(relative(repoRoot, filePath))} uses invalid voice textId '${textId}'. Use only letters, numbers, '_' and '-'.`);
    }
  }
}

function checkHarnessFontAssetLayout() {
  const fontsRoot = join(repoRoot, "apps/game/public/harness/fonts");
  if (!existsSync(fontsRoot)) return;
  for (const filePath of walkFiles(fontsRoot)) {
    const rel = toPosix(relative(fontsRoot, filePath));
    const parts = rel.split("/");
    const ext = extname(parts.at(-1) ?? "");
    if (rel === "README.md") continue;
    if (parts.length !== 1 || ![".woff", ".woff2", ".ttf", ".otf"].includes(ext)) {
      fail(`${toPosix(relative(repoRoot, filePath))} must use apps/game/public/harness/fonts/<fontId>.{woff,woff2,ttf,otf}.`);
    }
  }
}

function checkHarnessBleepAssetLayout() {
  if (!existsSync(bleepAssetsRoot)) return;
  for (const filePath of walkFiles(bleepAssetsRoot)) {
    const rel = toPosix(relative(bleepAssetsRoot, filePath));
    const parts = rel.split("/");
    const filename = parts.at(-1) ?? "";
    const ext = extname(filename);
    const bleepId = filename.slice(0, -ext.length);
    if (parts.length !== 1 || ext !== ".ogg") {
      fail(`${toPosix(relative(repoRoot, filePath))} must use apps/game/public/harness/media/bleep/<bleepId>.ogg.`);
      continue;
    }
    if (!bleepAssetIdPattern.test(bleepId)) {
      fail(`${toPosix(relative(repoRoot, filePath))} uses invalid bleep id '${bleepId}'. Use only letters, numbers, '_' and '-'.`);
    }
  }
}

function checkCharacterPacks() {
  for (const asset of collectHarnessRuntimeAssets().filter((item) => item.kind === "character-pack")) {
    const entryPath = join(repoRoot, "apps/game/public", asset.optimizedUri.replace(/^\//u, ""));
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

function checkHarnessReferencesResolve() {
  const { knownAssetIds, knownFontFaceIds } = collectRegisteredIds();
  for (const filePath of harnessReferenceFiles) {
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

function checkContentManifestReferencesResolve() {
  const knownAssets = collectRegisteredAssetMap();
  for (const font of collectManifestFontFaces()) {
    const asset = knownAssets.get(font.sourceRef);
    if (!asset) {
      fail(`ContentManifest font '${font.id}' references undeclared runtime asset '${font.sourceRef}'.`);
    } else if (asset.kind !== "font") {
      fail(`ContentManifest font '${font.id}' references '${font.sourceRef}', which is '${asset.kind}', not 'font'.`);
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

function collectRegisteredIds() {
  const ids = new Set(collectRegisteredAssetMap().keys());
  if (existsSync(pixiFxAssetsPath)) {
    const content = readFileSync(pixiFxAssetsPath, "utf8");
    for (const match of content.matchAll(/runtimeFxAsset\("([^"]+)"/gu)) {
      if (match[1]) ids.add(`fx:${match[1]}`);
    }
  }
  return {
    knownAssetIds: ids,
    knownFontFaceIds: new Set(collectManifestFontFaces().map((font) => font.id))
  };
}

function collectRegisteredAssetMap() {
  return new Map(collectHarnessRuntimeAssets().map((asset) => [asset.id, asset]));
}

function collectManifestFontFaces() {
  if (!existsSync(contentManifestPath)) return [];
  const content = readFileSync(contentManifestPath, "utf8");
  const block = content.match(/fonts:\s*\[([\s\S]*?)\],\s*uiAssets/u)?.[1] ?? "";
  const fonts = [];
  for (const match of block.matchAll(/\{([\s\S]*?)\}/gu)) {
    const body = match[1] ?? "";
    const id = body.match(/\bid:\s*"([^"]+)"/u)?.[1];
    const sourceRef = body.match(/\bsourceRef:\s*"([^"]+)"/u)?.[1];
    if (id && sourceRef) fonts.push({ id, sourceRef });
  }
  return fonts;
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
