import { Assets, Texture } from "pixi.js";

export const PIXI_FX_ASSET_IDS = [
  "noise",
  "blue-noise",
  "bokeh-disc",
  "godray-mask",
  "glitch-scanline",
  "chromatic-noise",
  "radial-vignette",
  "soft-dust",
  "generated-fx-atlas"
] as const;
export type PixiFxAssetId = (typeof PIXI_FX_ASSET_IDS)[number];

const assetUris: Record<PixiFxAssetId, string> = {
  noise: new URL("./assets/fx/noise.png", import.meta.url).href,
  "blue-noise": new URL("./assets/fx/blue-noise.png", import.meta.url).href,
  "bokeh-disc": new URL("./assets/fx/bokeh-disc.png", import.meta.url).href,
  "godray-mask": new URL("./assets/fx/godray-mask.png", import.meta.url).href,
  "glitch-scanline": new URL("./assets/fx/glitch-scanline.png", import.meta.url).href,
  "chromatic-noise": new URL("./assets/fx/chromatic-noise.png", import.meta.url).href,
  "radial-vignette": new URL("./assets/fx/radial-vignette.png", import.meta.url).href,
  "soft-dust": new URL("./assets/fx/soft-dust.png", import.meta.url).href,
  "generated-fx-atlas": new URL("./assets/generated-fx-atlas.png", import.meta.url).href
};

let preloadPromise: Promise<void> | undefined;

export function getBuiltInPixiFxAssetAlias(id: PixiFxAssetId): string {
  return `pixi-fx:${id}`;
}

export function getBuiltInPixiFxTexture(id: PixiFxAssetId): Texture {
  return Texture.from(getBuiltInPixiFxAssetAlias(id));
}

export function preloadBuiltInPixiFxAssets(): Promise<void> {
  if (!preloadPromise) {
    const sources = PIXI_FX_ASSET_IDS.map((id) => ({
      alias: getBuiltInPixiFxAssetAlias(id),
      src: assetUris[id]
    }));
    Assets.add(sources);
    preloadPromise = Assets.load<Texture>(sources.map((asset) => asset.alias)).then(() => undefined);
  }
  return preloadPromise;
}
