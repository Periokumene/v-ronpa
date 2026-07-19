import type {
  LayeredCharacterCompositions,
  LayeredCharacterDefinition,
  LayeredCharacterLayerMetadata,
  LayeredCharacterLayers,
  RuntimeCommand,
  RuntimeScript
} from "@v-ronpa/contracts";

export type LayeredCharacterDiagnosticCode =
  | "invalid-expression"
  | "recursive-token"
  | "unknown-group"
  | "unknown-layer"
  | "unknown-token"
  | "missing-metadata";

export interface LayeredCharacterDiagnostic {
  code: LayeredCharacterDiagnosticCode;
  severity: "error";
  message: string;
  characterId: string;
  expression?: string;
  token?: string;
  group?: string;
  layer?: string;
  metadataPath?: string;
}

export interface ResolveLayeredCharacterInput {
  character: LayeredCharacterDefinition;
  layers: LayeredCharacterLayers;
  compositions: LayeredCharacterCompositions;
  metadataByPath: Record<string, LayeredCharacterLayerMetadata>;
  appearanceExpression?: string;
}

export interface ResolveLayeredCharacterLayerRefsInput {
  character: LayeredCharacterDefinition;
  layers: LayeredCharacterLayers;
  compositions: LayeredCharacterCompositions;
  appearanceExpression?: string;
}

export interface LayeredCharacterPreloadPlanEntry {
  characterId: string;
  appearanceExpressions: readonly string[];
}

export type LayeredCharacterPreloadPlan = readonly LayeredCharacterPreloadPlanEntry[];

/**
 * Derives the complete deterministic preload plan for layered-character commands in a runtime script.
 *
 * Wildcard expressions apply only to characters explicitly introduced by an `@char` command. Keeping
 * this projection next to the layered-character model gives asset generation and DEV source updates one
 * authority for deciding which expression textures must be prepared before presentation.
 */
export function deriveLayeredCharacterPreloadPlan(script: RuntimeScript): LayeredCharacterPreloadPlan {
  const characterIds = new Set<string>();
  for (const command of script.commands) {
    if (command.commandId !== "char") continue;
    const target = stringRuntimeParam(command, "target");
    if (target && target !== "*") characterIds.add(target);
  }

  const expressionsByCharacter = new Map(
    [...characterIds].map((characterId) => [characterId, new Set<string>()] as const)
  );
  const wildcardExpressions: string[] = [];
  for (const command of script.commands) {
    if (command.commandId !== "char" && command.commandId !== "slide") continue;
    const target = stringRuntimeParam(command, "target");
    const expression = stringRuntimeParam(command, "appearanceExpression");
    if (!target || expression === undefined) continue;
    if (target === "*") {
      wildcardExpressions.push(expression.trim());
      continue;
    }
    expressionsByCharacter.get(target)?.add(expression.trim());
  }
  for (const expressions of expressionsByCharacter.values()) {
    for (const expression of wildcardExpressions) expressions.add(expression);
  }

  return [...expressionsByCharacter]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([characterId, expressions]) => ({
      characterId,
      appearanceExpressions: [...expressions].sort((left, right) => left.localeCompare(right))
    }));
}

function stringRuntimeParam(command: RuntimeCommand, key: string): string | undefined {
  const value = command.params[key];
  return typeof value === "string" ? value : undefined;
}

export interface ResolvedLayeredCharacterLayerRef {
  id: string;
  group: string;
  layer: string;
  src: string;
  metadataPath: string;
}

export interface ResolvedLayeredCharacterLayer {
  id: string;
  group: string;
  layer: string;
  src: string;
  metadataPath: string;
  metadata: LayeredCharacterLayerMetadata;
}

export interface ResolveLayeredCharacterLayerRefsResult {
  characterId: string;
  expression: string;
  activeLayers: ResolvedLayeredCharacterLayerRef[];
  diagnostics: LayeredCharacterDiagnostic[];
}

export interface ResolveLayeredCharacterResult {
  characterId: string;
  expression: string;
  activeLayers: ResolvedLayeredCharacterLayer[];
  diagnostics: LayeredCharacterDiagnostic[];
}

interface ParsedExpression {
  group: string;
  op: ">" | "+" | "-";
  layer?: string;
}

