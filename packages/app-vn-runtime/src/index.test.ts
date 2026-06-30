import { describe, expect, it, vi } from "vitest";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import { createVoiceAssetId, planDialogueLineAudio, type UiRuntimeState } from "@v-ronpa/app-vn-dispatch";
import type {
  ContentManifest,
  RuntimeAsset,
  RuntimeAssetFormat,
  RuntimeAssetKind,
  RuntimeScript
} from "@v-ronpa/contracts";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import { createInitialPixiStageSnapshot, reducePixiRuntimeCommand } from "@v-ronpa/pixi-presenter";
import { createInitialStoryState, storyRuntimeSnapshot } from "@v-ronpa/story-engine";
import type { AudioHandle, AudioHandleFinishResult, AudioPort, VideoPort } from "@v-ronpa/media-save";
import {
  VN_POST_VOICE_AUTO_ADVANCE_DELAY_MS,
  applyVnRuntimeMediaEffects,
  canAdvanceVnStoryFromSource,
  canCompleteVnPauseRuntimeWaitFromSource,
  canToggleVnStoryAutomation,
  createVnRuntimeRestorePlan,
  createVnVoiceAutoAdvanceGateController,
  resolveVnDialogueVoiceAssetAvailability,
  resolveVnPresentationWaitAdvanceSource,
  resolveVnRuntimeMediaSource,
  shouldAnimateVnStoryPlayPacing,
  syncVnRuntimeToastDismissalTimers,
  type VnRuntimeMediaHandleStore,
  type VnStoryRuntime
} from "./index";

