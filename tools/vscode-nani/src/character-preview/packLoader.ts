import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  LayeredCharacterCompositionsSchema,
  LayeredCharacterDefinitionSchema,
  LayeredCharacterLayerMetadataSchema,
  LayeredCharacterLayersSchema,
  type LayeredCharacterLayerMetadata
} from "@v-ronpa/contracts";
import { resolveLayeredCharacter, resolveLayeredCharacterLayerRefs } from "@v-ronpa/layered-character";
import type { NaniCharacterPackDescriptor } from "../project-resources";
import { calculateLayerGeometry, unionPreviewBounds } from "./geometry";
import type { CharacterPreviewRequest, ResolvedCharacterPreview, ResolvedPreviewLayer } from "./types";

export const CHARACTER_PREVIEW_RENDERER_VERSION = "static-svg-v1";

export type CharacterPreviewFileReader = (path: string) => Promise<Buffer>;

export class CharacterPreviewLoadError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CharacterPreviewLoadError";
  }
}

export async function loadResolvedCharacterPreview(
  descriptor: NaniCharacterPackDescriptor,
  request: CharacterPreviewRequest,
  fileReader: CharacterPreviewFileReader = readFile
): Promise<ResolvedCharacterPreview> {
  try {
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
    const character = LayeredCharacterDefinitionSchema.parse(parseJson(characterBytes, corePaths.character));
    const layers = LayeredCharacterLayersSchema.parse(parseJson(layersBytes, corePaths.layers));
    const compositions = LayeredCharacterCompositionsSchema.parse(parseJson(compositionsBytes, corePaths.compositions));
    const refs = resolveLayeredCharacterLayerRefs({
      character,
      layers,
      compositions,
      appearanceExpression: request.appearanceExpression
    });
    assertNoResolverDiagnostics(refs.diagnostics, request);

    const metadataByPath: Record<string, LayeredCharacterLayerMetadata> = {};
    const metadataBytesByPath = new Map<string, Buffer>();
    const metadataPaths = [...new Set(refs.activeLayers.map((layer) => layer.metadataPath))];
    await Promise.all(metadataPaths.map(async (metadataPath) => {
      const path = safePackPath(root, metadataPath);
      const bytes = await fileReader(path);
      metadataBytesByPath.set(metadataPath, bytes);
      metadataByPath[metadataPath] = LayeredCharacterLayerMetadataSchema.parse(parseJson(bytes, path));
    }));

    const resolved = resolveLayeredCharacter({
      character,
      layers,
      compositions,
      metadataByPath,
      appearanceExpression: request.appearanceExpression
    });
    assertNoResolverDiagnostics(resolved.diagnostics, request);
    if (resolved.activeLayers.length === 0) {
      throw new CharacterPreviewLoadError("empty-layer-set", "角色组成没有任何活动图层。");
    }

    const pngBytesByPath = new Map<string, Buffer>();
    await Promise.all([...new Set(resolved.activeLayers.map((layer) => layer.src))].map(async (sourcePath) => {
      const path = safePackPath(root, sourcePath);
      pngBytesByPath.set(sourcePath, await fileReader(path));
    }));
    const previewLayers: ResolvedPreviewLayer[] = resolved.activeLayers.map((layer) => {
      const path = safePackPath(root, layer.src);
      const png = pngBytesByPath.get(layer.src);
      if (!png) throw new CharacterPreviewLoadError("missing-png", `未加载活动图层 PNG：${path}`);
      const dimensions = pngDimensions(png, path);
      return { id: layer.id, png, ...dimensions, metadata: layer.metadata };
    });
    const stageScale = character.renderSpace.stageScale;
    const characterAnchor = character.renderSpace.characterAnchor;
    const bounds = unionPreviewBounds(previewLayers.map((layer) => calculateLayerGeometry({
      width: layer.width,
      height: layer.height,
      metadata: layer.metadata,
      stageScale,
      characterAnchor
    }).bounds));
    const fingerprint = previewFingerprint(
      request,
      [
        ["character.json", characterBytes],
        ["layers.json", layersBytes],
        ["compositions.json", compositionsBytes],
        ...[...metadataBytesByPath.entries()],
        ...[...pngBytesByPath.entries()]
      ]
    );
    return {
      request,
      stageScale,
      characterAnchor,
      layers: previewLayers,
      bounds,
      fingerprint,
      packRoot: root
    };
  } catch (error) {
    if (error instanceof CharacterPreviewLoadError) throw error;
    throw new CharacterPreviewLoadError(
      "pack-load-failed",
      `无法加载角色 '${request.characterId}'：${errorMessage(error)}`,
      { cause: error }
    );
  }
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
