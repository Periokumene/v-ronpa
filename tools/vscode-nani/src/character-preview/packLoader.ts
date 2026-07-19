import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  LayeredCharacterCompositionsSchema,
  LayeredCharacterDefinitionSchema,
  LayeredCharacterLayerMetadataSchema,
  LayeredCharacterLayersSchema,
  type LayeredCharacterCompositions,
  type LayeredCharacterDefinition,
  type LayeredCharacterLayerMetadata,
  type LayeredCharacterLayers
} from "@v-ronpa/contracts";
import { resolveLayeredCharacter, resolveLayeredCharacterLayerRefs } from "@v-ronpa/layered-character";
import type { NaniCharacterPackDescriptor } from "../project-resources";
import { calculateLayerGeometry, unionPreviewBounds } from "./geometry";
import type {
  CharacterPreviewRequest,
  ResolvedCharacterCompletionPreview,
  ResolvedCharacterPreview,
  ResolvedPreviewLayer
} from "./types";

export const CHARACTER_PREVIEW_RENDERER_VERSION = "static-svg-v1";

export type CharacterPreviewFileReader = (path: string) => Promise<Buffer>;

export class CharacterPreviewLoadError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CharacterPreviewLoadError";
  }
}

interface LoadedCharacterPackCore {
  root: string;
  character: LayeredCharacterDefinition;
  layers: LayeredCharacterLayers;
  compositions: LayeredCharacterCompositions;
  fingerprintEntries: readonly (readonly [string, Buffer])[];
}

export async function loadResolvedCharacterPreview(
  descriptor: NaniCharacterPackDescriptor,
  request: CharacterPreviewRequest,
  fileReader: CharacterPreviewFileReader = readFile
): Promise<ResolvedCharacterPreview> {
  try {
    const core = await loadCharacterPackCore(descriptor, fileReader);
    return await loadResolvedPreviewFromCore(core, request, fileReader);
  } catch (error) {
    throw normalizePackLoadError(error, request);
  }
}

export async function loadResolvedCharacterCompletionPreview(
  descriptor: NaniCharacterPackDescriptor,
  request: CharacterPreviewRequest,
  baseAppearanceExpression: string,
  fileReader: CharacterPreviewFileReader = readFile
): Promise<ResolvedCharacterCompletionPreview> {
  try {
    const core = await loadCharacterPackCore(descriptor, fileReader);
    const baseRefs = resolveLayeredCharacterLayerRefs({
      character: core.character,
      layers: core.layers,
      compositions: core.compositions,
      appearanceExpression: baseAppearanceExpression
    });
    assertNoResolverDiagnostics(baseRefs.diagnostics, request);
    const complete = await loadResolvedPreviewFromCore(core, request, fileReader);
    const previousLayerIds = new Set(baseRefs.activeLayers.map((layer) => layer.id));
    const contributionLayers = complete.layers.filter((layer) => !previousLayerIds.has(layer.id));
    if (contributionLayers.length === 0) return { complete };
    return {
      complete,
      contribution: {
        ...complete,
        layers: contributionLayers,
        bounds: previewBounds(
          contributionLayers,
          complete.stageScale,
          complete.characterAnchor
        ),
        fingerprint: contributionFingerprint(
          complete.fingerprint,
          baseAppearanceExpression,
          contributionLayers.map((layer) => layer.id)
        )
      }
    };
  } catch (error) {
    throw normalizePackLoadError(error, request);
  }
}

async function loadCharacterPackCore(
  descriptor: NaniCharacterPackDescriptor,
  fileReader: CharacterPreviewFileReader
): Promise<LoadedCharacterPackCore> {
  const root = resolve(descriptor.rootPath);
  const corePaths = {
    character: safePackPath(root, relative(root, descriptor.characterPath)),
    layers: safePackPath(root, "layers.json"),
    compositions: safePackPath(root, "compositions.json")
  };
  const [characterBytes, layersBytes, compositionsBytes] = await Promise.all([
    fileReader(corePaths.character),
    fileReader(corePaths.layers),
    fileReader(corePaths.compositions)
  ]);
  return {
    root,
    character: LayeredCharacterDefinitionSchema.parse(parseJson(characterBytes, corePaths.character)),
    layers: LayeredCharacterLayersSchema.parse(parseJson(layersBytes, corePaths.layers)),
    compositions: LayeredCharacterCompositionsSchema.parse(parseJson(compositionsBytes, corePaths.compositions)),
    fingerprintEntries: [
      ["character.json", characterBytes],
      ["layers.json", layersBytes],
      ["compositions.json", compositionsBytes]
    ]
  };
}

