import type { AssetRegistryDiagnostic, AssetResolver } from "@v-ronpa/asset-registry";
import type { GameAUiConfig } from "./gameAUiConfig";

export interface GameAUiAssets {
  dialogFrameUri?: string | undefined;
  diagnostics: AssetRegistryDiagnostic[];
}

export function resolveGameAUiAssets(
  assetResolver: AssetResolver,
  config: GameAUiConfig
): GameAUiAssets {
  const dialogFrame = assetResolver.resolve({ id: config.dialog.frameAssetId, kind: "texture" });
  return {
    ...(dialogFrame.uri ? { dialogFrameUri: dialogFrame.uri } : {}),
    diagnostics: dialogFrame.diagnostic ? [dialogFrame.diagnostic] : []
  };
}
