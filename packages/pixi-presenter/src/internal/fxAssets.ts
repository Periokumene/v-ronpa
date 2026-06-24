import { Assets, Texture } from "pixi.js";

export type PixiFxAssetId =
  | "noise"
  | "blue-noise"
  | "bokeh-disc"
  | "rain-streak"
  | "godray-mask"
  | "glitch-scanline"
  | "chromatic-noise"
  | "radial-vignette"
  | "soft-dust"
  | "generated-fx-atlas";

export interface PixiFxAsset {
  id: PixiFxAssetId;
  uri: string;
}

const assetUris: Record<PixiFxAssetId, string> = {
  "noise": new URL("./assets/fx/noise.png", import.meta.url).href,
  "blue-noise": new URL("./assets/fx/blue-noise.png", import.meta.url).href,
  "bokeh-disc": new URL("./assets/fx/bokeh-disc.png", import.meta.url).href,
  "rain-streak": new URL("./assets/fx/rain-streak.png", import.meta.url).href,
  "godray-mask": new URL("./assets/fx/godray-mask.png", import.meta.url).href,
  "glitch-scanline": new URL("./assets/fx/glitch-scanline.png", import.meta.url).href,
  "chromatic-noise": new URL("./assets/fx/chromatic-noise.png", import.meta.url).href,
  "radial-vignette": new URL("./assets/fx/radial-vignette.png", import.meta.url).href,
  "soft-dust": new URL("./assets/fx/soft-dust.png", import.meta.url).href,
  "generated-fx-atlas": new URL("./assets/generated-fx-atlas.png", import.meta.url).href
};

const generatedFxAtlasUri = new URL("./assets/generated-fx-atlas.png", import.meta.url).href;

export const builtInPixiFxAssets: PixiFxAsset[] = [
  { id: "noise", uri: assetUris.noise },
  { id: "blue-noise", uri: assetUris["blue-noise"] },
  { id: "bokeh-disc", uri: assetUris["bokeh-disc"] },
  { id: "rain-streak", uri: assetUris["rain-streak"] },
  { id: "godray-mask", uri: assetUris["godray-mask"] },
  { id: "glitch-scanline", uri: assetUris["glitch-scanline"] },
  { id: "chromatic-noise", uri: assetUris["chromatic-noise"] },
  { id: "radial-vignette", uri: assetUris["radial-vignette"] },
  { id: "soft-dust", uri: assetUris["soft-dust"] },
  { id: "generated-fx-atlas", uri: generatedFxAtlasUri }
];

let preloadPromise: Promise<void> | undefined;

export function getBuiltInPixiFxAssetUri(id: PixiFxAssetId): string {
  return builtInPixiFxAssets.find((asset) => asset.id === id)?.uri ?? builtInPixiFxAssets[0]!.uri;
}

export function getBuiltInPixiFxAssetAlias(id: PixiFxAssetId): string {
  return `pixi-fx:${id}`;
}

export function getBuiltInPixiFxTexture(id: PixiFxAssetId): Texture {
  return Texture.from(getBuiltInPixiFxAssetAlias(id));
}

export function preloadBuiltInPixiFxAssets(): Promise<void> {
  if (!preloadPromise) {
    const unresolved = builtInPixiFxAssets.map((asset) => ({
      alias: getBuiltInPixiFxAssetAlias(asset.id),
      src: asset.uri
    }));
    Assets.add(unresolved);
    preloadPromise = Assets.load<Texture>(unresolved.map((asset) => asset.alias)).then(() => undefined);
  }
  return preloadPromise;
}
