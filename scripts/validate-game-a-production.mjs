import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const dist = join(root, "apps/game-a/dist");
const forbidden = [
  "CHECKPOINT SMOKE",
  "CHECKPOINT CHARACTER",
  "vn:game-a-test-",
  "game-a/test/",
  "gameATestScriptMetadataByPath",
  "gameASmokeLaunchDefinition",
  "gameACharacterSmokeLaunchDefinition",
  "vn:game-a-smoke",
  "game-a/smoke.nani",
  "Nani Workbench",
  "vn-devtools-dock",
  "v-ronpa:nani-devtools-update",
  "v-ronpa:game-a:nani-devtools",
  "game-a-shell-with-devtools",
  "await-session"
];
const failures = [];

if (!existsSync(dist)) {
  console.error(`Game A production content check failed: ${relative(root, dist)} does not exist.`);
  process.exit(1);
}

for (const file of collectFiles(dist)) {
  if (![".js", ".css", ".html", ".json"].includes(extname(file))) continue;
  const text = readFileSync(file, "utf8");
  for (const marker of forbidden) {
    if (text.includes(marker)) failures.push(`${relative(root, file)} contains test-only marker '${marker}'.`);
  }
}

if (failures.length > 0) {
  console.error("Game A production content check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Game A production content check passed.");

function collectFiles(path, files = []) {
  if (!existsSync(path)) return files;
  for (const name of readdirSync(path)) {
    const target = join(path, name);
    if (statSync(target).isDirectory()) collectFiles(target, files);
    else files.push(target);
  }
  return files;
}
