import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assetProjectRoot,
  scanAssetProject,
  type AssetProjectConfig
} from "@v-ronpa/asset-project";
import { emptyProjectAssetIndex, parseCompositionTokens, type NaniProjectAssetIndex } from "./projectAssets";

export interface LoadedProjectAssets {
  index: NaniProjectAssetIndex;
  characterPacks: Readonly<Record<string, NaniCharacterPackDescriptor>>;
  watchedPaths: string[];
  warnings: string[];
  assetBindings: {
    appId: string;
    assets: NaniProjectAssetIndex["assets"];
    characterAssetIdByCharacterId: Readonly<Record<string, string>>;
  };
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
  _workspaceRoot: string,
  importConfig: AssetConfigImporter = importAssetConfig
): Promise<LoadedProjectAssets> {
  let config: AssetProjectConfig;
  try {
    const moduleValue = record(await importConfig(configPath), "Asset config module must export an object.");
    config = record(moduleValue.default, "Asset config module must have a default object export.") as unknown as AssetProjectConfig;
    if (!config.appId || !config.root || !config.mount || !config.configDir) {
      throw new Error("Asset config must be created by defineAssetProject().");
    }
  } catch (error) {
    throw new ProjectAssetLoadError(`Could not load asset project: ${errorMessage(error)}`, [configPath], { cause: error });
  }

  const scan = await scanAssetProject(config);
  const root = assetProjectRoot(config);
  const characterTokens: Record<string, readonly string[]> = {};
  const characterPacks: Record<string, NaniCharacterPackDescriptor> = {};
  const warnings: string[] = [];
  const characters = Object.entries(scan.characterAssetIdByCharacterId).map(([characterId, assetId]) => ({ characterId, assetId }));
  for (const { characterId, assetId } of characters) {
    const asset = scan.assets.find((candidate) => candidate.id === assetId);
    if (!asset) continue;
    const relativeEntry = asset.uri.slice(`${config.mount}/`.length);
    const characterPath = resolve(root, relativeEntry);
    const packRoot = dirname(characterPath);
    const descriptor = { id: characterId, rootPath: packRoot, characterPath };
    characterPacks[characterId] = descriptor;
    characterPacks[characterId.toLowerCase()] = descriptor;
    const compositionsPath = join(packRoot, "compositions.json");
    if (!existsSync(compositionsPath)) {
      warnings.push(`Character '${characterId}' has no compositions.json at ${compositionsPath}.`);
      continue;
    }
    try {
      const tokens = parseCompositionTokens(readFileSync(compositionsPath, "utf8"));
      characterTokens[characterId] = tokens;
      characterTokens[characterId.toLowerCase()] = tokens;
    } catch (error) {
      warnings.push(`Could not read ${compositionsPath}: ${errorMessage(error)}`);
    }
  }

  return {
    index: { assets: [...scan.assets], characters, characterTokens },
    characterPacks,
    watchedPaths: [configPath, ...scan.files.map((file) => file.absolutePath)],
    warnings,
    assetBindings: {
      appId: config.appId,
      assets: [...scan.assets],
      characterAssetIdByCharacterId: scan.characterAssetIdByCharacterId
    }
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
  invalidate(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
}

export function disabledProjectAssets(): LoadedProjectAssets {
  return {
    index: emptyProjectAssetIndex,
    characterPacks: {},
    watchedPaths: [],
    warnings: [],
    assetBindings: { appId: "disabled", assets: [], characterAssetIdByCharacterId: {} }
  };
}

async function importAssetConfig(configPath: string): Promise<unknown> {
  const url = pathToFileURL(configPath);
  url.searchParams.set("vscodeNaniMtime", String(statSync(configPath).mtimeMs));
  return import(url.href);
}

function isWithin(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
