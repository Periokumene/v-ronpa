import type { RuntimeAssetKind } from "@v-ronpa/contracts";
import { getNaniCommandDefinition } from "@v-ronpa/contracts";
import { lineAt, type NaniPosition, type NaniRange } from "./documentContext";
import { assetsOfKind, type NaniProjectAssetIndex } from "./projectAssets";

export interface NaniResourceCompletion {
  label: string;
  insertText: string;
  range: NaniRange;
  detail: string;
  documentation?: string;
  deferredDocumentation?: NaniDeferredCompletionDocumentation;
  sortText: string;
}

export interface NaniDeferredCompletionDocumentation {
  kind: "character-appearance-token";
  characterId: string;
  baseAppearanceExpression: string;
  candidateToken: string;
}

export interface NaniResourceCompletionResult {
  completions: NaniResourceCompletion[];
  combineWithParams: boolean;
}

interface ResourceSlot {
  kind: RuntimeAssetKind;
  character: boolean;
  characterCompletionPreview: boolean;
}

const primarySlots: Readonly<Record<string, ResourceSlot>> = {
  back: slot("background"),
  inback: slot("background"),
  bgm: slot("bgm"),
  stopbgm: slot("bgm"),
  sfx: slot("sfx"),
  sfxfast: slot("sfx"),
  stopsfx: slot("sfx"),
  movie: slot("video"),
  char: slot("character-pack", true, true),
  slide: slot("character-pack", true)
};

const paramSlots: Readonly<Record<string, Readonly<Record<string, ResourceSlot>>>> = {
  back: { appearanceandtransition: slot("background"), appearance: slot("background") },
  inback: { appearanceandtransition: slot("background"), appearance: slot("background") },
  bgm: { bgmpath: slot("bgm") },
  stopbgm: { bgmpath: slot("bgm") },
  sfx: { sfxpath: slot("sfx") },
  sfxfast: { sfxpath: slot("sfx") },
  stopsfx: { sfxpath: slot("sfx") },
  movie: { moviepath: slot("video") },
  char: { idandappearance: slot("character-pack", true, true) },
  slide: { idandappearance: slot("character-pack", true) }
};

export function getNaniResourceCompletions(
  sourceText: string,
  position: NaniPosition,
  index: NaniProjectAssetIndex
): NaniResourceCompletionResult | undefined {
  const line = lineAt(sourceText, position.line);
  const before = line.slice(0, Math.min(position.character, line.length));
  const match = /^\s*@([A-Za-z_<>][A-Za-z0-9_<>-]*)(?:\s+(.*))?$/u.exec(before);
  const commandId = normalize(match?.[1] ?? "");
  if (!commandId || !primarySlots[commandId]) return undefined;

  const args = match?.[2];
  const tokenStart = currentTokenStart(before);
  const token = args === undefined ? "" : before.slice(tokenStart);
  const argsStart = args === undefined ? before.length : before.length - args.length;
  const completedPrefix = before.slice(argsStart, tokenStart);
  const param = paramSlot(commandId, token);
  if (param) {
    return resourceResult(index, param.slot, param.prefix, position.line, tokenStart + param.valueOffset, before.length, false);
  }

  const hasCompletedPrimary = containsCompletedPrimary(commandId, completedPrefix);
  if (hasCompletedPrimary) return undefined;
  const primary = primarySlots[commandId];
  return resourceResult(index, primary, token, position.line, tokenStart, before.length, token.length === 0);
}

function containsCompletedPrimary(commandId: string, source: string): boolean {
  const definition = getNaniCommandDefinition(commandId);
  if (!definition) return source.trim().length > 0;
  const knownParams = new Set(
    definition.params.flatMap((param) => [param.name, ...(param.aliases ?? [])]).map(normalize)
  );
  return source.trim().split(/\s+/u).some((token) => {
    if (!token) return false;
    if ((token.startsWith("!") && token.length > 1) || (token.endsWith("!") && !token.startsWith("!"))) return false;
    const colon = token.indexOf(":");
    if (colon <= 0) return true;
    const key = normalize(token.slice(0, colon));
    return key !== "if" && key !== "unless" && !knownParams.has(key);
  });
}