describe("app VN runtime helpers", () => {
  it("keeps toast dismissal timers independent from toastLayer visibility", () => {
    const timeouts: Record<string, number> = {};
    const scheduled: Array<{ callback: () => void; durationMs: number }> = [];
    const dismissed: string[] = [];
    const state: UiRuntimeState = {
      visible: { dialog: true, commandBar: true, toastLayer: false },
      toasts: [{ id: "toast:1", text: "Hidden toast", durationMs: 100 }]
    };

    syncVnRuntimeToastDismissalTimers({
      state,
      timeouts,
      setTimeoutFn: (callback, durationMs) => {
        scheduled.push({ callback, durationMs });
        return 7;
      },
      clearTimeoutFn: viFn(),
      dismissToastId: (toastId) => dismissed.push(toastId)
    });

    expect(timeouts["toast:1"]).toBe(7);
    expect(scheduled.map(({ durationMs }) => durationMs)).toEqual([100]);

    scheduled[0]?.callback();
    expect(dismissed).toEqual(["toast:1"]);
    expect(timeouts).toEqual({});
  });

  it("plans restore without carrying transient runtime wait state", () => {
    const runtimeScript = compileScenario("Felix: Restore me.", "restore-test.nani");
    const story = {
      ...createInitialStoryState(runtimeScript),
      instructionPointer: 1,
      backlog: [{ speaker: "Felix", text: "Restore me." }],
      runtimeWait: { kind: "pause" as const, commandId: "wait" as const, commandIndex: 0, mode: "confirm" as const }
    };
    const pixiStage = reducePixiRuntimeCommand(createInitialPixiStageSnapshot(), {
      commandId: "char",
      canonicalName: "char",
      category: "actor",
      source: "v-ronpa",
      status: "implemented",
      params: {
        target: "Ema",
        appearanceExpression: "Pensive1,ArmR3",
        pos: [0.5, 0]
      },
      loc: { scriptPath: "restore-test.nani", line: 1, column: 1, raw: "@char" }
    }).snapshot;

    const plan = createVnRuntimeRestorePlan({
      active: true,
      pixiStage,
      script: runtimeScript,
      story: storyRuntimeSnapshot(story)
    });

    expect(plan.storyRuntime.active).toBe(true);
    expect(plan.storyRuntime.state).toMatchObject({
      instructionPointer: 1,
      backlog: [{ speaker: "Felix", text: "Restore me." }]
    });
    expect(plan.storyRuntime.state.runtimeWait).toBeUndefined();
    expect(plan.storyPlay).toEqual({ mode: "manual" });
    expect(plan.pixiStageRuntime).toEqual({
      snapshot: pixiStage,
      hints: [],
      hintSequence: 0,
      animate: false,
      presentationTasks: []
    });
    expect(plan.diagnostics).toEqual([
      {
        source: "story",
        code: "runtime-wait-cleared-on-load",
        severity: "warning",
        message: "Saved runtimeWait was cleared during restore because runtime waits are transient app state."
      }
    ]);
  });

  it("resolves media sources through the asset registry and rejects raw URI fallback", () => {
    const assetResolver = createAssetRegistry(
      manifestWithAssets([
        runtimeAsset("bgm:main", "bgm", "/runtime-main.ogg"),
        runtimeAsset("sfx:door", "sfx", "/door.ogg")
      ])
    );

    expect(resolveVnRuntimeMediaSource({ sourceRef: "bgm:main", kind: "bgm", assetResolver })).toEqual({
      uri: "/runtime-main.ogg"
    });
    expect(resolveVnRuntimeMediaSource({ sourceRef: "/raw/sfx.ogg", kind: "sfx", assetResolver }).diagnostic).toMatchObject({
      source: "asset",
      code: "raw-uri-disallowed"
    });
  });

  it("applies audio effects through AudioPort handles with cleanup semantics", async () => {
    const bgmHandle = audioHandle("music");
    const sfxHandle = audioHandle("rain");
    const voiceHandle = audioHandle("voice:zh:line");
    const handles: VnRuntimeMediaHandleStore = { bgm: {}, sfx: {}, oneShotSequence: 0 };
    const playBgm = viFn(() => bgmHandle);
    const playSfx = viFn(() => sfxHandle);
    const playVoice = viFn(() => voiceHandle);
    const audioPort: AudioPort = {
      playBgm,
      playSfx,
      playDialogueBleep: viFn(() => audioHandle("bleep")),
      playVoice,
      stopAll: viFn()
    };

    const result = await applyVnRuntimeMediaEffects({
      audioPort,
      handles,
      effects: [
        { type: "play-bgm", key: "music", group: "music", sourceRef: "bgm:main", volume: 0.4 },
        { type: "play-sfx", key: "rain", group: "rain", sourceRef: "sfx:rain", loop: true, fast: false, volume: 0.3 },
        {
          type: "play-voice",
          key: "voice:zh:line",
          textId: "line",
          sourceRef: "voice:zh:line",
          volume: 0.6
        },
        { type: "stop-bgm", key: "music", group: "music", fadeMs: 200 },
        { type: "stop-sfx", key: "rain", group: "rain" }
      ],
      resolver: ({ sourceRef }) => ({ uri: `/resolved/${sourceRef}.ogg` })
    });

    expect(playBgm.calls).toEqual([["music", "/resolved/bgm:main.ogg", { loop: true, volume: 0.4 }]]);
    expect(playSfx.calls).toEqual([["rain", "/resolved/sfx:rain.ogg", { loop: true, volume: 0.3 }]]);
    expect(playVoice.calls).toEqual([["voice:zh:line", "/resolved/voice:zh:line.ogg", { volume: 0.6 }]]);
    expect((bgmHandle.fadeOutAndStop as ReturnType<typeof viFn>).calls).toEqual([[200]]);
    expect((sfxHandle.stop as ReturnType<typeof viFn>).calls).toEqual([[]]);
    expect(result).toEqual({ diagnostics: [], voiceHandle });
  });

  it("uses dialogue voice availability to suppress bleep and returns a gateable voice handle", async () => {
    const voiceHandle = audioHandle("voice:zh:voice_validation_0001");
    const playVoice = viFn(() => voiceHandle);
    const playDialogueBleep = viFn(() => audioHandle("bleep"));
    const audioPort: AudioPort = {
      playBgm: viFn(),
      playSfx: viFn(),
      playDialogueBleep,
      playVoice,
      stopAll: viFn()
    };
    const assetResolver = createAssetRegistry(
      manifestWithAssets([
        runtimeAsset("voice:zh:voice_validation_0001", "voice", "/voice/voice_validation_0001.ogg"),
        runtimeAsset("bleep:dialogue-felix", "bleep", "/bleep/felix.ogg")
      ])
    );
    const availability = resolveVnDialogueVoiceAssetAvailability({
      assetResolver,
      textId: "voice_validation_0001",
      voiceSettings: { locale: "zh", volume: 0.25 }
    });
    const planned = planDialogueLineAudio(
      {},
      {
        bleep: {
          config: {
            enabled: true,
            defaultSound: { sourceRef: "bleep:dialogue-felix", gain: 1 },
            speakerOverrides: {}
          },
          volume: 1
        },
        dialogVisible: true,
        lineKey: "line:voice",
        pacing: "normal",
        revealStatus: "revealing",
        speakerId: "Felix",
        textId: "voice_validation_0001",
        voice: { locale: "zh", volume: 0.25 },
        voiceAssetAvailable: availability.available
      }
    );

    const result = await applyVnRuntimeMediaEffects({
      audioPort,
      handles: { bgm: {}, sfx: {}, oneShotSequence: 0 },
      effects: planned.effects,
      resolver: ({ sourceRef, kind }) => resolveVnRuntimeMediaSource({ sourceRef, kind, assetResolver })
    });

    expect(createVoiceAssetId("voice_validation_0001", "zh")).toBe("voice:zh:voice_validation_0001");
    expect(availability.diagnostics).toEqual([]);
    expect(planned.effects.some((effect) => effect.type === "play-dialogue-bleep")).toBe(false);
    expect(playDialogueBleep.calls).toEqual([]);
    expect(playVoice.calls).toEqual([
      ["voice:zh:voice_validation_0001", "/voice/voice_validation_0001.ogg", { volume: 0.25 }]
    ]);
    expect(result).toEqual({ diagnostics: [], voiceHandle });
  });

  it("falls back to bleep without warning when planned textId audio is missing", async () => {
    const bleepHandle = audioHandle("dialogue-bleep:line:missing");
    const playVoice = viFn(() => audioHandle("voice"));
    const playDialogueBleep = viFn(() => bleepHandle);
    const audioPort: AudioPort = {
      playBgm: viFn(),
      playSfx: viFn(),
      playDialogueBleep,
      playVoice,
      stopAll: viFn()
    };
    const assetResolver = createAssetRegistry(
      manifestWithAssets([runtimeAsset("bleep:dialogue-default", "bleep", "/bleep/default.ogg")])
    );
    const availability = resolveVnDialogueVoiceAssetAvailability({
      assetResolver,
      textId: "planned_future_voice",
      voiceSettings: { locale: "zh", volume: 0.25 }
    });
    const planned = planDialogueLineAudio(
      {},
      {
        bleep: {
          config: {
            enabled: true,
            defaultSound: { sourceRef: "bleep:dialogue-default", gain: 1 },
            speakerOverrides: {}
          },
          volume: 0.5
        },
        dialogVisible: true,
        lineKey: "line:missing",
        pacing: "normal",
        revealStatus: "revealing",
        speakerId: "Mira",
        textId: "planned_future_voice",
        voice: { locale: "zh", volume: 0.25 },
        voiceAssetAvailable: availability.available
      }
    );

    const result = await applyVnRuntimeMediaEffects({
      audioPort,
      handles: { bgm: {}, sfx: {}, oneShotSequence: 0 },
      effects: planned.effects,
      resolver: ({ sourceRef, kind }) => resolveVnRuntimeMediaSource({ sourceRef, kind, assetResolver })
    });

    expect(availability).toEqual({
      available: false,
      diagnostics: [],
      sourceRef: "voice:zh:planned_future_voice"
    });
    expect(playVoice.calls).toEqual([]);
    expect(playDialogueBleep.calls).toEqual([
      ["dialogue-bleep:line:missing", "/bleep/default.ogg", { volume: 0.5 }]
    ]);
    expect(result).toEqual({ diagnostics: [] });
  });

  it("reports missing media assets and clears transient dialogue handles", async () => {
    const staleBleep = audioHandle("dialogue-bleep:stale");
    const staleVoice = audioHandle("voice:zh:stale");
    const playBgm = viFn();
    const playDialogueBleep = viFn();
    const playVoice = viFn();
    const audioPort: AudioPort = {
      playBgm,
      playSfx: viFn(),
      playDialogueBleep,
      playVoice,
      stopAll: viFn()
    };
    const handles: VnRuntimeMediaHandleStore = {
      bgm: {},
      sfx: {},
      dialogueBleep: staleBleep,
      voice: staleVoice,
      oneShotSequence: 0
    };
    const assetResolver = createAssetRegistry(manifestWithAssets([]));

    const result = await applyVnRuntimeMediaEffects({
      audioPort,
      handles,
      effects: [
        { type: "play-bgm", key: "missing-bgm", group: "music", sourceRef: "bgm:missing" },
        { type: "play-dialogue-bleep", key: "bleep:line", sourceRef: "bleep:missing" },
        { type: "play-voice", key: "voice:zh:missing", textId: "missing", sourceRef: "voice:zh:missing" }
      ],
      resolver: ({ sourceRef, kind }) => resolveVnRuntimeMediaSource({ sourceRef, kind, assetResolver })
    });

    expect((staleBleep.stop as ReturnType<typeof viFn>).calls).toEqual([[]]);
    expect((staleVoice.stop as ReturnType<typeof viFn>).calls).toEqual([[]]);
    expect(playBgm.calls).toEqual([]);
    expect(playDialogueBleep.calls).toEqual([]);
    expect(playVoice.calls).toEqual([]);
    expect(handles.dialogueBleep).toBeUndefined();
    expect(handles.voice).toBeUndefined();
    expect(result.diagnostics.map(({ code, severity }) => ({ code, severity }))).toEqual([
      { code: "asset-missing", severity: "error" },
      { code: "asset-missing", severity: "warning" },
      { code: "asset-missing", severity: "warning" }
    ]);
  });

  it("waits for voice end and post-voice delay before releasing pending AUTO advance", async () => {
    vi.useFakeTimers();
    try {
      const advances: string[] = [];
      const { handle, resolve } = deferredAudioHandle("voice:zh:line");
      const controller = createVnVoiceAutoAdvanceGateController({
        advance: (source) => advances.push(source),
        clearTimeoutFn: clearTimeout,
        setTimeoutFn: setTimeout,
        stopVoice: viFn()
      });

      controller.install(handle);
      expect(controller.request("auto")).toBe(false);

      resolve({ reason: "ended" });
      await Promise.resolve();
      vi.advanceTimersByTime(VN_POST_VOICE_AUTO_ADVANCE_DELAY_MS - 1);
      expect(advances).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(advances).toEqual(["auto"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not release pending AUTO from stopped handles and releases failed voices immediately", async () => {
    vi.useFakeTimers();
    try {
      const advances: string[] = [];
      const stopVoice = viFn();
      const stopped = deferredAudioHandle("voice:zh:stopped");
      const failed = deferredAudioHandle("voice:zh:failed");
      const controller = createVnVoiceAutoAdvanceGateController({
        advance: (source) => advances.push(source),
        clearTimeoutFn: clearTimeout,
        setTimeoutFn: setTimeout,
        stopVoice
      });

      controller.install(stopped.handle);
      expect(controller.request("auto")).toBe(false);
      stopped.resolve({ reason: "stopped" });
      await Promise.resolve();
      vi.advanceTimersByTime(VN_POST_VOICE_AUTO_ADVANCE_DELAY_MS);
      expect(advances).toEqual([]);

      controller.install(failed.handle);
      expect(controller.request("auto-next")).toBe(false);
      failed.resolve({ reason: "failed" });
      await Promise.resolve();
      expect(advances).toEqual(["auto-next"]);

      controller.install(stopped.handle);
      expect(controller.request("skip")).toBe(true);
      expect(stopVoice.calls).toEqual([[]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("can apply movie effects through an attached VideoPort when used directly", async () => {
    const play = viFn(async () => undefined);
    const videoPort: VideoPort = {
      attach: viFn(),
      play,
      stop: viFn()
    };
    const result = await applyVnRuntimeMediaEffects({
      videoPort,
      handles: { bgm: {}, sfx: {}, oneShotSequence: 0 },
      effects: [{ type: "play-movie", sourceRef: "video:intro", block: true }],
      resolver: () => ({ uri: "/resolved/intro.mp4" })
    });

    expect(result.diagnostics).toEqual([]);
    expect(play.calls).toEqual([["/resolved/intro.mp4"]]);
  });

  it("keeps story automation availability and presentation pacing as runtime decisions", () => {
    const runtimeScript = compileScenario("Felix: Runtime.", "runtime-playback-test.nani");
    const storyRuntime: VnStoryRuntime = {
      active: true,
      state: createInitialStoryState(runtimeScript)
    };

    expect(canToggleVnStoryAutomation(storyRuntime)).toBe(true);
    expect(
      canToggleVnStoryAutomation({
        ...storyRuntime,
        state: { ...storyRuntime.state, pendingChoices: [{ text: "Choice", enabled: true }] }
      })
    ).toBe(false);
    expect(shouldAnimateVnStoryPlayPacing("normal")).toBe(true);
    expect(shouldAnimateVnStoryPlayPacing("skip")).toBe(false);
    expect(resolveVnPresentationWaitAdvanceSource("system", { mode: "manual" })).toBe("system");
    expect(resolveVnPresentationWaitAdvanceSource("system", { mode: "skip" })).toBe("skip");
  });

  it("only treats user advance as story-mutating when the current wait can actually complete", () => {
    const runtimeScript = compileScenario("Felix: Runtime.", "runtime-advance-test.nani");
    const activeStory: VnStoryRuntime = {
      active: true,
      state: createInitialStoryState(runtimeScript)
    };

    expect(canAdvanceVnStoryFromSource(activeStory, "manual")).toBe(true);
    expect(
      canAdvanceVnStoryFromSource(
        {
          ...activeStory,
          state: {
            ...activeStory.state,
            runtimeWait: { kind: "pause", commandId: "wait", commandIndex: 0, mode: "timer", durationMs: 5000 }
          }
        },
        "manual"
      )
    ).toBe(false);
    expect(
      canCompleteVnPauseRuntimeWaitFromSource(
        { kind: "pause", commandId: "wait", commandIndex: 0, mode: "timer-or-confirm", durationMs: 5000 },
        "manual"
      )
    ).toBe(true);
  });
});

function manifestWithAssets(runtimeAssets: RuntimeAsset[]): ContentManifest {
  return {
    version: 3 as const,
    assets: [],
    fonts: [],
    runtimeAssets,
    collisionProxies: [],
    vnEntries: [],
    maps: [],
    items: [],
    evidence: [],
    trials: []
  };
}

function runtimeAsset(id: string, kind: RuntimeAssetKind, optimizedUri: string): RuntimeAsset {
  const format: RuntimeAssetFormat =
    kind === "video"
      ? "mp4"
      : kind === "glb"
        ? "gltf"
        : kind === "bgm" || kind === "sfx" || kind === "voice" || kind === "bleep"
          ? "ogg"
          : kind === "character-pack"
            ? "json"
            : "png";
  return {
    id,
    kind,
    optimizedUri,
    format,
    compression: [],
    lods: [],
    collisionProxyIds: [],
    tags: []
  };
}

function viFn<T extends (...args: any[]) => any>(implementation?: T): T & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => {
    calls.push(args);
    return implementation?.(...(args as Parameters<T>));
  };
  return Object.assign(fn as T, { calls });
}

function audioHandle(id: string, finished: Promise<AudioHandleFinishResult> = Promise.resolve({ reason: "stopped" })): AudioHandle {
  return { id, finished, stop: viFn(), fade: viFn(), fadeOutAndStop: viFn() };
}

function deferredAudioHandle(id: string) {
  let resolve: (result: AudioHandleFinishResult) => void = () => {};
  const finished = new Promise<AudioHandleFinishResult>((next) => {
    resolve = next;
  });
  return { handle: audioHandle(id, finished), resolve };
}

function compileScenario(sourceText: string, scriptPath: string): RuntimeScript {
  const parsed = parseScenario({ sourceText, scriptPath });
  const compiled = compileRuntimeScript(parsed.scenario);
  expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  return compiled.script;
}
