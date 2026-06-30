import type { AssetRegistryDiagnostic, AssetResolver } from "@v-ronpa/asset-registry";
import type { ContentManifest, UiAssetRef } from "@v-ronpa/contracts";
import type { GameAUiConfig } from "./gameAUiConfig";

export interface GameAUiAssets {
  dialogFrameUri?: string | undefined;
  dialogFrameSliceInsets?: UiAssetRef["sliceInsets"] | undefined;
  diagnostics: AssetRegistryDiagnostic[];
}

export function resolveGameAUiAssets(
  assetResolver: AssetResolver,
  config: GameAUiConfig,
  manifest: Pick<ContentManifest, "uiAssets">
): GameAUiAssets {
  const dialogFrameRef = manifest.uiAssets.find((asset) => asset.role === config.dialog.frameRole);
  if (!dialogFrameRef) {
    return {
      diagnostics: [
        {
          code: "asset-missing",
          severity: "error",
          id: config.dialog.frameRole,
          kind: "texture",
          message: `UI asset role '${config.dialog.frameRole}' is not declared in ContentManifest.uiAssets.`
        }
      ]
    };
  }

  const dialogFrame = assetResolver.resolve({ id: dialogFrameRef.assetId, kind: "texture" });
  return {
    ...(dialogFrame.uri ? { dialogFrameUri: dialogFrame.uri } : {}),
    ...(dialogFrameRef.sliceInsets ? { dialogFrameSliceInsets: dialogFrameRef.sliceInsets } : {}),
    diagnostics: dialogFrame.diagnostic ? [dialogFrame.diagnostic] : []
  };
}
