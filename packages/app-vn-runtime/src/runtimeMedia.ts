import type { AssetResolver } from "@v-ronpa/asset-registry";
import { createVoiceAssetId, type MediaRuntimeEffect } from "@v-ronpa/app-vn-dispatch";
import type { AudioHandle, AudioPort, VideoPort } from "@v-ronpa/media-save";
import {
  createVnMediaHandleMissingDiagnostic,
  createVnMediaPortErrorDiagnostic,
  createVnRuntimeAssetDiagnostic,
  type VnRuntimeDiagnostic
} from "./runtimeDiagnostics";
import type { VnRuntimeVoiceSettings } from "./runtimeTypes";

export type VnRuntimeMediaKind = "bgm" | "sfx" | "bleep" | "voice" | "video";

export interface VnRuntimeMediaSourceResolverInput {
  sourceRef: string;
  kind: VnRuntimeMediaKind;
  assetResolver?: AssetResolver;
}

export interface VnRuntimeMediaSourceResolverResult {
  uri?: string;
  diagnostic?: VnRuntimeDiagnostic;
}

export interface VnRuntimeMediaHandleStore {
  bgm: Record<string, AudioHandle>;
  sfx: Record<string, AudioHandle>;
  dialogueBleep?: AudioHandle;
  voice?: AudioHandle;
  oneShotSequence: number;
}

export interface ApplyVnRuntimeMediaEffectsInput {
  effects: MediaRuntimeEffect[];
  handles: VnRuntimeMediaHandleStore;
  resolver: (input: Pick<VnRuntimeMediaSourceResolverInput, "sourceRef" | "kind">) => VnRuntimeMediaSourceResolverResult;
  audioPort?: AudioPort;
  videoPort?: VideoPort;
}

export interface ApplyVnRuntimeMediaEffectsResult {
  diagnostics: VnRuntimeDiagnostic[];
  voiceHandle?: AudioHandle;
}

export interface VnDialogueVoiceAssetAvailabilityResult {
  available: boolean;
  diagnostics: VnRuntimeDiagnostic[];
  sourceRef?: string;
}

export function createInitialVnRuntimeMediaHandleStore(): VnRuntimeMediaHandleStore {
  return { bgm: {}, sfx: {}, oneShotSequence: 0 };
}

export function resolveVnRuntimeMediaSource({
  assetResolver,
  kind,
  sourceRef
}: VnRuntimeMediaSourceResolverInput): VnRuntimeMediaSourceResolverResult {
  if (!assetResolver) {
    return {
      diagnostic: {
        source: "asset",
        code: "asset-resolver-missing",
        severity: "error",
        message: `Media source ${sourceRef} (${kind}) could not be resolved because no AssetResolver was provided.`
      }
    };
  }

  const resolved = assetResolver.resolve({ id: sourceRef, kind });
  if (resolved.uri) return { uri: resolved.uri };

  return {
    diagnostic: createVnRuntimeAssetDiagnostic(
      resolved.diagnostic ?? {
        code: "asset-missing",
        severity: "error",
        id: sourceRef,
        kind,
        message: `Media source ${sourceRef} (${kind}) could not be resolved.`
      }
    )
  };
}

export function resolveVnDialogueVoiceAssetAvailability({
  assetResolver,
  textId,
  voiceSettings
}: {
  assetResolver?: AssetResolver;
  textId?: string;
  voiceSettings: VnRuntimeVoiceSettings;
}): VnDialogueVoiceAssetAvailabilityResult {
  if (!textId) return { available: false, diagnostics: [] };
  const sourceRef = createVoiceAssetId(textId, voiceSettings.locale);
  if (!assetResolver) return { available: false, diagnostics: [], sourceRef };

  const resolved = assetResolver.resolve({ id: sourceRef, kind: "voice" });
  if (resolved.uri) return { available: true, diagnostics: [], sourceRef };
  if (resolved.diagnostic?.code === "asset-kind-mismatch") {
    return {
      available: false,
      diagnostics: [createVnRuntimeAssetDiagnostic({ ...resolved.diagnostic, severity: "warning" })],
      sourceRef
    };
  }
  return { available: false, diagnostics: [], sourceRef };
}

