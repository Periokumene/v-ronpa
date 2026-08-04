import type { DialogueBleepConfig, DialogueBleepSound } from "@v-ronpa/contracts";
import type { MediaRuntimeEffect } from "../mediaRuntime";

export type DialogueAudioRevealStatus = "revealing" | "complete";
export type DialogueAudioPacing = "normal" | "skip";

export interface DialogueAudioRuntimeState {
  activeBleepLineKey?: string;
  activeBleepKey?: string;
  activeBleepAssetId?: string;
}

export interface DialogueAudioVoiceSettings {
  locale: string;
  volume: number;
}

export interface DialogueAudioBleepSettings {
  config?: DialogueBleepConfig;
  volume: number;
}

export interface PlanDialogueLineAudioInput {
  bleep: DialogueAudioBleepSettings;
  textVisible: boolean;
  lineKey: string;
  pacing: DialogueAudioPacing;
  revealStatus: DialogueAudioRevealStatus;
  speakerId?: string;
  textId?: string;
  voice: DialogueAudioVoiceSettings;
  voiceAssetId?: string;
  continuation?: boolean;
}

export type DialogueAudioLifecycleSignal =
  | { type: "line-finish"; lineKey: string }
  | { type: "clear"; reason: string };

export type DialogueAudioEffect = Extract<
  MediaRuntimeEffect,
  { type: "play-dialogue-bleep" | "stop-dialogue-bleep" | "stop-voice" | "play-voice" }
>;

export interface DialogueAudioRuntimeStep {
  effects: DialogueAudioEffect[];
  hasVoiceBoundary: boolean;
  state: DialogueAudioRuntimeState;
}

export function planDialogueLineAudio(
  state: DialogueAudioRuntimeState,
  input: PlanDialogueLineAudioInput
): DialogueAudioRuntimeStep {
  const stopped = stopActiveDialogueBleep(state);
  const effects: DialogueAudioEffect[] = [
    ...stopped.effects,
    ...(input.continuation ? [] : [{ type: "stop-voice" as const }])
  ];
  const hasAvailableVoice = Boolean(input.textId && input.voiceAssetId);

  if (hasAvailableVoice) {
    if (!input.continuation && input.pacing !== "skip" && input.textId && input.voiceAssetId && input.voice.volume > 0) {
      const assetId = input.voiceAssetId;
      effects.push({
        type: "play-voice",
        key: assetId,
        textId: input.textId,
        assetId,
        volume: input.voice.volume
      });
    }
    return { state: stopped.state, effects, hasVoiceBoundary: !input.continuation };
  }

  const bleep = planDialogueBleepStart(stopped.state, input);
  return {
    state: bleep.state,
    effects: [...effects, ...bleep.effects],
    hasVoiceBoundary: !input.continuation
  };
}

export function reduceDialogueAudioLifecycle(
  state: DialogueAudioRuntimeState,
  signal: DialogueAudioLifecycleSignal
): DialogueAudioRuntimeStep {
  if (signal.type === "clear") return { ...stopActiveDialogueBleep(state), hasVoiceBoundary: false };
  if (state.activeBleepLineKey !== signal.lineKey) return { state, effects: [], hasVoiceBoundary: false };
  return { ...stopActiveDialogueBleep(state), hasVoiceBoundary: false };
}

export function resolveDialogueBleepSound(
  config: DialogueBleepConfig | undefined,
  speakerId: string | undefined
): DialogueBleepSound | undefined {
  if (!config || config.enabled === false) return undefined;
  const speakerOverrides = config.speakerOverrides ?? {};
  if (speakerId && Object.prototype.hasOwnProperty.call(speakerOverrides, speakerId)) {
    return speakerOverrides[speakerId] ?? undefined;
  }
  return config.defaultSound ?? undefined;
}

function planDialogueBleepStart(
  state: DialogueAudioRuntimeState,
  input: PlanDialogueLineAudioInput
): Pick<DialogueAudioRuntimeStep, "state" | "effects"> {
  if (input.pacing === "skip" || !input.textVisible || input.revealStatus !== "revealing" || input.bleep.volume <= 0) {
    return { state, effects: [] };
  }

  const sound = resolveDialogueBleepSound(input.bleep.config, input.speakerId);
  if (!sound) return { state, effects: [] };

  const volume = input.bleep.volume * (sound.gain ?? 1);
  if (volume <= 0) return { state, effects: [] };

  const key = createDialogueBleepKey(input.lineKey);
  return {
    state: {
      activeBleepLineKey: input.lineKey,
      activeBleepKey: key,
      activeBleepAssetId: sound.assetId
    },
    effects: [{ type: "play-dialogue-bleep", key, assetId: sound.assetId, volume }]
  };
}

function stopActiveDialogueBleep(state: DialogueAudioRuntimeState): Pick<DialogueAudioRuntimeStep, "state" | "effects"> {
  if (!state.activeBleepKey) return { state: {}, effects: [] };
  return { state: {}, effects: [{ type: "stop-dialogue-bleep", key: state.activeBleepKey }] };
}

function createDialogueBleepKey(lineKey: string): string {
  return `dialogue-bleep:${lineKey}`;
}
