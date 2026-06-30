import { describe, expect, it } from "vitest";
import type { DialogueBleepConfig } from "@v-ronpa/contracts";
import {
  createVoiceAssetId,
  planDialogueLineAudio,
  reduceDialogueAudioLifecycle,
  resolveDialogueBleepSound,
  type DialogueAudioRuntimeState
} from "./dialogueAudioRuntime";

describe("dialogue audio runtime", () => {
  const config: DialogueBleepConfig = {
    enabled: true,
    defaultSound: { sourceRef: "bleep:dialogue-default", gain: 0.5 },
    speakerOverrides: {
      Felix: { sourceRef: "bleep:dialogue-felix", gain: 0.75 },
      Narrator: null
    }
  };

  it("resolves voice ids and exact speaker bleep configuration", () => {
    expect(createVoiceAssetId("voice_validation_0001", "zh")).toBe("voice:zh:voice_validation_0001");
    expect(resolveDialogueBleepSound(config, undefined)).toEqual({ sourceRef: "bleep:dialogue-default", gain: 0.5 });
    expect(resolveDialogueBleepSound(config, "Felix")).toEqual({ sourceRef: "bleep:dialogue-felix", gain: 0.75 });
    expect(resolveDialogueBleepSound(config, "Narrator")).toBeUndefined();
    expect(resolveDialogueBleepSound(config, "felix")).toEqual({ sourceRef: "bleep:dialogue-default", gain: 0.5 });
    expect(resolveDialogueBleepSound({ ...config, enabled: false }, "Felix")).toBeUndefined();
  });

  it("uses resolvable voice assets as the dialogue line audio winner", () => {
    const result = planDialogueLineAudio(
      {},
      lineInput({
        speakerId: "Felix",
        textId: "voice_validation_0001",
        voiceAssetAvailable: true,
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
          key: "voice:zh:voice_validation_0001",
          textId: "voice_validation_0001",
          sourceRef: "voice:zh:voice_validation_0001",
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
          voiceAssetAvailable: true,
          voiceVolume: 0
        })
      )
    ).toEqual({
      state: {},
      hasVoiceBoundary: true,
      effects: [{ type: "stop-voice" }]
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
          voiceAssetAvailable: false,
          voiceVolume: 0.25
        })
      )
    ).toEqual({
      state: {
        activeBleepLineKey: "line:override",
        activeBleepKey: "dialogue-bleep:line:override",
        activeBleepSourceRef: "bleep:dialogue-felix"
      },
      hasVoiceBoundary: true,
      effects: [
        { type: "stop-voice" },
        {
          type: "play-dialogue-bleep",
          key: "dialogue-bleep:line:override",
          sourceRef: "bleep:dialogue-felix",
          volume: expect.closeTo(0.3)
        }
      ]
    });

    expect(
      planDialogueLineAudio(
        {},
        lineInput({ lineKey: "line:null", speakerId: "Narrator", textId: "planned_voice", voiceAssetAvailable: false })
      )
    ).toEqual({ state: {}, hasVoiceBoundary: true, effects: [{ type: "stop-voice" }] });

    expect(
      planDialogueLineAudio(
        {},
        lineInput({ lineKey: "line:default", speakerId: "felix", textId: "planned_voice", voiceAssetAvailable: false })
      ).effects
    ).toEqual([
      { type: "stop-voice" },
      { type: "play-dialogue-bleep", key: "dialogue-bleep:line:default", sourceRef: "bleep:dialogue-default", volume: 0.2 }
    ]);
  });

  it("does not start bleep for skip, hidden, instant, muted, or disabled bleep paths", () => {
    const cases = [
      { pacing: "skip" as const, dialogVisible: true, revealStatus: "revealing" as const, bleepVolume: 1 },
      { pacing: "normal" as const, dialogVisible: false, revealStatus: "revealing" as const, bleepVolume: 1 },
      { pacing: "normal" as const, dialogVisible: true, revealStatus: "complete" as const, bleepVolume: 1 },
      { pacing: "normal" as const, dialogVisible: true, revealStatus: "revealing" as const, bleepVolume: 0 }
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
      activeBleepSourceRef: "bleep:dialogue-default"
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
        lineInput({ lineKey: "line:2", speakerId: "Mira", textId: "planned_voice", voiceAssetAvailable: false })
      ).effects
    ).toEqual([
      { type: "stop-dialogue-bleep", key: "dialogue-bleep:line:1" },
      { type: "stop-voice" },
      { type: "play-dialogue-bleep", key: "dialogue-bleep:line:2", sourceRef: "bleep:dialogue-default", volume: 0.2 }
    ]);

    expect(
      planDialogueLineAudio(
        active,
        lineInput({ lineKey: "line:voiced", textId: "voice_validation_0001", voiceAssetAvailable: true, voiceVolume: 0.25 })
      )
    ).toEqual({
      state: {},
      hasVoiceBoundary: true,
      effects: [
        { type: "stop-dialogue-bleep", key: "dialogue-bleep:line:1" },
        { type: "stop-voice" },
        {
          type: "play-voice",
          key: "voice:zh:voice_validation_0001",
          textId: "voice_validation_0001",
          sourceRef: "voice:zh:voice_validation_0001",
          volume: 0.25
        }
      ]
    });
  });

  function lineInput({
    bleepVolume = 0.4,
    dialogVisible = true,
    lineKey = "line:1",
    pacing = "normal",
    revealStatus = "revealing",
    speakerId,
    textId,
    voiceAssetAvailable = false,
    voiceVolume = 1
  }: {
    bleepVolume?: number;
    dialogVisible?: boolean;
    lineKey?: string;
    pacing?: "normal" | "skip";
    revealStatus?: "revealing" | "complete";
    speakerId?: string;
    textId?: string;
    voiceAssetAvailable?: boolean;
    voiceVolume?: number;
  }) {
    return {
      bleep: { config, volume: bleepVolume },
      dialogVisible,
      lineKey,
      pacing,
      revealStatus,
      ...(speakerId ? { speakerId } : {}),
      ...(textId ? { textId } : {}),
      voice: { locale: "zh", volume: voiceVolume },
      voiceAssetAvailable
    };
  }
});
