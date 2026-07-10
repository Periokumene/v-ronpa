import { Assets, Texture } from "pixi.js";
import {
  pixiRuntimeAssetFragment,
  pixiRuntimeAssetId,
  type PixiFxAssetId
} from "@v-ronpa/runtime-assets-pixi";
import { type PixiAssetResolver, type PixiPresenterDiagnostic, resolvePixiAsset } from "./assetResolver";

let preloadPromise: Promise<void> | undefined;
let preloadKey = "";

export function getBuiltInPixiFxRuntimeAssetId(id: PixiFxAssetId): string {
  return pixiRuntimeAssetId(id);
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
  const unresolved = pixiRuntimeAssetFragment.runtimeAssets.flatMap((asset) => {
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