function resourceResult(
  index: NaniProjectAssetIndex,
  resourceSlot: ResourceSlot,
  rawPrefix: string,
  line: number,
  start: number,
  end: number,
  combineWithParams: boolean
): NaniResourceCompletionResult {
  if (resourceSlot.character) {
    return characterResult(
      index,
      rawPrefix,
      line,
      start,
      end,
      combineWithParams,
      resourceSlot.characterCompletionPreview
    );
  }
  const prefix = rawPrefix.toLowerCase();
  return {
    completions: assetsOfKind(index, resourceSlot.kind)
      .filter((asset) => asset.id.toLowerCase().startsWith(prefix))
      .map((asset, assetIndex) => ({
        label: asset.id,
        insertText: asset.id,
        range: range(line, start, end),
        detail: `${asset.kind} · generated project asset`,
        documentation: asset.optimizedUri,
        sortText: `0-${assetIndex.toString().padStart(4, "0")}`
      })),
    combineWithParams
  };
}

function characterResult(
  index: NaniProjectAssetIndex,
  rawPrefix: string,
  line: number,
  start: number,
  end: number,
  combineWithParams: boolean,
  completionPreviewEnabled: boolean
): NaniResourceCompletionResult {
  const dot = rawPrefix.indexOf(".");
  if (dot < 0) {
    const prefix = rawPrefix.toLowerCase();
    return {
      completions: assetsOfKind(index, "character-pack")
        .filter((asset) => asset.id.toLowerCase().startsWith(prefix))
        .map((asset, assetIndex) => ({
          label: asset.id,
          insertText: asset.id,
          range: range(line, start, end),
          detail: "character-pack · generated project asset",
          documentation: asset.optimizedUri,
          sortText: `0-${assetIndex.toString().padStart(4, "0")}`
        })),
      combineWithParams
    };
  }

  const characterId = rawPrefix.slice(0, dot);
  const expression = rawPrefix.slice(dot + 1);
  const segmentStart = expression.lastIndexOf(",") + 1;
  const prefix = expression.slice(segmentStart).toLowerCase();
  const baseAppearanceExpression = expression.slice(0, segmentStart).replace(/,+$/u, "");
  const tokens = index.characterTokens[characterId] ?? index.characterTokens[normalize(characterId)] ?? [];
  const replaceStart = start + dot + 1 + segmentStart;
  return {
    completions: tokens
      .filter((token) => token.toLowerCase().startsWith(prefix))
      .map((token, tokenIndex) => ({
        label: token,
        insertText: token,
        range: range(line, replaceStart, end),
        detail: `${characterId} composition token`,
        ...(completionPreviewEnabled ? {
          deferredDocumentation: {
            kind: "character-appearance-token" as const,
            characterId,
            baseAppearanceExpression,
            candidateToken: token
          }
        } : {}),
        sortText: `0-${tokenIndex.toString().padStart(4, "0")}`
      })),
    combineWithParams: false
  };
}

function paramSlot(commandId: string, token: string): { slot: ResourceSlot; prefix: string; valueOffset: number } | undefined {
  const colon = token.indexOf(":");
  if (colon <= 0) return undefined;
  const resourceSlot = paramSlots[commandId]?.[normalize(token.slice(0, colon))];
  if (!resourceSlot) return undefined;
  return { slot: resourceSlot, prefix: token.slice(colon + 1), valueOffset: colon + 1 };
}

function slot(
  kind: RuntimeAssetKind,
  character = false,
  characterCompletionPreview = false
): ResourceSlot {
  return { kind, character, characterCompletionPreview };
}

function range(line: number, start: number, end: number): NaniRange {
  return { start: { line, character: start }, end: { line, character: end } };
}

function currentTokenStart(source: string): number {
  const match = source.match(/\S+$/u);
  return match?.index ?? source.length;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
