import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const appDirectory = process.argv[2];
if (!appDirectory || !/^[a-z0-9-]+$/u.test(appDirectory)) {
  console.error("Usage: node scripts/validate-app-asset-build.mjs <app-directory>");
  process.exit(1);
}

const appRoot = join(repoRoot, "apps", appDirectory);
const sourceRoot = join(appRoot, "assets");
const distRoot = join(appRoot, "dist");
const publishedRoot = join(distRoot, "assets");
const bundleRoot = join(distRoot, "_bundle");
const failures = [];

for (const [label, path] of [["source assets", sourceRoot], ["published assets", publishedRoot], ["bundle output", bundleRoot]]) {
  if (!existsSync(path) || !statSync(path).isDirectory()) failures.push(`${label} directory is missing: ${relative(repoRoot, path)}`);
}

if (existsSync(distRoot)) {
  const topLevel = readdirSync(distRoot).sort();
  const unexpected = topLevel.filter((name) => !["_bundle", "assets", "index.html"].includes(name));
  if (unexpected.length > 0) failures.push(`unexpected dist top-level entries: ${unexpected.join(", ")}`);
}

if (existsSync(sourceRoot) && existsSync(publishedRoot)) {
  const sourceFiles = collectFiles(sourceRoot).map((path) => relative(sourceRoot, path)).sort();
  const publishedFiles = collectFiles(publishedRoot).map((path) => relative(publishedRoot, path)).sort();
  if (JSON.stringify(sourceFiles) !== JSON.stringify(publishedFiles)) {
    failures.push("dist/assets file list does not exactly match the App asset source root");
  } else {
    for (const path of sourceFiles) {
      if (!readFileSync(join(sourceRoot, path)).equals(readFileSync(join(publishedRoot, path)))) {
        failures.push(`published asset bytes differ from source: ${path}`);
      }
    }
  }
}

if (existsSync(distRoot)) {
  for (const path of collectFiles(distRoot)) {
    if (![".css", ".html", ".js", ".json"].includes(extname(path))) continue;
    const text = readFileSync(path, "utf8");
    for (const legacy of ["/game-a/backgrounds/", "/game-a/characters/", "/game-a/media/", "/harness/backgrounds/", "/harness/characters/", "/harness/media/", "public/game-a", "public/harness"]) {
      if (text.includes(legacy)) failures.push(`${relative(repoRoot, path)} contains legacy static path '${legacy}'`);
    }
  }
}

if (failures.length > 0) {
  console.error(`${appDirectory} asset build validation failed:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`${appDirectory} asset build validation passed.`);

function collectFiles(root, output = []) {
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) collectFiles(path, output);
    else output.push(path);
  }
  return output;
}
