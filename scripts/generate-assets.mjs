import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import gameAAssetConfigInput from "../apps/game-a/asset.config.mjs";
import harnessAssetConfigInput from "../apps/game-harness/asset.config.mjs";
import { analyzeNaniCatalog } from "../packages/nani-project/src/index.ts";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const providerModuleById = new Map([
  ["pixi", { module: "@v-ronpa/runtime-assets-pixi", exportName: "pixiRuntimeAssetFragment" }]
]);

const kindByDirectory = new Map([
  ["backgrounds", "background"],
  ["media/bleep", "bleep"],
  ["media/bgm", "bgm"],
  ["media/sfx", "sfx"],
  ["media/video", "video"],
  ["fonts", "font"],
  ["models", "glb"],
  ["thumbnails", "texture"],
  ["ui", "texture"]
]);

const formatByExtension = new Map([
  [".gltf", "gltf"], [".glb", "glb"], [".json", "json"],
  [".png", "png"], [".webp", "webp"], [".avif", "avif"], [".ktx2", "ktx2"],
  [".woff", "woff"], [".woff2", "woff2"], [".ttf", "ttf"], [".otf", "otf"],
  [".mp3", "mp3"], [".ogg", "ogg"], [".mp4", "mp4"], [".webm", "webm"]
]);

const fontFormatPreference = new Map([
  ["woff2", 4], ["woff", 3], ["otf", 2], ["ttf", 1]
]);

const harnessAssetConfig = normalizeAssetConfig(harnessAssetConfigInput);
const gameAAssetConfig = normalizeAssetConfig(gameAAssetConfigInput);

export function collectHarnessRuntimeAssets() {
  return collectRuntimeAssets(harnessAssetConfig);
}

export function collectHarnessFontFaces() {
  return collectFontFaces(collectHarnessRuntimeAssets(), harnessAssetConfig);
}

export function collectGameARuntimeAssets() {
  return collectRuntimeAssets(gameAAssetConfig);
}

export function collectGameAFontFaces() {
  return collectFontFaces(collectGameARuntimeAssets(), gameAAssetConfig);
}

export function generateHarnessRuntimeAssetsModule() {
  return generateRuntimeAssetsModule(
    collectHarnessRuntimeAssets(),
    collectHarnessFontFaces(),
    harnessAssetConfig
  );
}

export function generateGameARuntimeAssetsModule() {
  return generateRuntimeAssetsModule(
    collectGameARuntimeAssets(),
    collectGameAFontFaces(),
    gameAAssetConfig
  );
}

export async function analyzeHarnessNaniProduction(sourceDiagnosticPolicy = "allow-recoverable-command-errors") {
  return analyzeNaniCatalog(harnessAssetConfig.naniProject, {
    projectRoot: repoRoot,
    scopes: ["production"],
    entry: harnessAssetConfig.naniProject.mainEntry,
    sourceDiagnosticPolicy
  });
}

export async function analyzeGameANaniProduction(sourceDiagnosticPolicy = "allow-recoverable-command-errors") {
  return analyzeNaniCatalog(gameAAssetConfig.naniProject, {
    projectRoot: repoRoot,
    scopes: ["production"],
    entry: gameAAssetConfig.naniProject.mainEntry,
    sourceDiagnosticPolicy
  });
}

export async function analyzeGameANaniDevelopment(sourceDiagnosticPolicy = "allow-recoverable-command-errors") {
  return analyzeNaniCatalog(gameAAssetConfig.naniProject, {
    projectRoot: repoRoot,
    scopes: ["production", "development"],
    entry: gameAAssetConfig.naniProject.mainEntry,
    sourceDiagnosticPolicy
  });
}

export async function analyzeGameANaniTests(
  entryName = "smoke",
  sourceDiagnosticPolicy = "allow-recoverable-command-errors"
) {
  const entry = gameAAssetConfig.naniProject.testEntries[entryName];
  if (!entry) throw new Error(`Unknown Game A test entry '${entryName}'.`);
  return analyzeNaniCatalog(gameAAssetConfig.naniProject, {
    projectRoot: repoRoot,
    scopes: ["test"],
    entry,
    sourceDiagnosticPolicy
  });
}

export async function generateHarnessNaniProductionModule() {
  const analysis = await analyzeHarnessNaniProduction();
  assertGenerationHasNoFatalDiagnostics(analysis, "Harness production");
  return generateNaniModule(analysis, "harness", "Production");
}

