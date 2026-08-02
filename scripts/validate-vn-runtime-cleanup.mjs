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
  "shouldAnimateStoryPlayPacing",
  "VnRuntimeEntry",
  "GameAVnLaunchDefinition",
  "gameALaunchDefinition",
  "activeLaunchDefinition",
  "gameAOpeningLaunchDefinition",
  "resolveGameALaunchDefinitionModule",
  "inspectVnDebugEntry",
  "VnDebugEntryInspection",
  "VnScriptPresentationPreparationReason",
  "preparationReason",
  "gameADevtoolsCommit",
  "GameADevtoolsCommitSettlement",
  "entryInitialScriptPath",
  "entryStartLabel",
  "testScripts"
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
for (const debugOnlySymbol of [
  "useVnRuntimeWithDebug",
  "UseVnRuntimeWithDebugResult",
  "VnRuntimeDebugSnapshot",
  "compileVnRuntimeCatalog"
]) {
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
for (const sharedTransactionToken of [
  "commitSequenceRef",
  "pendingCommitRef",
  "pendingRollbackRef",
  "installVnDevtoolsHostCommit",
  "createVnDevtoolsHostCommitSettlement"
]) {
  if (new RegExp(`\\b${sharedTransactionToken}\\b`, "u").test(stripComments(gameADevHost))) {
    failures.push(`${gameADevHostPath}: shared Devtools transaction token '${sharedTransactionToken}' must stay in app-vn-devtools.`);
  }
}

const contractsPath = "packages/contracts/src/index.ts";
const contracts = readFileSync(join(root, contractsPath), "utf8");
const vnEntrySchemaBody = contracts.match(/export const VnEntryDefSchema\s*=\s*z[\s\S]*?\.strict\(\);/u)?.[0];
if (!vnEntrySchemaBody) {
  failures.push(`${contractsPath}: missing canonical VnEntryDefSchema.`);
} else {
  for (const entryLevelField of ["scriptPath", "scriptRevision", "sourceText", "characterPreloadPlan"]) {
    if (new RegExp(`\\b${entryLevelField}\\s*:`, "u").test(vnEntrySchemaBody)) {
      failures.push(`${contractsPath}: entry-level '${entryLevelField}' is forbidden; script identity belongs to the catalog record.`);
    }
  }
  if (!/\binitialScriptPath\s*:/u.test(vnEntrySchemaBody)) {
    failures.push(`${contractsPath}: VnEntryDefSchema must expose the catalog-owned initialScriptPath.`);
  }
}

const gameAViteConfigPath = "apps/game-a/vite.config.ts";
const gameAViteConfig = stripComments(readFileSync(join(root, gameAViteConfigPath), "utf8"));
if (!/gameAAssetConfig\.naniProject/u.test(gameAViteConfig)) {
  failures.push(`${gameAViteConfigPath}: Nani Devtools discovery must come from gameAAssetConfig.naniProject.`);
}
if (/gameAAssetConfig\.scripts\b/u.test(gameAViteConfig)) {
  failures.push(`${gameAViteConfigPath}: explicit per-script Nani membership is forbidden.`);
}
for (const hardcodedEntryIdentity of ["vn:game-a-main", "vn:game-a-test-smoke", "vn:game-a-test-character"]) {
  if (gameAViteConfig.includes(hardcodedEntryIdentity)) {
    failures.push(`${gameAViteConfigPath}: entry identity '${hardcodedEntryIdentity}' must come from asset.config.mjs.`);
  }
}

const gameAContentManifestPath = "apps/game-a/src/contentManifest.ts";
const gameAContentManifest = stripComments(readFileSync(join(root, gameAContentManifestPath), "utf8"));
for (const hardcodedLocator of ["vn:game-a-main", "game-a/opening.nani"]) {
  if (gameAContentManifest.includes(hardcodedLocator)) {
    failures.push(`${gameAContentManifestPath}: entry locator '${hardcodedLocator}' must come from generated assets.`);
  }
}

const gameAStoryDefinitionPath = "apps/game-a/src/gameAScripts.ts";
const gameAStoryDefinition = stripComments(readFileSync(join(root, gameAStoryDefinitionPath), "utf8"));
if (/Object\.values\s*\(\s*gameAScriptSourcesByPath\s*\)/u.test(gameAStoryDefinition)) {
  failures.push(`${gameAStoryDefinitionPath}: the ordered generated catalog is the only runtime catalog authority.`);
}

for (const assetConfigPath of ["apps/game-a/asset.config.mjs", "apps/game-harness/asset.config.mjs"]) {
  const assetConfig = stripComments(readFileSync(join(root, assetConfigPath), "utf8"));
  if (!/\bnaniProject\s*:/u.test(assetConfig)) {
    failures.push(`${assetConfigPath}: missing canonical naniProject directory-discovery configuration.`);
  }
  for (const legacyPattern of [
    { pattern: /\bsourceFormat\s*:/u, label: "sourceFormat" },
    { pattern: /\btestCatalogs\s*:/u, label: "testCatalogs" },
    { pattern: /^\s*scripts\s*:/mu, label: "explicit scripts list" }
  ]) {
    if (legacyPattern.pattern.test(assetConfig)) {
      failures.push(`${assetConfigPath}: legacy ${legacyPattern.label} is forbidden.`);
    }
  }
}

for (const legacyPath of [
  "apps/game-a/src/generatedAssets.ts",
  "apps/game-a/src/generatedTestScripts.ts",
  "apps/game-harness/src/harness/generatedAssets.ts",
  "apps/game-harness/src/harness/showcase/script.ts",
  "apps/game-a/src/gameASmokeStoryDefinition.ts",
  "apps/game-a/src/gameACharacterSmokeStoryDefinition.ts",
  "apps/game-a/src/gameATestEntries.ts"
]) {
  if (existsSync(join(root, legacyPath))) failures.push(`${legacyPath}: legacy file must be deleted.`);
}

for (const [path, legacyModes] of [
  ["apps/game-a/vite.config.ts", ["game-a-smoke", "game-a-character-smoke"]],
  ["playwright.config.ts", ["game-a-smoke", "game-a-character-smoke"]]
]) {
  const text = readFileSync(join(root, path), "utf8");
  for (const mode of legacyModes) {
    if (text.includes(mode)) failures.push(`${path}: legacy Vite mode '${mode}' is forbidden.`);
  }
}

checkNoRetiredNaniSourceDirectoryNames();

const gameAApp = stripComments(readFileSync(join(root, gameAProductAppPath), "utf8"));
if (/const\s+prepareScriptPresentation\b/u.test(gameAApp)) {
  failures.push(`${gameAProductAppPath}: Pixi script preparation belongs to usePixiVnScriptPreparation in app-vn-shell.`);
}

const naniParserPath = "packages/nani-parser/src/parser.ts";
const naniParser = stripComments(readFileSync(join(root, naniParserPath), "utf8"));
if (/canonicalName\s*===\s*["']call["']/u.test(naniParser)) {
  failures.push(`${naniParserPath}: unsupported @call must not contribute dependency edges.`);
}

const pixiLayerPath = "packages/app-vn-shell/src/PixiLayer.tsx";
const pixiLayer = stripComments(readFileSync(join(root, pixiLayerPath), "utf8"));
if (!/initialCharacterPreloadPlanRef\s*=\s*useRef\(characterPreloadPlan\)/u.test(pixiLayer)) {
  failures.push(`${pixiLayerPath}: the initial character plan must be captured once for presenter mount.`);
}
if (/\},\s*\[[^\]]*characterPreloadPlan[^\]]*\]\);/u.test(pixiLayer)) {
  failures.push(`${pixiLayerPath}: character plan changes must use prepareCharacters and must not remount the presenter.`);
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

function checkNoRetiredNaniSourceDirectoryNames() {
  const retiredNames = [
    ["dev", "nani"].join("-"),
    ["test", "nani"].join("-")
  ];
  const searchableRoots = [
    "apps",
    "packages",
    "scripts",
    "tests",
    "tools",
    "docs",
    "playwright.config.ts",
    "package.json",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "tsconfig.base.json"
  ];
  const searchableExtensions = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".cts", ".mts",
    ".json", ".md", ".yaml", ".yml", ".toml", ".nani"
  ]);

  for (const searchableRoot of searchableRoots) {
    const absolute = join(root, searchableRoot);
    if (!existsSync(absolute)) continue;
    for (const file of statSync(absolute).isDirectory() ? collectFiles(absolute) : [absolute]) {
      const rel = toPosix(relative(root, file));
      if (
        rel === "scripts/validate-vn-runtime-cleanup.mjs"
        || rel.startsWith("tools/vscode-nani/.vscode-test/")
        || rel.startsWith("tools/vscode-nani/dist-types/")
      ) continue;
      if (!searchableExtensions.has(extname(file))) continue;
      const text = readFileSync(file, "utf8");
      for (const retiredName of retiredNames) {
        if (text.includes(retiredName)) {
          failures.push(`${rel}: retired Nani source directory '${retiredName}' is forbidden.`);
        }
      }
    }
  }
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