export interface LayeredCharacterLayerBounds {
  min: [number, number];
  max: [number, number];
}

export interface LayeredCharacterTextureDimensions {
  width: number;
  height: number;
}

export type LayeredCharacterTextureDimensionsByLayerId = Record<string, LayeredCharacterTextureDimensions>;

export const LAYERED_CHARACTER_SOURCE_PIXEL_RELATIVE_EPSILON = 1e-6;

export type LayeredCharacterSourcePixelScaleErrorCode =
  | "empty-layer-set"
  | "invalid-source-pixel-scale"
  | "non-square-source-pixels"
  | "inconsistent-source-pixel-scale";

export interface LayeredCharacterSourcePixelLayer {
  id: string;
  metadata: LayeredCharacterLayerMetadata;
}

export type LayeredCharacterSourcePixelScaleResult =
  | { ok: true; unitsPerPixel: number }
  | { ok: false; code: LayeredCharacterSourcePixelScaleErrorCode; message: string };

export function resolveLayeredCharacterSourcePixelScale(
  layers: readonly LayeredCharacterSourcePixelLayer[]
): LayeredCharacterSourcePixelScaleResult {
  if (layers.length === 0) {
    return {
      ok: false,
      code: "empty-layer-set",
      message: "Layered character source-pixel scale requires at least one layer."
    };
  }

  let expectedUnitsPerPixel: number | undefined;
  let expectedLayerId = "";
  for (const layer of layers) {
    const scaleX = Math.abs(layer.metadata.localTransform.scale.x);
    const scaleY = Math.abs(layer.metadata.localTransform.scale.y);
    const pixelsPerUnit = layer.metadata.sprite.pixelsPerUnit;
    const unitsPerPixelX = scaleX / pixelsPerUnit;
    const unitsPerPixelY = scaleY / pixelsPerUnit;
    if (!Number.isFinite(unitsPerPixelX) || !Number.isFinite(unitsPerPixelY) || unitsPerPixelX <= 0 || unitsPerPixelY <= 0) {
      return {
        ok: false,
        code: "invalid-source-pixel-scale",
        message: `Layered character layer '${layer.id}' has invalid source-pixel scale ${unitsPerPixelX}x${unitsPerPixelY}.`
      };
    }
    if (!sourcePixelScaleMatches(unitsPerPixelX, unitsPerPixelY)) {
      return {
        ok: false,
        code: "non-square-source-pixels",
        message: `Layered character layer '${layer.id}' has non-square source pixels ${unitsPerPixelX}x${unitsPerPixelY}.`
      };
    }
    if (expectedUnitsPerPixel === undefined) {
      expectedUnitsPerPixel = unitsPerPixelX;
      expectedLayerId = layer.id;
      continue;
    }
    if (!sourcePixelScaleMatches(expectedUnitsPerPixel, unitsPerPixelX)) {
      return {
        ok: false,
        code: "inconsistent-source-pixel-scale",
        message: `Layered character layers '${expectedLayerId}' and '${layer.id}' use inconsistent source-pixel scales ${expectedUnitsPerPixel} and ${unitsPerPixelX}.`
      };
    }
  }

  return { ok: true, unitsPerPixel: expectedUnitsPerPixel as number };
}

export function resolveLayeredCharacter(input: ResolveLayeredCharacterInput): ResolveLayeredCharacterResult {
  const resolvedRefs = resolveLayeredCharacterLayerRefs(input);
  const diagnostics: LayeredCharacterDiagnostic[] = [...resolvedRefs.diagnostics];

  if (diagnostics.length > 0) {
    return { characterId: input.character.id, expression: resolvedRefs.expression, activeLayers: [], diagnostics };
  }

  const fail = (diagnostic: Omit<LayeredCharacterDiagnostic, "severity" | "characterId">) => {
    diagnostics.push({ ...diagnostic, severity: "error", characterId: input.character.id });
  };

  const activeLayers: ResolvedLayeredCharacterLayer[] = [];
  for (const layer of resolvedRefs.activeLayers) {
    const metadata = input.metadataByPath[layer.metadataPath];
    if (!metadata) {
      fail({
        code: "missing-metadata",
        message: `Layered character metadata not loaded: ${layer.metadataPath}.`,
        group: layer.group,
        layer: layer.layer,
        metadataPath: layer.metadataPath
      });
      continue;
    }
    activeLayers.push({
      ...layer,
      metadata
    });
  }

  if (diagnostics.length > 0) {
    return { characterId: input.character.id, expression: resolvedRefs.expression, activeLayers: [], diagnostics };
  }

  activeLayers.sort((left, right) => {
    const order = left.metadata.drawOrder - right.metadata.drawOrder;
    if (order !== 0) return order;
    const z = right.metadata.localTransform.position.z - left.metadata.localTransform.position.z;
    if (z !== 0) return z;
    return left.id.localeCompare(right.id);
  });

  return { characterId: input.character.id, expression: resolvedRefs.expression, activeLayers, diagnostics };
}