export async function generateGameANaniProductionModule() {
  const analysis = await analyzeGameANaniProduction();
  assertGenerationHasNoFatalDiagnostics(analysis, "Game A production");
  return generateNaniModule(analysis, "gameA", "Production");
}

export async function generateGameANaniTestsModule() {
  const entries = Object.entries(gameAAssetConfig.naniProject.testEntries);
  const analyses = await Promise.all(entries.map(async ([name]) => [name, await analyzeGameANaniTests(name)]));
  for (const [name, analysis] of analyses) {
    assertGenerationHasNoFatalDiagnostics(analysis, `Game A test entry '${name}'`);
  }
  const reference = analyses[0]?.[1];
  if (!reference) throw new Error("Game A must declare at least one Nani test entry.");
  return generateNaniTestsModule(analyses, reference, "gameA");
}

function generateRuntimeAssetsModule(assets, fontFaces, config) {
  const providerImports = config.providers.map((id) => {
    const provider = providerModuleById.get(id);
    if (!provider) throw new Error(`Unknown runtime asset provider '${id}' in ${config.id}.`);
    return `import { ${provider.exportName} } from \"${provider.module}\";`;
  });
  const providerExports = config.providers.map((id) => providerModuleById.get(id).exportName).join(", ");
  return [
    "import type { FontFaceDefinition, RuntimeAsset } from \"@v-ronpa/contracts\";",
    "import type { RuntimeAssetFragment } from \"@v-ronpa/asset-registry\";",
    ...providerImports,
    "",
    "// Generated by scripts/generate-assets.mjs. Do not edit by hand.",
    `export const ${config.exportName} = ${json(assets)} satisfies RuntimeAsset[];`,
    "",
    `export const ${config.fontFacesExportName} = ${json(fontFaces)} satisfies FontFaceDefinition[];`,
    "",
    `export const ${config.fragmentsExportName} = [${providerExports}] satisfies RuntimeAssetFragment[];`,
    ""
  ].join("\n");
}

function generateNaniModule(analysis, prefix, suffix) {
  const metadataByPath = Object.fromEntries(analysis.scripts.map((script) => [script.scriptPath, script.metadata]));
  const sourcesByPath = Object.fromEntries(analysis.scripts.map((script) => [script.scriptPath, script.source]));
  const revisions = Object.fromEntries(analysis.scripts.map((script) => [script.scriptPath, script.semanticRevision]));
  const diagnostics = analysis.diagnostics;
  return [
    "import type { AssetRef, VnEntryDef, VnRuntimeScriptCatalog, VnRuntimeScriptSource } from \"@v-ronpa/contracts\";",
    "import type { LayeredCharacterPreloadPlan } from \"@v-ronpa/layered-character\";",
    "",
    "// Generated by scripts/generate-assets.mjs. Do not edit by hand.",
    `export const ${prefix}VnEntryLocator = ${json(entryLocator(analysis.entry))} as const satisfies Pick<VnEntryDef, \"id\" | \"initialScriptPath\" | \"startLabel\">;`,
    "",
    `export const ${prefix}ScriptMetadataByPath = ${json(metadataByPath)} satisfies Record<string, { scriptRevision: string; assetRefs: AssetRef[]; characterPreloadPlan: LayeredCharacterPreloadPlan }>;`,
    "",
    `export const ${prefix}ScriptSourcesByPath = ${json(sourcesByPath)} satisfies Record<string, VnRuntimeScriptSource>;`,
    "",
    `export const ${prefix}ScriptCatalog = ${json(analysis.catalog)} as const satisfies VnRuntimeScriptCatalog;`,
    "",
    `export const ${prefix}Nani${suffix}SemanticRevisions = ${json(revisions)} as const;`,
    "",
    `export const ${prefix}Nani${suffix}Diagnostics = ${json(diagnostics)} as const;`,
    ""
  ].join("\n");
}

