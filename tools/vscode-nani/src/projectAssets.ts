import {
  LayeredCharacterCompositionsSchema,
  type AssetCapability,
  type AssetDefinition
} from "@v-ronpa/contracts";

export type NaniProjectAsset = AssetDefinition;

export interface NaniProjectCharacterAsset {
  characterId: string;
  assetId: string;
}

export interface NaniProjectAssetIndex {
  assets: NaniProjectAsset[];
  characters: NaniProjectCharacterAsset[];
  characterTokens: Readonly<Record<string, readonly string[]>>;
}

export const emptyProjectAssetIndex: NaniProjectAssetIndex = {
  assets: [],
  characters: [],
  characterTokens: {}
};

export function parseCompositionTokens(sourceText: string): string[] {
  const compositions = LayeredCharacterCompositionsSchema.parse(JSON.parse(sourceText));
  return Object.keys(compositions.tokens).sort((left, right) => left.localeCompare(right));
}

export function assetsOfCapability(index: NaniProjectAssetIndex, capability: AssetCapability): NaniProjectAsset[] {
  return index.assets.filter((asset) => mimeSupports(asset.mimeType, capability));
}

function mimeSupports(mimeType: string, capability: AssetCapability): boolean {
  if (capability === "json") return mimeType === "application/json";
  return mimeType.startsWith(`${capability}/`);
}