export function resolveLayeredCharacterLayerRefs(input: ResolveLayeredCharacterLayerRefsInput): ResolveLayeredCharacterLayerRefsResult {
  const expression = input.appearanceExpression?.trim() ?? "";
  const diagnostics: LayeredCharacterDiagnostic[] = [];
  const active = new Map<string, ResolvedLayeredCharacterLayerRef>();
  const tokens = [...input.character.defaultComposition, ...splitAppearanceExpression(expression)];

  const fail = (diagnostic: Omit<LayeredCharacterDiagnostic, "severity" | "characterId">) => {
    diagnostics.push({ ...diagnostic, severity: "error", characterId: input.character.id });
  };

  const expandToken = (token: string, stack: string[]): string[] => {
    const tokenExpressions = input.compositions.tokens[token];
    if (!tokenExpressions) return [token];
    if (stack.includes(token)) {
      fail({
        code: "recursive-token",
        message: `Recursive layered character token: ${[...stack, token].join(" -> ")}.`,
        token
      });
      return [];
    }
    return tokenExpressions.flatMap((item) => expandToken(item, [...stack, token]));
  };

  const applyExpression = (source: string) => {
    const parsed = parseLayerExpression(source);
    if (!parsed) {
      fail({
        code: "invalid-expression",
        message: `Invalid layered character expression: ${source}.`,
        expression: source
      });
      return;
    }
    if (parsed.op === "-") {
      applyRemove(input.layers, active, parsed, source, fail);
      return;
    }
    const group = input.layers.groups[parsed.group];
    if (!group) {
      fail({
        code: "unknown-group",
        message: `Layered character group not found: ${parsed.group}.`,
        expression: source,
        group: parsed.group
      });
      return;
    }
    const layerName = parsed.layer;
    const layerRef = layerName ? group.layers[layerName] : undefined;
    if (!layerName || !layerRef) {
      fail({
        code: "unknown-layer",
        message: `Layered character layer not found: ${parsed.group}>${layerName ?? ""}.`,
        expression: source,
        group: parsed.group,
        ...(layerName ? { layer: layerName } : {})
      });
      return;
    }
    if (parsed.op === ">") {
      for (const [key, layer] of active) {
        if (layer.group === parsed.group) active.delete(key);
      }
    }
    const id = `${parsed.group}>${layerName}`;
    active.set(activeLayerKey(parsed.group, layerName), {
      id,
      group: parsed.group,
      layer: layerName,
      src: layerRef.src,
      metadataPath: layerRef.metadata
    });
  };

  for (const token of tokens) {
    const tokenExpressions = input.compositions.tokens[token];
    if (!tokenExpressions && !parseLayerExpression(token)) {
      if (looksLikeLayerExpression(token)) {
        fail({
          code: "invalid-expression",
          message: `Invalid layered character expression: ${token}.`,
          expression: token
        });
        break;
      }
      fail({
        code: "unknown-token",
        message: `Layered character token not found: ${token}.`,
        token
      });
      break;
    }
    for (const atom of expandToken(token, [])) applyExpression(atom);
    if (diagnostics.length > 0) break;
  }

  if (diagnostics.length > 0) {
    return { characterId: input.character.id, expression, activeLayers: [], diagnostics };
  }

  return { characterId: input.character.id, expression, activeLayers: [...active.values()], diagnostics };
}

export function splitAppearanceExpression(expression: string): string[] {
  return expression.split(",").map((item) => item.trim()).filter(Boolean);
}

