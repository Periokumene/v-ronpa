import type { AssetRegistryDiagnostic, AssetResolver } from "@v-ronpa/asset-registry";
import type { GameAUiConfig } from "./gameAUiConfig";

export interface GameAUiAudioCueAsset {
  gain: number;
  uri: string;
}

export interface GameAUiAudioAssets {
  cues: Readonly<Record<string, GameAUiAudioCueAsset>>;
  defaults: {
    click: string;
    hover: string;
  };
  hoverThrottleMs: number;
}

export interface GameAUiAssets {
  dialogFrameUri?: string | undefined;
  titleBackgroundUri?: string | undefined;
  diagnostics: AssetRegistryDiagnostic[];
  uiAudio: GameAUiAudioAssets;
}

export function resolveGameAUiAssets(
  assetResolver: AssetResolver,
  config: GameAUiConfig
): GameAUiAssets {
  const dialogFrame = assetResolver.resolve({ id: config.dialog.frameAssetId, capability: "image" });
  const diagnostics = dialogFrame.diagnostic ? [dialogFrame.diagnostic] : [];
  const titleBackground = assetResolver.resolve({ id: config.title.backgroundAssetId, capability: "image" });
  if (titleBackground.diagnostic) diagnostics.push(titleBackground.diagnostic);
  const cues: Record<string, GameAUiAudioCueAsset> = {};
  for (const [cueId, cue] of Object.entries(config.uiAudio.cues)) {
    const resolved = assetResolver.resolve({ id: cue.assetId, capability: "audio" });
    if (resolved.uri) cues[cueId] = { gain: cue.gain, uri: resolved.uri };
    if (resolved.diagnostic) diagnostics.push(resolved.diagnostic);
  }
  return {
    ...(dialogFrame.uri ? { dialogFrameUri: dialogFrame.uri } : {}),
    ...(titleBackground.uri ? { titleBackgroundUri: titleBackground.uri } : {}),
    diagnostics,
    uiAudio: {
      cues,
      defaults: config.uiAudio.defaults,
      hoverThrottleMs: config.uiAudio.hoverThrottleMs
    }
  };
}
