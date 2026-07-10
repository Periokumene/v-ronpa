import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const root = process.cwd();
const failures = [];
const activeRoots = ["apps", "packages", "scripts", "docs/architecture", "AGENTS.md"];
const legacySymbols = [
  "VnRuntimeDispatcher",
  "VnShellRuntimeAdapter",
  "VnRuntimeStateAdapter",
  "UPDATE_CONTEXT",
  "createVnSaveSnapshot",
  "createSaveableStoryRuntimeSnapshot",
  "builtInPixiFxRuntimeAssets",
  "includePixiFxIds",
  "GAME_A_PAUSE_ENTRY_OVERLAY",
  "createSaveMigrator",
  "SaveMigrator",
  "saving"
];

for (const sourceRoot of activeRoots) {
  const absolute = join(root, sourceRoot);
  if (!existsSync(absolute)) continue;
  for (const file of statSync(absolute).isDirectory() ? collectFiles(absolute) : [absolute]) {
    const rel = toPosix(relative(root, file));
    if (rel === "scripts/validate-vn-runtime-cleanup.mjs" || /\.(test|spec)\.(ts|tsx|js|jsx)$/u.test(rel)) continue;
    if (![".ts", ".tsx", ".js", ".mjs", ".md"].includes(extname(file))) continue;
    const text = stripComments(readFileSync(file, "utf8"));
    for (const symbol of legacySymbols) {
      if (new RegExp(`\\b${symbol}\\b`, "u").test(text)) failures.push(`${rel}: legacy symbol '${symbol}'.`);
    }
  }
}

checkNoImport("packages/app-vn-dispatch/src", "@v-ronpa/pixi-presenter");
checkNoImport("packages/app-vn-runtime/src", "@v-ronpa/pixi-presenter");
checkProductionToken("packages/pixi-presenter/src", "RuntimeCommand", "presenter must not interpret RuntimeCommand");
checkProductionPattern("apps", /\binterface\s+Vn\w*Port\b/u, "apps must not define parallel VN runtime ports");
checkProductionPattern(
  "packages/runtime-assets-pixi/src",
  /\b(createAssetRegistry|composeContentManifest|ContentManifest|AssetResolver|loader)\b/u,
  "runtime asset providers may only export fragments"
);

const runtimeIndex = readFileSync(join(root, "packages/app-vn-runtime/src/index.ts"), "utf8");
if (/export\s+\*/u.test(runtimeIndex)) failures.push("packages/app-vn-runtime/src/index.ts: wildcard exports are forbidden.");

if (failures.length > 0) {
  console.error("VN runtime cleanup guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("VN runtime cleanup guard passed.");

function checkNoImport(path, specifier) {
  checkProductionPattern(path, new RegExp(`from\\s+["']${escapeRegExp(specifier)}(?:/[^"']*)?["']`, "u"), `forbidden import '${specifier}'`);
}

function checkProductionToken(path, token, label) {
  checkProductionPattern(path, new RegExp(`\\b${escapeRegExp(token)}\\b`, "u"), label);
}

function checkProductionPattern(path, pattern, label) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return;
  for (const file of statSync(absolute).isDirectory() ? collectFiles(absolute) : [absolute]) {
    const rel = toPosix(relative(root, file));
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/u.test(rel)) continue;
    if (!/\.(ts|tsx|js|jsx|mjs)$/u.test(rel)) continue;
    if (pattern.test(stripComments(readFileSync(file, "utf8")))) failures.push(`${rel}: ${label}.`);
  }
}

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", ".git"].includes(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) collectFiles(path, files);
    else files.push(path);
  }
  return files;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:])\/\/.*$/gmu, "$1");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function toPosix(path) {
  return path.split(sep).join("/");
}