export function parseLayerExpression(expression: string): ParsedExpression | undefined {
  const trimmed = expression.trim();
  if (!trimmed) return undefined;
  for (const op of [">", "+", "-"] as const) {
    const index = trimmed.indexOf(op);
    if (index < 0) continue;
    const group = trimmed.slice(0, index);
    const layer = trimmed.slice(index + 1);
    if (!group) return undefined;
    if (op !== "-" && !layer) return undefined;
    return { group, op, ...(layer ? { layer } : {}) };
  }
  return undefined;
}

export function calculateLayerBounds(
  layer: ResolvedLayeredCharacterLayer,
  textureDimensions: LayeredCharacterTextureDimensions
): LayeredCharacterLayerBounds {
  const { sprite, localTransform } = layer.metadata;
  assertPositiveTextureDimensions(layer.id, textureDimensions);
  const width = (textureDimensions.width / sprite.pixelsPerUnit) * Math.abs(localTransform.scale.x);
  const height = (textureDimensions.height / sprite.pixelsPerUnit) * Math.abs(localTransform.scale.y);
  const x = localTransform.position.x;
  const y = localTransform.position.y;
  return {
    min: [x - sprite.pivot.x * width, y - sprite.pivot.y * height],
    max: [x + (1 - sprite.pivot.x) * width, y + (1 - sprite.pivot.y) * height]
  };
}

export function calculateLayeredCharacterBounds(
  layers: ResolvedLayeredCharacterLayer[],
  textureDimensionsByLayerId: LayeredCharacterTextureDimensionsByLayerId
): LayeredCharacterLayerBounds | undefined {
  if (layers.length === 0) return undefined;
  const bounds = layers.map((layer) => {
    const dimensions = textureDimensionsByLayerId[layer.id];
    if (!dimensions) throw new Error(`Missing texture dimensions for layered character layer '${layer.id}'.`);
    return calculateLayerBounds(layer, dimensions);
  });
  return {
    min: [Math.min(...bounds.map((item) => item.min[0])), Math.min(...bounds.map((item) => item.min[1]))],
    max: [Math.max(...bounds.map((item) => item.max[0])), Math.max(...bounds.map((item) => item.max[1]))]
  };
}

function assertPositiveTextureDimensions(layerId: string, dimensions: LayeredCharacterTextureDimensions): void {
  if (!Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error(`Invalid texture dimensions for layered character layer '${layerId}': ${dimensions.width}x${dimensions.height}.`);
  }
}

function sourcePixelScaleMatches(left: number, right: number): boolean {
  const magnitude = Math.max(Math.abs(left), Math.abs(right), Number.MIN_VALUE);
  return Math.abs(left - right) <= magnitude * LAYERED_CHARACTER_SOURCE_PIXEL_RELATIVE_EPSILON;
}

function activeLayerKey(group: string, layer: string): string {
  return `${group}\u0000${layer}`;
}

function looksLikeLayerExpression(expression: string): boolean {
  return expression.includes(">") || expression.includes("+") || expression.includes("-");
}

function applyRemove(
  layers: LayeredCharacterLayers,
  active: Map<string, ResolvedLayeredCharacterLayerRef>,
  parsed: ParsedExpression,
  source: string,
  fail: (diagnostic: Omit<LayeredCharacterDiagnostic, "severity" | "characterId">) => void
) {
  const matchingGroups = Object.keys(layers.groups).filter((group) => group === parsed.group || group.startsWith(`${parsed.group}/`));
  if (matchingGroups.length === 0) {
    fail({
      code: "unknown-group",
      message: `Layered character group not found: ${parsed.group}.`,
      expression: source,
      group: parsed.group
    });
    return;
  }
  if (parsed.layer) {
    const group = layers.groups[parsed.group];
    if (!group?.layers[parsed.layer]) {
      fail({
        code: "unknown-layer",
        message: `Layered character layer not found: ${parsed.group}-${parsed.layer}.`,
        expression: source,
        group: parsed.group,
        layer: parsed.layer
      });
      return;
    }
    active.delete(activeLayerKey(parsed.group, parsed.layer));
    return;
  }
  for (const [key, layer] of active) {
    if (layer.group === parsed.group || layer.group.startsWith(`${parsed.group}/`)) active.delete(key);
  }
}