export async function applyVnRuntimeMediaEffects({
  audioPort,
  effects,
  handles,
  resolver,
  videoPort
}: ApplyVnRuntimeMediaEffectsInput): Promise<ApplyVnRuntimeMediaEffectsResult> {
  const diagnostics: VnRuntimeDiagnostic[] = [];
  let voiceHandle: AudioHandle | undefined;
  for (const effect of effects) {
    try {
      if (effect.type === "play-bgm") {
        const resolved = resolver({ sourceRef: effect.sourceRef, kind: "bgm" });
        if (!resolved.uri) {
          if (resolved.diagnostic) diagnostics.push(resolved.diagnostic);
          continue;
        }
        if (!audioPort) {
          diagnostics.push(createVnMediaPortErrorDiagnostic("AudioPort is not available for BGM playback."));
          continue;
        }
        handles.bgm[effect.key]?.stop();
        handles.bgm[effect.key] = audioPort.playBgm(audioPlaybackHandleId(handles, effect.key, "bgm", effect.fadeInMs), resolved.uri, {
          loop: true,
          ...(effect.volume !== undefined ? { volume: effect.volume } : {}),
          ...(effect.fadeInMs !== undefined ? { fadeInMs: effect.fadeInMs } : {})
        });
        continue;
      }

      if (effect.type === "set-bgm-volume") {
        const handle = handles.bgm[effect.key];
        if (!handle) {
          diagnostics.push(createVnMediaHandleMissingDiagnostic(`BGM handle ${effect.key} is not active.`));
          continue;
        }
        handle.fade(effect.volume, effect.durationMs ?? 0);
        continue;
      }

      if (effect.type === "stop-bgm") {
        const handle = handles.bgm[effect.key];
        if (!handle) {
          diagnostics.push(createVnMediaHandleMissingDiagnostic(`BGM handle ${effect.key} is not active.`));
          continue;
        }
        if (effect.fadeMs !== undefined) handle.fadeOutAndStop(effect.fadeMs);
        else handle.stop();
        delete handles.bgm[effect.key];
        continue;
      }

      if (effect.type === "play-sfx") {
        const resolved = resolver({ sourceRef: effect.sourceRef, kind: "sfx" });
        if (!resolved.uri) {
          if (resolved.diagnostic) diagnostics.push(resolved.diagnostic);
          continue;
        }
        if (!audioPort) {
          diagnostics.push(createVnMediaPortErrorDiagnostic("AudioPort is not available for SFX playback."));
          continue;
        }
        const key = effect.key ?? `sfx:one-shot:${++handles.oneShotSequence}`;
        const handle = audioPort.playSfx(audioPlaybackHandleId(handles, key, "sfx", effect.fadeInMs), resolved.uri, {
          loop: effect.loop,
          ...(effect.volume !== undefined ? { volume: effect.volume } : {}),
          ...(effect.fadeInMs !== undefined ? { fadeInMs: effect.fadeInMs } : {})
        });
        if (effect.loop) handles.sfx[key] = handle;
        continue;
      }

      if (effect.type === "set-sfx-volume") {
        const handle = handles.sfx[effect.key];
        if (!handle) {
          diagnostics.push(createVnMediaHandleMissingDiagnostic(`Looping SFX handle ${effect.key} is not active.`));
          continue;
        }
        handle.fade(effect.volume, effect.durationMs ?? 0);
        continue;
      }

      if (effect.type === "stop-sfx") {
        const handle = handles.sfx[effect.key];
        if (!handle) {
          diagnostics.push(createVnMediaHandleMissingDiagnostic(`Looping SFX handle ${effect.key} is not active.`));
          continue;
        }
        if (effect.fadeMs !== undefined) handle.fadeOutAndStop(effect.fadeMs);
        else handle.stop();
        delete handles.sfx[effect.key];
        continue;
      }

      if (effect.type === "play-dialogue-bleep") {
        handles.dialogueBleep?.stop();
        delete handles.dialogueBleep;
        const resolved = resolver({ sourceRef: effect.sourceRef, kind: "bleep" });
        if (!resolved.uri) {
          if (resolved.diagnostic) diagnostics.push({ ...resolved.diagnostic, severity: "warning" });
          continue;
        }
        if (!audioPort) {
          diagnostics.push(createVnMediaPortErrorDiagnostic("AudioPort is not available for dialogue bleep playback."));
          continue;
        }
        handles.dialogueBleep = audioPort.playDialogueBleep(effect.key, resolved.uri, {
          ...(effect.volume !== undefined ? { volume: effect.volume } : {})
        });
        continue;
      }

      if (effect.type === "stop-dialogue-bleep") {
        handles.dialogueBleep?.stop();
        delete handles.dialogueBleep;
        continue;
      }

      if (effect.type === "stop-voice") {
        voiceHandle = undefined;
        handles.voice?.stop();
        delete handles.voice;
        continue;
      }

      if (effect.type === "play-voice") {
        voiceHandle = undefined;
        handles.voice?.stop();
        delete handles.voice;
        const resolved = resolver({ sourceRef: effect.sourceRef, kind: "voice" });
        if (!resolved.uri) {
          if (resolved.diagnostic) diagnostics.push({ ...resolved.diagnostic, severity: "warning" });
          continue;
        }
        if (!audioPort) {
          diagnostics.push(createVnMediaPortErrorDiagnostic("AudioPort is not available for voice playback."));
          continue;
        }
        voiceHandle = audioPort.playVoice(effect.key, resolved.uri, {
          ...(effect.volume !== undefined ? { volume: effect.volume } : {})
        });
        handles.voice = voiceHandle;
        continue;
      }

      const resolved = resolver({ sourceRef: effect.sourceRef, kind: "video" });
      if (!resolved.uri) {
        if (resolved.diagnostic) diagnostics.push(resolved.diagnostic);
        continue;
      }
      if (videoPort) await videoPort.play(resolved.uri);
    } catch (error) {
      diagnostics.push(createVnMediaPortErrorDiagnostic(error instanceof Error ? error.message : String(error)));
    }
  }
  return {
    diagnostics,
    ...(voiceHandle ? { voiceHandle } : {})
  };
}

export function disposeVnRuntimeMedia(
  handles: VnRuntimeMediaHandleStore,
  audioPort: AudioPort,
  videoPort?: VideoPort
): VnRuntimeMediaHandleStore {
  audioPort.stopAll();
  videoPort?.stop();
  return { bgm: {}, sfx: {}, oneShotSequence: handles.oneShotSequence };
}

function audioPlaybackHandleId(
  handles: VnRuntimeMediaHandleStore,
  key: string,
  kind: "bgm" | "sfx",
  fadeInMs: number | undefined
): string {
  return fadeInMs !== undefined && fadeInMs > 0 ? `${key}:${kind}:fade-in:${++handles.oneShotSequence}` : key;
}
