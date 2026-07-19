import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { emptyProjectAssetIndex, parseCompositionTokens, parseGeneratedRuntimeAssets, type NaniProjectAssetIndex } from "./projectAssets";

export interface NaniAssetConfig {
  publicRoot: string;
  publicBaseUri: string;
  outputPath: string;
  exportName: string;
}

export interface LoadedProjectAssets {
  index: NaniProjectAssetIndex;
  characterPacks: Readonly<Record<string, NaniCharacterPackDescriptor>>;
  watchedPaths: string[];
  warnings: string[];
}

export interface NaniCharacterPackDescriptor {
  id: string;
  rootPath: string;
  characterPath: string;
}

export class ProjectAssetLoadError extends Error {
  constructor(message: string, readonly watchedPaths: string[], options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectAssetLoadError";
  }
}

export type AssetConfigImporter = (configPath: string) => Promise<unknown>;

export function projectAssetLoadingEnabled(isTrusted: boolean, uriScheme: string): boolean {
  return isTrusted && uriScheme === "file";
}

export function findNearestAssetConfig(documentPath: string, workspaceRoot: string): string | undefined {
  const root = resolve(workspaceRoot);
  let current = resolve(dirname(documentPath));
  if (!isWithin(root, current)) return undefined;
  while (true) {
    const candidate = join(current, "asset.config.mjs");
    if (existsSync(candidate)) return candidate;
    if (current === root) return undefined;
    const parent = dirname(current);
    if (parent === current || !isWithin(root, parent)) return undefined;
    current = parent;
  }
}

export function findNaniProjectRoot(configPath: string, workspaceRoot: string): string {
  const root = resolve(workspaceRoot);
  let current = resolve(dirname(configPath));
  while (isWithin(root, current)) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    if (current === root) break;
    current = dirname(current);
  }
  return root;
}

export async function loadProjectAssets(
  configPath: string,
  workspaceRoot: string,
  importConfig: AssetConfigImporter = importAssetConfig
): Promise<LoadedProjectAssets> {
  const projectRoot = findNaniProjectRoot(configPath, workspaceRoot);
  const config = assetConfig(await importConfig(configPath));
  const outputPath = resolveConfigPath(projectRoot, config.outputPath);
  const publicRoot = resolveConfigPath(projectRoot, config.publicRoot);
  let assets: ReturnType<typeof parseGeneratedRuntimeAssets>;
  try {
    assets = parseGeneratedRuntimeAssets(readFileSync(outputPath, "utf8"), config.exportName);
  } catch (error) {
    throw new ProjectAssetLoadError(
      `Could not load generated assets from ${outputPath}: ${errorMessage(error)}`,
      [configPath, outputPath],
      { cause: error }
    );
  }
  const characterTokens: Record<string, readonly string[]> = {};
  const characterPacks: Record<string, NaniCharacterPackDescriptor> = {};
  const watchedPaths = new Set([configPath, outputPath]);
  const warnings: string[] = [];

  for (const asset of assets) {
    if (asset.kind !== "character-pack") continue;
    const characterJson = assetFilePath(asset.optimizedUri, config.publicBaseUri, publicRoot);
    if (!characterJson) {
      warnings.push(`Could not map character asset '${asset.id}' URI '${asset.optimizedUri}' into publicRoot.`);
      continue;
    }
    const packRoot = dirname(characterJson);
    const descriptor = { id: asset.id, rootPath: packRoot, characterPath: characterJson };
    characterPacks[asset.id] = descriptor;
    characterPacks[asset.id.toLowerCase()] = descriptor;
    const layersPath = join(packRoot, "layers.json");
    const compositionsPath = join(packRoot, "compositions.json");
    watchedPaths.add(characterJson);
    watchedPaths.add(layersPath);
    watchedPaths.add(compositionsPath);
    if (!existsSync(compositionsPath)) {
      warnings.push(`Character asset '${asset.id}' has no compositions.json at ${compositionsPath}.`);
      continue;
    }
    try {
      const tokens = parseCompositionTokens(readFileSync(compositionsPath, "utf8"));
      characterTokens[asset.id] = tokens;
      characterTokens[asset.id.toLowerCase()] = tokens;
    } catch (error) {
      warnings.push(`Could not read ${compositionsPath}: ${errorMessage(error)}`);
    }
  }

  return {
    index: { assets, characterTokens },
    characterPacks,
    watchedPaths: [...watchedPaths],
    warnings
  };
}

export class ProjectAssetCache {
  private readonly values = new Map<string, Promise<LoadedProjectAssets>>();

  get(key: string, loader: () => Promise<LoadedProjectAssets>): Promise<LoadedProjectAssets> {
    const cached = this.values.get(key);
    if (cached) return cached;
    const value = loader();
    this.values.set(key, value);
    return value;
  }

  invalidate(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

export function disabledProjectAssets(): LoadedProjectAssets {
  return { index: emptyProjectAssetIndex, characterPacks: {}, watchedPaths: [], warnings: [] };
}

async function importAssetConfig(configPath: string): Promise<unknown> {
  const url = pathToFileURL(configPath);
  url.searchParams.set("vscodeNaniMtime", String(statSync(configPath).mtimeMs));
  const module: unknown = await import(url.href);
  return module;
}

function assetConfig(moduleValue: unknown): NaniAssetConfig {
  const moduleRecord = record(moduleValue, "Asset config module must export an object.");
  const config = record(moduleRecord.default, "Asset config module must have a default object export.");
  return {
    publicRoot: requiredString(config.publicRoot, "publicRoot"),
    publicBaseUri: requiredString(config.publicBaseUri, "publicBaseUri"),
    outputPath: requiredString(config.outputPath, "outputPath"),
    exportName: requiredString(config.exportName, "exportName")
  };
}

function assetFilePath(optimizedUri: string, publicBaseUri: string, publicRoot: string): string | undefined {
  const base = publicBaseUri.replace(/\/+$/u, "");
  if (optimizedUri !== base && !optimizedUri.startsWith(`${base}/`)) return undefined;
  const relativeUri = optimizedUri.slice(base.length).replace(/^\/+/, "");
  const candidate = resolve(publicRoot, relativeUri.split("/").join(sep));
  return isWithin(publicRoot, candidate) ? candidate : undefined;
}

function resolveConfigPath(projectRoot: string, value: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(projectRoot, value);
}

function isWithin(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Asset config '${field}' must be a non-empty string.`);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
