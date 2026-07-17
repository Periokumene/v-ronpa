import {
  LayeredCharacterCompositionsSchema,
  RuntimeAssetSchema,
  type RuntimeAsset,
  type RuntimeAssetKind
} from "@v-ronpa/contracts";

export interface NaniProjectAsset {
  id: string;
  kind: RuntimeAssetKind;
  optimizedUri: string;
}

export interface NaniProjectAssetIndex {
  assets: NaniProjectAsset[];
  characterTokens: Readonly<Record<string, readonly string[]>>;
}

export const emptyProjectAssetIndex: NaniProjectAssetIndex = {
  assets: [],
  characterTokens: {}
};

export function parseGeneratedRuntimeAssets(sourceText: string, exportName: string): NaniProjectAsset[] {
  const declaration = new RegExp(`export\\s+const\\s+${escapeRegExp(exportName)}\\s*=`, "u").exec(sourceText);
  if (!declaration) throw new Error(`Generated asset export '${exportName}' was not found.`);
  const arrayStart = sourceText.indexOf("[", declaration.index + declaration[0].length);
  if (arrayStart < 0) throw new Error(`Generated asset export '${exportName}' does not contain an array.`);
  const arrayEnd = matchingArrayEnd(sourceText, arrayStart);
  if (arrayEnd < 0) throw new Error(`Generated asset export '${exportName}' has an unterminated array.`);

  const parsed: unknown = JSON.parse(sourceText.slice(arrayStart, arrayEnd + 1));
  const assets = RuntimeAssetSchema.array().parse(parsed);
  return assets.map(projectAsset);
}

export function parseCompositionTokens(sourceText: string): string[] {
  const compositions = LayeredCharacterCompositionsSchema.parse(JSON.parse(sourceText));
  return Object.keys(compositions.tokens).sort((left, right) => left.localeCompare(right));
}

export function assetsOfKind(index: NaniProjectAssetIndex, kind: RuntimeAssetKind): NaniProjectAsset[] {
  return index.assets.filter((asset) => asset.kind === kind);
}

function projectAsset(asset: RuntimeAsset): NaniProjectAsset {
  return {
    id: asset.id,
    kind: asset.kind,
    optimizedUri: asset.optimizedUri
  };
}

function matchingArrayEnd(sourceText: string, arrayStart: number): number {
  let depth = 0;
  let quote: "\"" | "'" | undefined;
  let escaped = false;
  for (let index = arrayStart; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[") depth += 1;
    if (character === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
