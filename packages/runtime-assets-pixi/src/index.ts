import { defineRuntimeAssetFragment } from "@v-ronpa/asset-registry";
import type { RuntimeAsset } from "@v-ronpa/contracts";

export const PIXI_RUNTIME_ASSET_PROVIDER_ID = "runtime-assets:pixi";

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

export function pixiRuntimeAssetId(id: PixiFxAssetId): string {
  return `fx:${id}`;
}

export const pixiRuntimeAssetFragment = defineRuntimeAssetFragment({
  id: PIXI_RUNTIME_ASSET_PROVIDER_ID,
  runtimeAssets: PIXI_FX_ASSET_IDS.map(runtimeFxAsset)
});

function runtimeFxAsset(id: PixiFxAssetId): RuntimeAsset {
  return {
    id: pixiRuntimeAssetId(id),
    kind: "fx",
    optimizedUri: assetUris[id],
    format: "png",
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: ["pixi", "built-in-fx"]
  };
}