function generateNaniTestsModule(analyses, reference, prefix) {
  const entryLocators = Object.fromEntries(analyses.map(([name, analysis]) => [name, entryLocator(analysis.entry)]));
  const metadataByPath = Object.fromEntries(reference.scripts.map((script) => [script.scriptPath, script.metadata]));
  const sourcesByPath = Object.fromEntries(reference.scripts.map((script) => [script.scriptPath, script.source]));
  const revisions = Object.fromEntries(reference.scripts.map((script) => [script.scriptPath, script.semanticRevision]));
  const diagnostics = Object.fromEntries(analyses.map(([name, analysis]) => [name, analysis.diagnostics]));
  return [
    "import type { AssetRef, VnEntryDef, VnRuntimeScriptCatalog, VnRuntimeScriptSource } from \"@v-ronpa/contracts\";",
    "import type { LayeredCharacterPreloadPlan } from \"@v-ronpa/layered-character\";",
    "",
    "// Generated by scripts/generate-assets.mjs. Do not edit by hand.",
    `export const ${prefix}TestEntryLocators = ${json(entryLocators)} as const satisfies Record<string, Pick<VnEntryDef, \"id\" | \"initialScriptPath\" | \"startLabel\">>;`,
    "",
    `export const ${prefix}TestScriptMetadataByPath = ${json(metadataByPath)} satisfies Record<string, { scriptRevision: string; assetRefs: AssetRef[]; characterPreloadPlan: LayeredCharacterPreloadPlan }>;`,
    "",
    `export const ${prefix}TestScriptSourcesByPath = ${json(sourcesByPath)} satisfies Record<string, VnRuntimeScriptSource>;`,
    "",
    `export const ${prefix}TestScriptCatalog = ${json(reference.catalog)} as const satisfies VnRuntimeScriptCatalog;`,
    "",
    `export const ${prefix}NaniTestSemanticRevisions = ${json(revisions)} as const;`,
    "",
    `export const ${prefix}NaniTestDiagnostics = ${json(diagnostics)} as const;`,
    ""
  ].join("\n");
}

function assertGenerationHasNoFatalDiagnostics(analysis, label) {
  if (!analysis.hasFatalDiagnostics) return;
  const messages = analysis.diagnostics
    .filter((diagnostic) => diagnostic.disposition === "fatal")
    .map((diagnostic) => diagnostic.message)
    .join("; ");
  throw new Error(`${label} Nani catalog is fatal: ${messages}`);
}

function entryLocator(entry) {
  return {
    id: entry.id,
    initialScriptPath: entry.initialScriptPath,
    ...(entry.startLabel ? { startLabel: entry.startLabel } : {})
  };
}

function collectRuntimeAssets(config) {
  if (!existsSync(config.publicRoot)) return [];
  const assets = walkFiles(config.publicRoot)
    .flatMap((absolutePath) => {
      const rel = toPosix(relative(config.publicRoot, absolutePath));
      const format = formatByExtension.get(extname(rel));
      if (!format) return [];
      const kind = kindForRelativePath(rel);
      if (!kind) return [];
      const asset = {
        id: idForRelativePath(rel, kind, config),
        kind,
        optimizedUri: `${config.publicBaseUri}/${rel}`,
        format,
        compression: [],
        lods: [],
        collisionProxyIds: []
      };
      return [{ ...asset, tags: tagsForAsset(config, asset) }];
    })
    .sort((left, right) => stableCompare(left.id, right.id) || stableCompare(left.format, right.format));
  return selectPreferredGeneratedAssets(assets);
}

function kindForRelativePath(rel) {
  const parts = rel.split("/");
  if (parts[0] === "media" && parts[1] === "voice") return parts.length === 4 ? "voice" : undefined;
  if (/^characters\/[^/]+\/character\.json$/u.test(rel)) return "character-pack";
  return kindByDirectory.get(parts.slice(0, -1).join("/"));
}

function idForRelativePath(rel, kind, config) {
  const override = config.idOverrides[rel];
  if (override) return override;
  if (kind === "character-pack") return rel.split("/")[1];
  const name = rel.split("/").at(-1).replace(extname(rel), "");
  if (kind === "voice") return `voice:${rel.split("/").at(2)}:${name}`;
  if (kind === "background") return `bg:${name}`;
  if (kind === "bleep") return `bleep:${name}`;
  if (kind === "bgm") return `bgm:${name}`;
  if (kind === "sfx") return `sfx:${name}`;
  if (kind === "video") return `video:${name}`;
  if (kind === "glb") return `model:${name}`;
  if (kind === "font") return `font:${name}`;
  if (rel.startsWith("ui/")) return `texture:ui:${name}`;
  return `texture:${name}`;
}