async function loadResolvedPreviewFromCore(
  core: LoadedCharacterPackCore,
  request: CharacterPreviewRequest,
  fileReader: CharacterPreviewFileReader
): Promise<ResolvedCharacterPreview> {
  const refs = resolveLayeredCharacterLayerRefs({
    character: core.character,
    layers: core.layers,
    compositions: core.compositions,
    appearanceExpression: request.appearanceExpression
  });
  assertNoResolverDiagnostics(refs.diagnostics, request);
  const metadataByPath: Record<string, LayeredCharacterLayerMetadata> = {};
  const metadataBytesByPath = new Map<string, Buffer>();
  const metadataPaths = [...new Set(refs.activeLayers.map((layer) => layer.metadataPath))];
  await Promise.all(metadataPaths.map(async (metadataPath) => {
    const path = safePackPath(core.root, metadataPath);
    const bytes = await fileReader(path);
    metadataBytesByPath.set(metadataPath, bytes);
    metadataByPath[metadataPath] = LayeredCharacterLayerMetadataSchema.parse(parseJson(bytes, path));
  }));
  const resolved = resolveLayeredCharacter({
    character: core.character,
    layers: core.layers,
    compositions: core.compositions,
    metadataByPath,
    appearanceExpression: request.appearanceExpression
  });
  assertNoResolverDiagnostics(resolved.diagnostics, request);
  if (resolved.activeLayers.length === 0) {
    throw new CharacterPreviewLoadError("empty-layer-set", "角色组成没有任何活动图层。");
  }
  const pngBytesByPath = new Map<string, Buffer>();
  await Promise.all([...new Set(resolved.activeLayers.map((layer) => layer.src))].map(async (sourcePath) => {
    const path = safePackPath(core.root, sourcePath);
    pngBytesByPath.set(sourcePath, await fileReader(path));
  }));
  const previewLayers: ResolvedPreviewLayer[] = resolved.activeLayers.map((layer) => {
    const path = safePackPath(core.root, layer.src);
    const png = pngBytesByPath.get(layer.src);
    if (!png) throw new CharacterPreviewLoadError("missing-png", `未加载活动图层 PNG：${path}`);
    return { id: layer.id, png, ...pngDimensions(png, path), metadata: layer.metadata };
  });
  const stageScale = core.character.renderSpace.stageScale;
  const characterAnchor = core.character.renderSpace.characterAnchor;
  return {
    request,
    stageScale,
    characterAnchor,
    layers: previewLayers,
    bounds: previewBounds(previewLayers, stageScale, characterAnchor),
    fingerprint: previewFingerprint(request, [
      ...core.fingerprintEntries,
      ...metadataBytesByPath.entries(),
      ...pngBytesByPath.entries()
    ]),
    packRoot: core.root
  };
}

function previewBounds(
  layers: readonly ResolvedPreviewLayer[],
  stageScale: number,
  characterAnchor: readonly [number, number]
) {
  return unionPreviewBounds(layers.map((layer) => calculateLayerGeometry({
    width: layer.width,
    height: layer.height,
    metadata: layer.metadata,
    stageScale,
    characterAnchor
  }).bounds));
}

function contributionFingerprint(
  completeFingerprint: string,
  baseAppearanceExpression: string,
  layerIds: readonly string[]
): string {
  return createHash("sha256")
    .update("completion-token-static-svg-v1-320x180")
    .update("\0")
    .update(completeFingerprint)
    .update("\0")
    .update(baseAppearanceExpression)
    .update("\0")
    .update(layerIds.join("\0"))
    .digest("hex");
}

export function pngDimensions(buffer: Buffer, path = "PNG"): { width: number; height: number } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString("ascii", 12, 16) !== "IHDR") {
    throw new CharacterPreviewLoadError("invalid-png", `${path} 不是有效的 PNG 文件。`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width <= 0 || height <= 0) {
    throw new CharacterPreviewLoadError("invalid-png-dimensions", `${path} 的 PNG 尺寸无效：${width}x${height}。`);
  }
  return { width, height };
}

function previewFingerprint(
  request: CharacterPreviewRequest,
  entries: readonly (readonly [string, Buffer])[]
): string {
  const hash = createHash("sha256");
  hash.update(CHARACTER_PREVIEW_RENDERER_VERSION);
  hash.update("\0");
  hash.update(request.characterId);
  hash.update("\0");
  hash.update(request.appearanceExpression);
  for (const [path, bytes] of [...entries].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update("\0");
    hash.update(path);
    hash.update("\0");
    hash.update(bytes);
  }
  return hash.digest("hex");
}

function assertNoResolverDiagnostics(
  diagnostics: readonly { message: string }[],
  request: CharacterPreviewRequest
): void {
  if (diagnostics.length === 0) return;
  throw new CharacterPreviewLoadError(
    "invalid-appearance",
    `角色 '${request.characterId}' 的外观表达式无效：${diagnostics.map((item) => item.message).join(" ")}`
  );
}

function safePackPath(root: string, relativePath: string): string {
  if (!relativePath || isAbsolute(relativePath)) {
    throw new CharacterPreviewLoadError("unsafe-pack-path", `角色包路径不安全：${relativePath}`);
  }
  const candidate = resolve(join(root, relativePath));
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new CharacterPreviewLoadError("unsafe-pack-path", `角色包路径越界：${relativePath}`);
  }
  return candidate;
}

function parseJson(bytes: Buffer, path: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new CharacterPreviewLoadError("invalid-json", `${path} 不是有效 JSON：${errorMessage(error)}`, { cause: error });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizePackLoadError(
  error: unknown,
  request: CharacterPreviewRequest
): CharacterPreviewLoadError {
  if (error instanceof CharacterPreviewLoadError) return error;
  return new CharacterPreviewLoadError(
    "pack-load-failed",
    `无法加载角色 '${request.characterId}'：${errorMessage(error)}`,
    { cause: error }
  );
}
