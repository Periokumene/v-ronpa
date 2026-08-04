import { readFile, readdir, lstat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AssetDefinitionSchema, AssetIdSchema, type AssetDefinition, type AssetId } from "@v-ronpa/contracts";

export interface AssetBundleRootConfig {
  path: string;
  entry: string;
}

export interface AssetProjectConfigInput {
  appId: string;
  root: string;
  mount?: string;
  generatedModule: string;
  bundleRoots?: readonly AssetBundleRootConfig[];
}

export interface AssetProjectConfig extends AssetProjectConfigInput {
  configDir: string;
  mount: string;
  bundleRoots: readonly AssetBundleRootConfig[];
}

export interface AssetProjectFile {
  absolutePath: string;
  relativePath: string;
}

export interface AssetProjectScan {
  assets: readonly AssetDefinition[];
  characterAssetIdByCharacterId: Readonly<Record<string, AssetId>>;
  files: readonly AssetProjectFile[];
}

const mimeByExtension = new Map<string, string>([
  [".avif", "image/avif"],
  [".glb", "model/gltf-binary"],
  [".gltf", "model/gltf+json"],
  [".json", "application/json"],
  [".ktx2", "image/ktx2"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".ogg", "audio/ogg"],
  [".otf", "font/otf"],
  [".png", "image/png"],
  [".ttf", "font/ttf"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

export function defineAssetProject(configUrl: string, input: AssetProjectConfigInput): AssetProjectConfig {
  const configDir = dirname(fileURLToPath(configUrl));
  if (!input.appId.trim()) throw new Error("asset project appId must be non-empty.");
  if (isAbsolute(input.root) || isAbsolute(input.generatedModule)) {
    throw new Error("asset project paths must be relative to the config file.");
  }
  const mount = normalizeRelativePath(input.mount ?? "assets", "asset project mount");
  return {
    ...input,
    configDir,
    root: normalizeRelativePath(input.root, "asset project root"),
    generatedModule: normalizeRelativePath(input.generatedModule, "asset project generatedModule"),
    mount,
    bundleRoots: (input.bundleRoots ?? []).map((bundle) => ({
      path: normalizeRelativePath(bundle.path, "asset bundle root"),
      entry: normalizeRelativePath(bundle.entry, "asset bundle entry")
    }))
  };
}

export async function scanAssetProject(config: AssetProjectConfig): Promise<AssetProjectScan> {
  const assetRoot = resolve(config.configDir, config.root);
  const files = await walkFiles(assetRoot);
  const bundleDirectories = new Map<string, AssetBundleRootConfig>();
  for (const bundleRoot of config.bundleRoots) {
    const absoluteBundleRoot = resolve(assetRoot, bundleRoot.path);
    assertWithin(assetRoot, absoluteBundleRoot, `bundle root '${bundleRoot.path}'`);
    const entries = await readdir(absoluteBundleRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) throw new Error(`Asset bundle root '${bundleRoot.path}' may only contain directories.`);
      const relativeDirectory = toPosix(join(bundleRoot.path, entry.name));
      const bundleId = AssetIdSchema.parse(relativeDirectory);
      bundleDirectories.set(relativeDirectory, bundleRoot);
      if (!files.some((file) => file.relativePath === `${relativeDirectory}/${bundleRoot.entry}`)) {
        throw new Error(`Asset bundle '${bundleId}' is missing entry '${bundleRoot.entry}'.`);
      }
    }
  }

  const assets: AssetDefinition[] = [];
  const characterAssetIdByCharacterId: Record<string, AssetId> = {};
  for (const [bundleDirectory, bundleRoot] of bundleDirectories) {
    const id = AssetIdSchema.parse(bundleDirectory);
    const entryPath = `${bundleDirectory}/${bundleRoot.entry}`;
    const entryFile = files.find((file) => file.relativePath === entryPath);
    if (!entryFile) throw new Error(`Asset bundle '${id}' entry disappeared during scanning.`);
    assets.push(AssetDefinitionSchema.parse({
      id,
      uri: `${config.mount}/${entryPath}`,
      mimeType: mimeTypeForPath(entryPath)
    }));
    if (bundleDirectory.startsWith("char/")) {
      const parsed = JSON.parse(await readFile(entryFile.absolutePath, "utf8")) as { id?: unknown };
      if (typeof parsed.id !== "string" || !parsed.id.trim()) {
        throw new Error(`Character bundle '${id}' entry must declare a non-empty string id.`);
      }
      if (characterAssetIdByCharacterId[parsed.id]) {
        throw new Error(`Character id '${parsed.id}' is declared by more than one asset bundle.`);
      }
      characterAssetIdByCharacterId[parsed.id] = id;
    }
  }

  for (const file of files) {
    if ([...bundleDirectories.keys()].some((directory) => file.relativePath.startsWith(`${directory}/`))) continue;
    const extension = extname(file.relativePath);
    const stem = file.relativePath.slice(0, -extension.length);
    const id = AssetIdSchema.parse(stem);
    assets.push(AssetDefinitionSchema.parse({
      id,
      uri: `${config.mount}/${file.relativePath}`,
      mimeType: mimeTypeForPath(file.relativePath)
    }));
  }

  const byId = new Map<AssetId, AssetDefinition>();
  for (const asset of assets) {
    const previous = byId.get(asset.id);
    if (previous) throw new Error(`Duplicate AssetId '${asset.id}' from '${previous.uri}' and '${asset.uri}'.`);
    byId.set(asset.id, asset);
  }
  return {
    assets: [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)),
    characterAssetIdByCharacterId: Object.fromEntries(
      Object.entries(characterAssetIdByCharacterId).sort(([left], [right]) => left.localeCompare(right))
    ),
    files
  };
}

export function assetProjectRoot(config: AssetProjectConfig): string {
  return resolve(config.configDir, config.root);
}

export function assetProjectGeneratedModule(config: AssetProjectConfig): string {
  return resolve(config.configDir, config.generatedModule);
}

export function mimeTypeForPath(path: string): string {
  const extension = extname(path);
  const mimeType = mimeByExtension.get(extension);
  if (!mimeType) throw new Error(`Unsupported asset extension '${extension || "(none)"}' in '${path}'.`);
  return mimeType;
}

async function walkFiles(root: string): Promise<AssetProjectFile[]> {
  const output: AssetProjectFile[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const stat = await lstat(absolutePath);
      if (stat.isSymbolicLink()) throw new Error(`Asset symlinks are not allowed: '${absolutePath}'.`);
      if (stat.isDirectory()) await visit(absolutePath);
      else if (stat.isFile()) {
        const relativePath = toPosix(relative(root, absolutePath));
        mimeTypeForPath(relativePath);
        output.push({ absolutePath, relativePath });
      }
    }
  }
  await visit(root);
  return output;
}

function normalizeRelativePath(value: string, label: string): string {
  const normalized = value.replace(/^\.\//u, "").replace(/\/$/u, "");
  if (!normalized || normalized.split(/[\\/]/u).some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${label} must be a non-empty relative path without dot segments.`);
  }
  return toPosix(normalized);
}

function assertWithin(root: string, candidate: string, label: string): void {
  const rel = relative(root, candidate);
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) return;
  throw new Error(`${label} escapes the asset root.`);
}

function toPosix(value: string): string {
  return value.split(sep).join("/");
}
