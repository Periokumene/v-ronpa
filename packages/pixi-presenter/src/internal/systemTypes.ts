import type { AssetId } from "@v-ronpa/contracts";
import type { Container, Renderer } from "pixi.js";
import type { PixiAssetResolver, PixiPresenterDiagnostic } from "./assetResolver";

export interface PixiPresenterSystemsOptions {
  root: Container;
  width: () => number;
  height: () => number;
  renderer?: Renderer;
  assetResolver?: PixiAssetResolver;
  onDiagnostic?: (diagnostic: PixiPresenterDiagnostic) => void;
}

export interface PixiActorSystemOptions extends PixiPresenterSystemsOptions {
  characterOutlineEnabled: boolean;
  characterAssetIdByCharacterId: Readonly<Record<string, AssetId>>;
}
