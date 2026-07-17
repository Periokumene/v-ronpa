import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const dist = join(root, "apps/game-a/dist");
const forbidden = [
  "CHECKPOINT SMOKE",
  "CHECKPOINT CHARACTER",
  "vn:game-a-test-",
  "game-a/test/"
];
const failures = [];

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
