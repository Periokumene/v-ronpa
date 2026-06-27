import { Assets, Texture } from "pixi.js";
import type { RuntimeAsset } from "@v-ronpa/contracts";
import { type PixiAssetResolver, type PixiPresenterDiagnostic, resolvePixiAsset } from "./assetResolver";

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

export const builtInPixiFxRuntimeAssets: RuntimeAsset[] = [
  runtimeFxAsset("noise", assetUris.noise),
  runtimeFxAsset("blue-noise", assetUris["blue-noise"]),
  runtimeFxAsset("bokeh-disc", assetUris["bokeh-disc"]),
  runtimeFxAsset("rain-streak", assetUris["rain-streak"]),
  runtimeFxAsset("godray-mask", assetUris["godray-mask"]),
  runtimeFxAsset("glitch-scanline", assetUris["glitch-scanline"]),
  runtimeFxAsset("chromatic-noise", assetUris["chromatic-noise"]),
  runtimeFxAsset("radial-vignette", assetUris["radial-vignette"]),
  runtimeFxAsset("soft-dust", assetUris["soft-dust"]),
  runtimeFxAsset("generated-fx-atlas", generatedFxAtlasUri)
];

let preloadPromise: Promise<void> | undefined;
let preloadKey = "";

export function getBuiltInPixiFxRuntimeAssetId(id: PixiFxAssetId): string {
  return `fx:${id}`;
}

export function getBuiltInPixiFxAssetAlias(id: PixiFxAssetId): string {
  return `pixi-fx:${id}`;
}

export function getBuiltInPixiFxTexture(id: PixiFxAssetId): Texture {
  return Texture.from(getBuiltInPixiFxAssetAlias(id));
}

export function preloadBuiltInPixiFxAssets(
  assetResolver: PixiAssetResolver | undefined,
  onDiagnostic?: (diagnostic: PixiPresenterDiagnostic) => void
): Promise<void> {
  const unresolved = builtInPixiFxRuntimeAssets.flatMap((asset) => {
    const fxId = asset.id.replace(/^fx:/u, "") as PixiFxAssetId;
    const src = resolvePixiAsset(assetResolver, { id: asset.id, kind: "fx" }, onDiagnostic);
    return src ? [{ alias: getBuiltInPixiFxAssetAlias(fxId), src }] : [];
  });
  const nextKey = unresolved.map((asset) => `${asset.alias}:${asset.src}`).join("|");
  if (!preloadPromise || preloadKey !== nextKey) {
    preloadKey = nextKey;
    if (unresolved.length === 0) {
      preloadPromise = Promise.resolve();
      return preloadPromise;
    }
    Assets.add(unresolved);
    preloadPromise = Assets.load<Texture>(unresolved.map((asset) => asset.alias)).then(() => undefined);
  }
  return preloadPromise;
}

function runtimeFxAsset(id: PixiFxAssetId, optimizedUri: string): RuntimeAsset {
  return {
    id: getBuiltInPixiFxRuntimeAssetId(id),
    kind: "fx",
    optimizedUri,
    format: "png",
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: ["pixi", "built-in-fx"]
  };
}
