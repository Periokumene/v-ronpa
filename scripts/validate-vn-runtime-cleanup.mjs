import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const root = process.cwd();
const failures = [];
const activeRoots = ["apps", "packages", "scripts", "docs/architecture", "AGENTS.md", "README.md"];
const legacySymbols = [
  "VnRuntimeDispatcher",
  "VnRuntimeDebugPort",
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
  "saving",
  "canStoryAdvanceFromSource",
  "canCompletePauseRuntimeWaitFromSource",
  "canToggleStoryAutomation",
  "shouldAnimateStoryPlayPacing"
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
for (const debugOnlySymbol of ["useVnRuntimeWithDebug", "UseVnRuntimeWithDebugResult", "VnRuntimeDebugSnapshot"]) {
  if (new RegExp(`\\b${debugOnlySymbol}\\b`, "u").test(runtimeIndex)) {
    failures.push(`packages/app-vn-runtime/src/index.ts: debug-only symbol '${debugOnlySymbol}' leaked through the product root.`);
  }
}

const runtimeTypes = readFileSync(join(root, "packages/app-vn-runtime/src/runtimeTypes.ts"), "utf8");
const debugSnapshotBody = runtimeTypes.match(/export\s+interface\s+VnRuntimeDebugSnapshot\s*\{([\s\S]*?)\n\}/u)?.[1];
if (!debugSnapshotBody) {
  failures.push("packages/app-vn-runtime/src/runtimeTypes.ts: missing read-only VnRuntimeDebugSnapshot.");
} else {
  if (!debugSnapshotBody.split("\n").filter((line) => line.trim().length > 0).every((line) => /\breadonly\b/u.test(line))) {
    failures.push("packages/app-vn-runtime/src/runtimeTypes.ts: every debug snapshot field must be read-only.");
  }
  if (/\w+\s*\([^)]*\)\s*:/u.test(debugSnapshotBody)) {
    failures.push("packages/app-vn-runtime/src/runtimeTypes.ts: debug snapshot must not expose product actions.");
  }
}

const harnessRuntimeAdapterPath = "apps/game-harness/src/interaction/useHarnessShowcaseRuntimeAdapter.ts";
const harnessRuntimeAdapter = readFileSync(join(root, harnessRuntimeAdapterPath), "utf8");
for (const flatAlias of [
  "advanceStory",
  "storyRuntime",
  "pixiStageRuntime",
  "toggleStoryAuto",
  "toggleStorySkip",
  "stopStoryAutomation"
]) {
  if (new RegExp(`^\\s{4}${flatAlias}\\s*[:,]`, "mu").test(harnessRuntimeAdapter)) {
    failures.push(`${harnessRuntimeAdapterPath}: flattened VN alias '${flatAlias}' is forbidden; expose the canonical port.`);
  }
}

checkNoImportOutside(
  "apps/game-a/src",
  "@v-ronpa/app-vn-runtime/debug",
  ["apps/game-a/src/devtools/"]
);
checkNoImportOutside(
  "apps/game-a/src",
  "@v-ronpa/app-vn-devtools",
  ["apps/game-a/src/devtools/"]
);

const productRuntimeHookPath = "packages/app-vn-runtime/src/useVnRuntime.ts";
const productRuntimeHook = readFileSync(join(root, productRuntimeHookPath), "utf8");
for (const debugToken of ["useVnRuntimeWithDebug", "createVnRuntimeDebugSnapshot", "VnRuntimeDebugSnapshot"]) {
  if (new RegExp(`\\b${debugToken}\\b`, "u").test(productRuntimeHook)) {
    failures.push(`${productRuntimeHookPath}: debug-only token '${debugToken}' leaked into the product hook module.`);
  }
}

const gameAProductAppPath = "apps/game-a/src/App.tsx";
const gameAProductApp = readFileSync(join(root, gameAProductAppPath), "utf8");
for (const devtoolsHostToken of ["PendingDevtoolsCommit", "await-session", "GameANaniDevtools"]) {
  if (new RegExp(`\\b${devtoolsHostToken}\\b`, "u").test(gameAProductApp)) {
    failures.push(`${gameAProductAppPath}: devtools host token '${devtoolsHostToken}' must stay in the DEV-only module.`);
  }
}

const gameADevHostPath = "apps/game-a/src/devtools/GameADevApp.tsx";
const gameADevHost = readFileSync(join(root, gameADevHostPath), "utf8");
for (const secondEntryModule of [
  "../gameARuntimeEntry",
  "../gameALaunchDefinition",
  "../gameATestEntries",
  "../gameASmokeLaunchDefinition",
  "../gameACharacterSmokeLaunchDefinition"
]) {
  if (moduleSpecifierPattern(secondEntryModule).test(stripComments(gameADevHost))) {
    failures.push(`${gameADevHostPath}: the DEV host must receive the Vite-selected entry from App instead of importing '${secondEntryModule}'.`);
  }
}

if (failures.length > 0) {
  console.error("VN runtime cleanup guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("VN runtime cleanup guard passed.");

function checkNoImport(path, specifier) {
  checkProductionPattern(path, moduleSpecifierPattern(specifier), `forbidden import '${specifier}'`);
}

function checkNoImportOutside(path, specifier, allowedPrefixes) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return;
  // A module specifier literal is forbidden regardless of whether it appears
  // in a static import, side-effect import, re-export, dynamic import, or
  // require(). This deliberately avoids maintaining several incomplete import
  // grammar regexes in a source-level guard.
  const importPattern = moduleSpecifierPattern(specifier);
  for (const file of collectFiles(absolute)) {
    const rel = toPosix(relative(root, file));
    if (allowedPrefixes.some((prefix) => rel.startsWith(prefix))) continue;
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/u.test(rel)) continue;
    if (!/\.(ts|tsx|js|jsx|mjs)$/u.test(rel)) continue;
    if (importPattern.test(stripComments(readFileSync(file, "utf8")))) {
      failures.push(`${rel}: debug runtime imports are restricted to the Game A devtools adapter.`);
    }
  }
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

function moduleSpecifierPattern(specifier) {
  return new RegExp(`["']${escapeRegExp(specifier)}(?:/[^"']*)?["']`, "u");
}

function toPosix(path) {
  return path.split(sep).join("/");
}
