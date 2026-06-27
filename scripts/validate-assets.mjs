import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { collectHarnessRuntimeAssets, generateHarnessRuntimeAssetsModule } from "./generate-assets.mjs";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const generatedPath = join(repoRoot, "apps/game/src/harness/generatedAssets.ts");
const pixiFxAssetsPath = join(repoRoot, "packages/pixi-presenter/src/internal/fxAssets.ts");
const sourceRoots = ["apps/game/src", "packages", "scripts"].map((path) => join(repoRoot, path));
const harnessReferenceFiles = ["apps/game/src/harness/fixtures/verticalSlice.ts"].map((path) => join(repoRoot, path));
const hardcodedAssetPattern = /(["'`])(?:\/harness\/|\.\/assets\/|\.\.\/assets\/|https?:\/\/|data:image\/|blob:)[^"'`]*\.(?:png|webp|avif|ktx2|ogg|mp3|mp4|webm|gltf|glb)\1/u;
const assetIdPattern = /\b(?:bg|portrait|bgm|sfx|voice|video|model|texture|fx):[a-zA-Z0-9:_./-]+/gu;
const allowedHardcodedFiles = new Set([
  "apps/game/src/harness/generatedAssets.ts",
  "packages/pixi-presenter/src/internal/fxAssets.ts",
  "scripts/generate-assets.mjs",
  "scripts/validate-assets.mjs"
]);

let failed = false;

checkGeneratedAssets();
checkHarnessFilesExist();
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

function checkHarnessReferencesResolve() {
  const knownAssetIds = collectRegisteredAssetIds();
  for (const filePath of harnessReferenceFiles) {
    const content = readFileSync(filePath, "utf8");
    for (const match of content.matchAll(assetIdPattern)) {
      const id = match[0];
      if (!knownAssetIds.has(id)) {
        fail(`${toPosix(relative(repoRoot, filePath))} references undeclared runtime asset '${id}'.`);
      }
    }
  }
}

function collectRegisteredAssetIds() {
  const ids = new Set(collectHarnessRuntimeAssets().map((asset) => asset.id));
  if (!existsSync(pixiFxAssetsPath)) return ids;
  const content = readFileSync(pixiFxAssetsPath, "utf8");
  for (const match of content.matchAll(/runtimeFxAsset\("([^"]+)"/gu)) {
    if (match[1]) ids.add(`fx:${match[1]}`);
  }
  return ids;
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