function collectFontFaces(assets, config) {
  return assets
    .filter((asset) => asset.kind === "font")
    .map((asset) => {
      const override = config.fontFaceOverrides[asset.id] ?? {};
      return {
        id: override.id ?? asset.id,
        family: override.family ?? asset.id,
        sourceRef: asset.id,
        weight: override.weight ?? "400",
        style: override.style ?? "normal"
      };
    })
    .sort((left, right) => stableCompare(left.id, right.id));
}

function selectPreferredGeneratedAssets(assets) {
  const byId = new Map();
  for (const asset of assets) {
    const previous = byId.get(asset.id);
    if (!previous) {
      byId.set(asset.id, asset);
      continue;
    }
    if (previous.kind === "font" && asset.kind === "font") {
      byId.set(asset.id, preferredFontAsset(previous, asset));
      continue;
    }
    throw new Error(`Duplicate generated runtime asset id '${asset.id}' from ${previous.optimizedUri} and ${asset.optimizedUri}.`);
  }
  return [...byId.values()].sort((left, right) => stableCompare(left.id, right.id));
}

function preferredFontAsset(left, right) {
  const leftPreference = fontFormatPreference.get(left.format) ?? 0;
  const rightPreference = fontFormatPreference.get(right.format) ?? 0;
  return rightPreference > leftPreference ? right : left;
}

function walkFiles(root) {
  const output = [];
  for (const name of readdirSync(root)) {
    const absolutePath = join(root, name);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) output.push(...walkFiles(absolutePath));
    else output.push(absolutePath);
  }
  return output;
}

function normalizeAssetConfig(config) {
  return {
    ...config,
    publicRoot: join(repoRoot, config.publicRoot),
    runtimeAssetOutputPath: join(repoRoot, config.runtimeAssetOutputPath),
    naniProductionOutputPath: join(repoRoot, config.naniProductionOutputPath),
    ...(config.naniTestsOutputPath
      ? { naniTestsOutputPath: join(repoRoot, config.naniTestsOutputPath) }
      : {}),
    idOverrides: config.idOverrides ?? {},
    fontFaceOverrides: config.fontFaceOverrides ?? {},
    providers: config.providers ?? []
  };
}

function tagsForAsset(config, asset) {
  if (asset.kind === "texture" && asset.id.startsWith("texture:ui:") && config.uiTextureTags) {
    return config.uiTextureTags;
  }
  return config.tags;
}

function json(value) {
  return JSON.stringify(value, null, 2).replace(/\n/g, "\n  ");
}

function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toPosix(value) {
  return value.split("\\").join("/");
}

async function collectOutputs() {
  const [
    harnessNaniProduction,
    gameANaniProduction,
    gameANaniTests
  ] = await Promise.all([
    generateHarnessNaniProductionModule(),
    generateGameANaniProductionModule(),
    generateGameANaniTestsModule()
  ]);
  return [
    { path: harnessAssetConfig.runtimeAssetOutputPath, content: generateHarnessRuntimeAssetsModule() },
    { path: harnessAssetConfig.naniProductionOutputPath, content: harnessNaniProduction },
    { path: gameAAssetConfig.runtimeAssetOutputPath, content: generateGameARuntimeAssetsModule() },
    { path: gameAAssetConfig.naniProductionOutputPath, content: gameANaniProduction },
    { path: gameAAssetConfig.naniTestsOutputPath, content: gameANaniTests }
  ];
}

async function reportDevelopmentDiagnostics() {
  try {
    const analysis = await analyzeGameANaniDevelopment();
    for (const diagnostic of analysis.diagnostics.filter((item) => item.scope === "development")) {
      console.warn(`[development:${diagnostic.disposition}] ${diagnostic.scriptPath ?? "catalog"}: ${diagnostic.message}`);
    }
  } catch (error) {
    console.warn(`[development:fatal] ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  const outputs = await collectOutputs();
  await reportDevelopmentDiagnostics();
  if (process.argv.includes("--check")) {
    for (const output of outputs) {
      const current = existsSync(output.path) ? readFileSync(output.path, "utf8") : "";
      if (current !== output.content) {
        console.error(`${relative(repoRoot, output.path)} is out of date. Run pnpm generate:assets.`);
        process.exitCode = 1;
      }
    }
    return;
  }
  for (const output of outputs) writeFileSync(output.path, output.content);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
