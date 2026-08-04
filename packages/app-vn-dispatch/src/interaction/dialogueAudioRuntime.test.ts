import { describe, expect, it } from "vitest";
import type { DialogueBleepConfig } from "@v-ronpa/contracts";
import {
  planDialogueLineAudio,
  reduceDialogueAudioLifecycle,
  resolveDialogueBleepSound,
  type DialogueAudioRuntimeState
} from "./dialogueAudioRuntime";

describe("dialogue audio runtime", () => {
  const config: DialogueBleepConfig = {
    enabled: true,
    defaultSound: { assetId: "bleep/dialogue-default", gain: 0.5 },
    speakerOverrides: {
      Felix: { assetId: "bleep/dialogue-felix", gain: 0.75 },
      Narrator: null
    }
  };

  it("resolves exact speaker bleep configuration", () => {
    expect(resolveDialogueBleepSound(config, undefined)).toEqual({ assetId: "bleep/dialogue-default", gain: 0.5 });
    expect(resolveDialogueBleepSound(config, "Felix")).toEqual({ assetId: "bleep/dialogue-felix", gain: 0.75 });
    expect(resolveDialogueBleepSound(config, "Narrator")).toBeUndefined();
    expect(resolveDialogueBleepSound(config, "felix")).toEqual({ assetId: "bleep/dialogue-default", gain: 0.5 });
    expect(resolveDialogueBleepSound({ ...config, enabled: false }, "Felix")).toBeUndefined();
  });

  it("uses resolvable voice assets as the dialogue line audio winner", () => {
    const result = planDialogueLineAudio(
      {},
      lineInput({
        speakerId: "Felix",
        textId: "voice_validation_0001",
        voiceAssetId: "voice/zh/voice-validation-0001",
        voiceVolume: 0.25
      })
    );

    expect(result).toEqual({
      state: {},
      hasVoiceBoundary: true,
      effects: [
        { type: "stop-voice" },
        {
          type: "play-voice",
          key: "voice/zh/voice-validation-0001",
          textId: "voice_validation_0001",
          assetId: "voice/zh/voice-validation-0001",
          volume: 0.25
        }
      ]
    });
  });

  it("suppresses bleep for resolvable voice even when voice is muted", () => {
    expect(
      planDialogueLineAudio(
        {},
        lineInput({
          speakerId: "Felix",
          textId: "voice_validation_0001",
          voiceAssetId: "voice/zh/voice-validation-0001",
          voiceVolume: 0
        })
      )
    ).toEqual({
      state: {},
      hasVoiceBoundary: true,
      effects: [{ type: "stop-voice" }]
    });
  });

  it("keeps whole-line voice alive across staged continuations and restarts suffix bleep only", () => {
    expect(
      planDialogueLineAudio({}, lineInput({
        continuation: true,
        lineKey: "line:voice-stage-2",
        textId: "voice_validation_0001",
        voiceAssetId: "voice/zh/voice-validation-0001"
      }))
    ).toEqual({ state: {}, hasVoiceBoundary: false, effects: [] });

    expect(
      planDialogueLineAudio({}, lineInput({
        continuation: true,
        lineKey: "line:bleep-stage-2"
      }))
    ).toEqual({
      state: {
        activeBleepLineKey: "line:bleep-stage-2",
        activeBleepKey: "dialogue-bleep:line:bleep-stage-2",
        activeBleepAssetId: "bleep/dialogue-default"
      },
      hasVoiceBoundary: false,
      effects: [{
        type: "play-dialogue-bleep",
        key: "dialogue-bleep:line:bleep-stage-2",
        assetId: "bleep/dialogue-default",
        volume: 0.2
      }]
    });
  });

  it("falls back to bleep when voice is unavailable and still applies speaker overrides", () => {
    expect(
      planDialogueLineAudio(
        {},
        lineInput({
          lineKey: "line:override",
          speakerId: "Felix",
          textId: "planned_voice",
          voiceVolume: 0.25
        })
      )
    ).toEqual({
      state: {
        activeBleepLineKey: "line:override",
        activeBleepKey: "dialogue-bleep:line:override",
        activeBleepAssetId: "bleep/dialogue-felix"
      },
      hasVoiceBoundary: true,
      effects: [
        { type: "stop-voice" },
        {
          type: "play-dialogue-bleep",
          key: "dialogue-bleep:line:override",
          assetId: "bleep/dialogue-felix",
          volume: expect.closeTo(0.3)
        }
      ]
    });

    expect(
      planDialogueLineAudio(
        {},
        lineInput({ lineKey: "line:null", speakerId: "Narrator", textId: "planned_voice" })
      )
    ).toEqual({ state: {}, hasVoiceBoundary: true, effects: [{ type: "stop-voice" }] });

    expect(
      planDialogueLineAudio(
        {},
        lineInput({ lineKey: "line:default", speakerId: "felix", textId: "planned_voice" })
      ).effects
    ).toEqual([
      { type: "stop-voice" },
      { type: "play-dialogue-bleep", key: "dialogue-bleep:line:default", assetId: "bleep/dialogue-default", volume: 0.2 }
    ]);
  });

  it("does not start bleep for skip, hidden, instant, muted, or disabled bleep paths", () => {
    const cases = [
      { pacing: "skip" as const, textVisible: true, revealStatus: "revealing" as const, bleepVolume: 1 },
      { pacing: "normal" as const, textVisible: false, revealStatus: "revealing" as const, bleepVolume: 1 },
      { pacing: "normal" as const, textVisible: true, revealStatus: "complete" as const, bleepVolume: 1 },
      { pacing: "normal" as const, textVisible: true, revealStatus: "revealing" as const, bleepVolume: 0 }
    ];

    for (const item of cases) {
      expect(planDialogueLineAudio({}, lineInput(item))).toEqual({
        state: {},
        hasVoiceBoundary: true,
        effects: [{ type: "stop-voice" }]
      });
    }
  });

  it("stops active bleep on finish, clear, replacement, or a voiced new line", () => {
    const active: DialogueAudioRuntimeState = {
      activeBleepLineKey: "line:1",
      activeBleepKey: "dialogue-bleep:line:1",
      activeBleepAssetId: "bleep/dialogue-default"
    };

    expect(reduceDialogueAudioLifecycle(active, { type: "line-finish", lineKey: "line:2" })).toEqual({
      state: active,
      effects: [],
      hasVoiceBoundary: false
    });
    expect(reduceDialogueAudioLifecycle(active, { type: "line-finish", lineKey: "line:1" })).toEqual({
      state: {},
      effects: [{ type: "stop-dialogue-bleep", key: "dialogue-bleep:line:1" }],
      hasVoiceBoundary: false
    });
    expect(reduceDialogueAudioLifecycle(active, { type: "clear", reason: "reset" })).toEqual({
      state: {},
      effects: [{ type: "stop-dialogue-bleep", key: "dialogue-bleep:line:1" }],
      hasVoiceBoundary: false
    });

    expect(
      planDialogueLineAudio(
        active,
        lineInput({ lineKey: "line:2", speakerId: "Mira", textId: "planned_voice" })
      ).effects
    ).toEqual([
      { type: "stop-dialogue-bleep", key: "dialogue-bleep:line:1" },
      { type: "stop-voice" },
      { type: "play-dialogue-bleep", key: "dialogue-bleep:line:2", assetId: "bleep/dialogue-default", volume: 0.2 }
    ]);

    expect(
      planDialogueLineAudio(
        active,
        lineInput({ lineKey: "line:voiced", textId: "voice_validation_0001", voiceAssetId: "voice/zh/voice-validation-0001", voiceVolume: 0.25 })
      )
    ).toEqual({
      state: {},
      hasVoiceBoundary: true,
      effects: [
        { type: "stop-dialogue-bleep", key: "dialogue-bleep:line:1" },
        { type: "stop-voice" },
        {
          type: "play-voice",
          key: "voice/zh/voice-validation-0001",
          textId: "voice_validation_0001",
          assetId: "voice/zh/voice-validation-0001",
          volume: 0.25
        }
      ]
    });
  });

  function lineInput({
    bleepVolume = 0.4,
    textVisible = true,
    lineKey = "line:1",
    pacing = "normal",
    revealStatus = "revealing",
    speakerId,
    textId,
    voiceAssetId,
    voiceVolume = 1,
    continuation = false
  }: {
    bleepVolume?: number;
    textVisible?: boolean;
    lineKey?: string;
    pacing?: "normal" | "skip";
    revealStatus?: "revealing" | "complete";
    speakerId?: string;
    textId?: string;
    voiceAssetId?: string;
    voiceVolume?: number;
    continuation?: boolean;
  }) {
    return {
      bleep: { config, volume: bleepVolume },
      textVisible,
      lineKey,
      pacing,
      revealStatus,
      ...(speakerId ? { speakerId } : {}),
      ...(textId ? { textId } : {}),
      voice: { locale: "zh", volume: voiceVolume },
      ...(voiceAssetId ? { voiceAssetId } : {}),
      ...(continuation ? { continuation } : {})
    };
  }
});
