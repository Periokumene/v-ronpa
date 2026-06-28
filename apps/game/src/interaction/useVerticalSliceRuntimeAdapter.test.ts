import { describe, expect, it, vi } from "vitest";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import type {
  ContentManifest,
  NaniCommandCategory,
  RuntimeAsset,
  RuntimeAssetFormat,
  RuntimeAssetKind,
  RuntimeCommand,
  RuntimeScript,
  RuntimeValue
} from "@v-ronpa/contracts";
import { createGameplayState } from "@v-ronpa/gameplay";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import { createInitialPixiStageSnapshot, reducePixiRuntimeCommand } from "@v-ronpa/pixi-presenter";
import { advanceToNextStop, createInitialStoryState, storyRuntimeSnapshot } from "@v-ronpa/story-engine";
import { verticalSliceScript } from "../harness/fixtures/verticalSlice";
import type { VnOutputRouteTable } from "../vnOutputRoutes";
import type { AudioHandle, AudioHandleFinishResult, AudioPort, VideoPort } from "@v-ronpa/media-save";
import {
  applyMediaRuntimeEffects,
  canCompletePauseRuntimeWaitFromSource,
  canStoryAdvanceFromSource,
  canToggleStoryAutomation,
  collectVerticalSliceRuntimeDiagnostics,
  createVoiceAutoAdvanceGateController,
  createInitialVerticalSliceDiagnostics,
  POST_VOICE_AUTO_ADVANCE_DELAY_MS,
  createVerticalSliceInteractionContext,
  createVerticalSlicePresentationTransaction,
  createVerticalSliceRuntimeRestorePlan,
  resolveDialogueVoiceAssetAvailability,
  resolvePresentationWaitAdvanceSource,
  resolveMediaSource,
  shouldAnimateStoryPlayPacing,
  syncRuntimeToastDismissalTimers,
  type MediaHandleStore,
  type StoryRuntime
} from "./useVerticalSliceRuntimeAdapter";
import { createVoiceAssetId, planDialogueLineAudio } from "./dialogueAudioRuntime";

describe("vertical slice runtime adapter helpers", () => {
  it("keeps the vertical-slice script as a Pixi command showcase without parser or compiler diagnostics", () => {
    const parsed = parseScenario({ sourceText: verticalSliceScript, scriptPath: "harness/vertical-slice.nani" });
    const compiled = compileRuntimeScript(parsed.scenario);

    expect(parsed.diagnostics).toEqual([]);
    expect(compiled.diagnostics).toEqual([]);
    const commandIds = new Set(compiled.script.commands.map((command) => command.commandId));
    for (const commandId of [
      "back",
      "char",
      "arrange",
      "hidechars",
      "slide",
      "shake",
      "flash",
      "blur",
      "bokeh",
      "glitch",
      "rain",
      "snow",
      "sun"
    ]) {
      expect(commandIds.has(commandId)).toBe(true);
    }
    expect(
      compiled.script.commands
        .filter((command) => command.commandId === "print" && String(command.params.text ?? "").includes("CHECKPOINT BLEEP"))
        .map((command) => ({ speaker: command.params.speaker, text: command.params.text }))
    ).toEqual([
      { speaker: "Mira", text: expect.stringContaining("CHECKPOINT BLEEP DEFAULT") },
      { speaker: "Felix", text: expect.stringContaining("CHECKPOINT BLEEP OVERRIDE") },
      { speaker: "Narrator", text: expect.stringContaining("CHECKPOINT BLEEP NULL") }
    ]);
  });

  it("extracts a small GameInteractionContext from vertical slice runtime state", () => {
    const runtimeScript = compileScenario("Felix: Hello.\n- Choice A", "context-test.nani");
    const storyRuntime: StoryRuntime = {
      active: true,
      state: {
        ...createInitialStoryState(runtimeScript),
        pendingChoices: [{ text: "Choice A", enabled: true }]
      }
    };

    expect(
      createVerticalSliceInteractionContext({
        flowMode: "navi",
        navi: { substate: "vn2d-overlay", inputLock: "dialog" },
        storyRuntime
      })
    ).toEqual({
      mode: "navi",
      overlayStack: [],
      naviSubstate: "vn2d-overlay",
      inputLock: "dialog",
      hasActiveStory: true,
      storyHasChoices: true,
      storyEnded: false,
      isAtStableStop: true
    });

    expect(
      createVerticalSliceInteractionContext({
        flowMode: "trial",
        navi: { substate: "walk", inputLock: "none" },
        storyRuntime: { ...storyRuntime, active: false },
        trialRuntime: {
          definition: {
            id: "trial:door-lock",
            title: "Door Lock Trial",
            initialSegmentId: "debate:door-lock",
            segments: []
          },
          active: true,
          state: {
            trialId: "trial:door-lock",
            currentSegmentId: "debate:door-lock",
            presentation: "debate3d",
            inputLock: "trial-targeting",
            keywordStates: {}
          },
          lastOutcome: "segment:debate:door-lock"
        }
      })
    ).toEqual({
      mode: "trial",
      overlayStack: [],
      naviSubstate: "walk",
      trialPresentation: "debate3d",
      inputLock: "trial-targeting",
      hasActiveStory: false,
      storyHasChoices: false,
      storyEnded: false,
      isAtStableStop: false
    });
  });

  it("passes vertical-slice route options into the unified Story/Pixi transaction", () => {
    const runtimeScript = compileScenario(
      [
        "@back bg:harness effect:fade",
        "@char Ema.Pensive1,ArmR3 pos:50",
        "@gameplay grant-evidence id:evidence:keycard",
        "Felix: Routed."
      ].join("\n"),
      "route-options-test.nani"
    );
    const routeTable: VnOutputRouteTable = {
      commands: {
        print: ["debug"],
        back: ["debug"],
        char: ["debug"],
        gameplay: ["debug"]
      },
      categories: {}
    };
    const initialStory = createInitialStoryState(runtimeScript);
    const advanced = advanceToNextStop(initialStory, runtimeScript);
    const previousPixiStage = createInitialPixiStageSnapshot();

    const transaction = createVerticalSlicePresentationTransaction({
      runtimeCommands: advanced.emittedRuntimeCommands,
      previousPixiStage,
      options: { profile: "vn3d", routeTable }
    });

    expect(transaction.pixiStage).toBe(previousPixiStage);
    expect(transaction.pixiHints).toEqual([]);
    expect(transaction.gameplayEvents).toEqual([]);
  });

  it("normalizes parser and compiler diagnostics for the harness readout", () => {
    const parsed = parseScenario({
      sourceText: ["#Start", "#Start", "@missingCommand value:true"].join("\n"),
      scriptPath: "diagnostics.nani"
    });
    const compiled = compileRuntimeScript(parsed.scenario);

    expect(createInitialVerticalSliceDiagnostics(parsed.diagnostics, compiled.diagnostics)).toEqual([
      expect.objectContaining({
        source: "parser",
        code: "parser-diagnostic",
        severity: "error",
        message: "Duplicate label: Start",
        loc: "diagnostics.nani:2:1"
      }),
      expect.objectContaining({
        source: "compiler",
        code: "unknown-command",
        severity: "error"
      })
    ]);
  });

  it("collects StoryEngine and transaction diagnostics into the runtime channel", () => {
    const runtimeScript = compileScenario("@flash color:#ffffff duration:{missingDuration}", "runtime-diagnostics.nani");
    const unresolvedCommand = runtimeScript.commands[0];
    expect(unresolvedCommand).toBeDefined();
    const advanced = advanceToNextStop(createInitialStoryState(runtimeScript), runtimeScript);
    const transaction = createVerticalSlicePresentationTransaction({
      runtimeCommands: unresolvedCommand ? [unresolvedCommand] : [],
      previousPixiStage: createInitialPixiStageSnapshot()
    });

    expect(
      collectVerticalSliceRuntimeDiagnostics({
        storyDiagnostics: advanced.diagnostics,
        transactionDiagnostics: transaction.diagnostics
      })
    ).toEqual([
      expect.objectContaining({
        source: "story",
        code: "expression-unresolved",
        severity: "error"
      }),
      expect.objectContaining({
        source: "transaction",
        code: "unresolved-runtime-expression",
        severity: "error",
        commandId: "flash"
      })
    ]);
  });

  it("keeps toast dismissal timers independent from toastLayer visibility", () => {
    const timeouts: Record<string, number> = {};
    const scheduled: Array<{ callback: () => void; durationMs: number }> = [];
    const dismissed: string[] = [];

    syncRuntimeToastDismissalTimers({
      state: {
        visible: { dialog: true, commandBar: true, toastLayer: false },
        toasts: [{ id: "toast:1", text: "Hidden toast", durationMs: 100 }]
      },
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

  it("plans restore of Navi, Story, and Gameplay without carrying transient UI state", () => {
    const runtimeScript = compileScenario("Felix: Restore me.", "restore-test.nani");
    const story = {
      ...createInitialStoryState(runtimeScript),
      instructionPointer: 1,
      backlog: [{ speaker: "Felix", text: "Restore me." }]
    };
    const gameplay = {
      ...createGameplayState(),
      inventory: { items: { "tool:notebook": 1 } },
      evidence: { ownedEvidenceIds: ["evidence:keycard"], submittedEvidenceIds: [] }
    };
    const pixiStage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1,ArmR3",
        pos: [0.5, 0]
      })
    ).snapshot;
    const save = {
      version: 2 as const,
      savedAt: "2026-06-20T00:00:00.000Z",
      mode: "navi" as const,
      navi: {
        substate: "vn2d-overlay" as const,
        activeMapId: "map:academy-hall",
        inputLock: "dialog" as const,
        playerPose: { position: [0, 1.7, 4] as [number, number, number], yaw: 0, pitch: 0 }
      },
      story: storyRuntimeSnapshot(story),
      pixiStage,
      inventory: gameplay.inventory,
      evidence: gameplay.evidence,
      characters: gameplay.characters
    };

    const plan = createVerticalSliceRuntimeRestorePlan(save, runtimeScript);

    expect(plan.navi).toEqual(save.navi);
    expect(plan.playerPose).toEqual(save.navi.playerPose);
    expect(plan.gameplay).toEqual({
      inventory: gameplay.inventory,
      evidence: gameplay.evidence,
      characters: gameplay.characters
    });
    expect(plan.storyRuntime.active).toBe(true);
    expect(plan.storyRuntime.state).toMatchObject({
      instructionPointer: 1,
      backlog: [{ speaker: "Felix", text: "Restore me." }]
    });
    expect(plan.storyRuntime.state).not.toHaveProperty("presentationCommands");
    expect(plan.storyRuntime.state).not.toHaveProperty("effects");
    expect(plan.storyPlay).toEqual({ mode: "manual" });
    expect(plan.trialRuntime.active).toBe(false);
    expect(plan.pixiStageRuntime).toEqual({
      snapshot: pixiStage,
      hints: [],
      hintSequence: 0,
      animate: false,
      presentationTasks: []
    });
  });

  it("restores saved Trial runtime state when a save was captured in trial mode", () => {
    const runtimeScript = compileScenario("Felix: Restore trial.", "restore-trial-test.nani");
    const save = {
      version: 2 as const,
      savedAt: "2026-06-20T00:00:00.000Z",
      mode: "trial" as const,
      story: storyRuntimeSnapshot(createInitialStoryState(runtimeScript)),
      pixiStage: createInitialPixiStageSnapshot(),
      inventory: { items: {} },
      evidence: { ownedEvidenceIds: ["evidence:keycard"], submittedEvidenceIds: [] },
      characters: {},
      trial: {
        trialId: "trial:door-lock",
        currentSegmentId: "debate:door-lock",
        presentation: "debate3d" as const,
        inputLock: "trial-targeting" as const,
        selectedEvidenceId: "evidence:keycard",
        keywordStates: { "kw:door-lock": "broken" as const }
      }
    };

    const plan = createVerticalSliceRuntimeRestorePlan(save, runtimeScript);

    expect(plan.trialRuntime).toMatchObject({
      active: true,
      state: {
        currentSegmentId: "debate:door-lock",
        presentation: "debate3d",
        keywordStates: { "kw:door-lock": "broken" }
      }
    });
    expect(plan.storyRuntime.active).toBe(false);
  });

  it("resolves media sources through the asset registry and rejects raw URI fallback", () => {
    const assetResolver = createAssetRegistry(manifestWithAssets([
      runtimeAsset("bgm:main", "bgm", "/runtime-main.ogg"),
      runtimeAsset("sfx:door", "sfx", "/door.ogg")
    ]));

    expect(resolveMediaSource({ sourceRef: "bgm:main", kind: "bgm", assetResolver })).toEqual({
      uri: "/runtime-main.ogg"
    });
    expect(resolveMediaSource({ sourceRef: "/raw/sfx.ogg", kind: "sfx", assetResolver }).diagnostic).toMatchObject({
      source: "asset",
      code: "raw-uri-disallowed"
    });
  });

  it("emits adapter diagnostics for unresolved media and does not call AudioPort", async () => {
    const playBgm = viFn(() => audioHandle("unused"));
    const playSfx = viFn(() => audioHandle("unused"));
    const playVoice = viFn(() => audioHandle("unused"));
    const audioPort: AudioPort = {
      playBgm,
      playSfx,
      playDialogueBleep: viFn(() => audioHandle("unused")),
      playVoice,
      stopAll: viFn()
    };
    const result = await applyMediaRuntimeEffects({
      audioPort,
      handles: { bgm: {}, sfx: {}, oneShotSequence: 0 },
      effects: [{ type: "play-bgm", key: "music", group: "music", sourceRef: "bgm:missing" }],
      resolver: ({ sourceRef, kind }) => resolveMediaSource({ sourceRef, kind, assetResolver: createAssetRegistry(manifestWithAssets([])) })
    });

    expect(playBgm.calls).toEqual([]);
    expect(playVoice.calls).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        source: "asset",
        code: "asset-missing",
        severity: "error",
        message: "Runtime asset 'bgm:missing' is not declared in ContentManifest.runtimeAssets. (bgm:missing bgm)"
      }
    ]);
  });

  it("applies audio effects through AudioPort handles with fade cleanup semantics", async () => {
    const bgmHandle = audioHandle("music");
    const sfxHandle = audioHandle("rain");
    const handles = { bgm: {}, sfx: {}, oneShotSequence: 0 };
    const playBgm = viFn(() => bgmHandle);
    const playSfx = viFn(() => sfxHandle);
    const playVoice = viFn(() => audioHandle("voice"));
    const audioPort: AudioPort = {
      playBgm,
      playSfx,
      playDialogueBleep: viFn(() => audioHandle("bleep")),
      playVoice,
      stopAll: viFn()
    };

    await applyMediaRuntimeEffects({
      audioPort,
      handles,
      effects: [
        { type: "play-bgm", key: "music", group: "music", sourceRef: "bgm:main", volume: 0.4 },
        { type: "play-sfx", key: "rain", group: "rain", sourceRef: "sfx:rain", loop: true, fast: false, volume: 0.3 },
        { type: "stop-bgm", key: "music", group: "music", fadeMs: 200 },
        { type: "stop-sfx", key: "rain", group: "rain" }
      ],
      resolver: ({ sourceRef }) => ({ uri: `/resolved/${sourceRef}.ogg` })
    });

    expect(playBgm.calls).toEqual([["music", "/resolved/bgm:main.ogg", { loop: true, volume: 0.4 }]]);
    expect(playSfx.calls).toEqual([["rain", "/resolved/sfx:rain.ogg", { loop: true, volume: 0.3 }]]);
    expect((bgmHandle.fadeOutAndStop as ReturnType<typeof viFn>).calls).toEqual([[200]]);
    expect((sfxHandle.stop as ReturnType<typeof viFn>).calls).toEqual([[]]);
  });

  it("applies dialogue bleep effects through a dedicated AudioPort handle", async () => {
    const previousBleep = audioHandle("dialogue-bleep:old");
    const nextBleep = audioHandle("dialogue-bleep:next");
    const playDialogueBleep = viFn(() => nextBleep);
    const handles: MediaHandleStore = {
      bgm: {},
      sfx: { rain: audioHandle("rain") },
      dialogueBleep: previousBleep,
      oneShotSequence: 0
    };
    const audioPort: AudioPort = {
      playBgm: viFn(),
      playSfx: viFn(),
      playDialogueBleep,
      playVoice: viFn(() => audioHandle("voice")),
      stopAll: viFn()
    };

    const result = await applyMediaRuntimeEffects({
      audioPort,
      handles,
      effects: [
        {
          type: "play-dialogue-bleep",
          key: "dialogue-bleep:line-1",
          sourceRef: "bleep:dialogue-default",
          volume: 0.25
        },
        { type: "stop-dialogue-bleep", key: "dialogue-bleep:line-1" }
      ],
      resolver: ({ sourceRef, kind }) => {
        expect(kind).toBe("bleep");
        return { uri: `/resolved/${sourceRef}.ogg` };
      }
    });

    expect(result).toEqual({ diagnostics: [] });
    expect((previousBleep.stop as ReturnType<typeof viFn>).calls).toEqual([[]]);
    expect(playDialogueBleep.calls).toEqual([
      ["dialogue-bleep:line-1", "/resolved/bleep:dialogue-default.ogg", { volume: 0.25 }]
    ]);
    expect((nextBleep.stop as ReturnType<typeof viFn>).calls).toEqual([[]]);
    expect(handles.dialogueBleep).toBeUndefined();
    expect(handles.sfx.rain).toBeDefined();
  });

  it("reports missing dialogue bleep assets as non-blocking warnings", async () => {
    const previousBleep = audioHandle("dialogue-bleep:old");
    const playDialogueBleep = viFn(() => audioHandle("unused"));
    const playVoice = viFn(() => audioHandle("voice"));
    const handles: MediaHandleStore = {
      bgm: {},
      sfx: {},
      dialogueBleep: previousBleep,
      oneShotSequence: 0
    };
    const audioPort: AudioPort = {
      playBgm: viFn(),
      playSfx: viFn(),
      playDialogueBleep,
      playVoice,
      stopAll: viFn()
    };

    const result = await applyMediaRuntimeEffects({
      audioPort,
      handles,
      effects: [
        {
          type: "play-dialogue-bleep",
          key: "dialogue-bleep:line-1",
          sourceRef: "bleep:missing"
        }
      ],
      resolver: ({ sourceRef, kind }) =>
        resolveMediaSource({ sourceRef, kind, assetResolver: createAssetRegistry(manifestWithAssets([])) })
    });

    expect((previousBleep.stop as ReturnType<typeof viFn>).calls).toEqual([[]]);
    expect(playDialogueBleep.calls).toEqual([]);
    expect(playVoice.calls).toEqual([]);
    expect(handles.dialogueBleep).toBeUndefined();
    expect(result.voiceHandle).toBeUndefined();
    expect(result.diagnostics).toEqual([
      {
        source: "asset",
        code: "asset-missing",
        severity: "warning",
        message: "Runtime asset 'bleep:missing' is not declared in ContentManifest.runtimeAssets. (bleep:missing bleep)"
      }
    ]);
  });

  it("resolves dialogue voice availability without warning for planned but missing textId audio", () => {
    const assetResolver = createAssetRegistry(
      manifestWithAssets([
        runtimeAsset("voice:zh:voice_validation_0001", "voice", "/voice/voice_validation_0001.ogg"),
        runtimeAsset("voice:zh:kind_mismatch", "sfx", "/voice/kind_mismatch.ogg")
      ])
    );

    expect(createVoiceAssetId("voice_validation_0001", "zh")).toBe("voice:zh:voice_validation_0001");
    expect(
      resolveDialogueVoiceAssetAvailability({
        assetResolver,
        textId: "voice_validation_0001",
        voiceSettings: { locale: "zh", volume: 0.25 }
      })
    ).toEqual({
      available: true,
      diagnostics: [],
      sourceRef: "voice:zh:voice_validation_0001"
    });
    expect(
      resolveDialogueVoiceAssetAvailability({
        assetResolver,
        textId: "planned_future_voice",
        voiceSettings: { locale: "zh", volume: 0.25 }
      })
    ).toEqual({
      available: false,
      diagnostics: [],
      sourceRef: "voice:zh:planned_future_voice"
    });
    expect(
      resolveDialogueVoiceAssetAvailability({
        textId: "no_resolver",
        voiceSettings: { locale: "zh", volume: 0.25 }
      })
    ).toEqual({
      available: false,
      diagnostics: [],
      sourceRef: "voice:zh:no_resolver"
    });
    expect(
      resolveDialogueVoiceAssetAvailability({
        assetResolver,
        textId: "kind_mismatch",
        voiceSettings: { locale: "zh", volume: 0.25 }
      })
    ).toEqual({
      available: false,
      diagnostics: [
        {
          source: "asset",
          code: "asset-kind-mismatch",
          severity: "warning",
          message: "Runtime asset 'voice:zh:kind_mismatch' is 'sfx', not 'voice'. (voice:zh:kind_mismatch voice)"
        }
      ],
      sourceRef: "voice:zh:kind_mismatch"
    });
  });

  it("uses valid dialogue voice availability to suppress bleep and return a gateable voice handle", async () => {
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
    const availability = resolveDialogueVoiceAssetAvailability({
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

    const result = await applyMediaRuntimeEffects({
      audioPort,
      handles: { bgm: {}, sfx: {}, oneShotSequence: 0 },
      effects: planned.effects,
      resolver: ({ sourceRef, kind }) => resolveMediaSource({ sourceRef, kind, assetResolver })
    });

    expect(availability.diagnostics).toEqual([]);
    expect(planned.hasVoiceBoundary).toBe(true);
    expect(planned.effects.some((effect) => effect.type === "play-dialogue-bleep")).toBe(false);
    expect(playDialogueBleep.calls).toEqual([]);
    expect(playVoice.calls).toEqual([
      ["voice:zh:voice_validation_0001", "/voice/voice_validation_0001.ogg", { volume: 0.25 }]
    ]);
    expect(result).toEqual({ diagnostics: [], voiceHandle });
  });

  it("falls back to bleep without a voice warning when planned textId audio is missing", async () => {
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
    const availability = resolveDialogueVoiceAssetAvailability({
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

    const result = await applyMediaRuntimeEffects({
      audioPort,
      handles: { bgm: {}, sfx: {}, oneShotSequence: 0 },
      effects: planned.effects,
      resolver: ({ sourceRef, kind }) => resolveMediaSource({ sourceRef, kind, assetResolver })
    });

    expect(availability).toEqual({
      available: false,
      diagnostics: [],
      sourceRef: "voice:zh:planned_future_voice"
    });
    expect(planned.effects).toEqual([
      { type: "stop-voice" },
      {
        type: "play-dialogue-bleep",
        key: "dialogue-bleep:line:missing",
        sourceRef: "bleep:dialogue-default",
        volume: 0.5
      }
    ]);
    expect(playVoice.calls).toEqual([]);
    expect(playDialogueBleep.calls).toEqual([
      ["dialogue-bleep:line:missing", "/bleep/default.ogg", { volume: 0.5 }]
    ]);
    expect(result).toEqual({ diagnostics: [] });
  });

  it("applies voice effects through AssetRegistry and interrupts the previous voice handle", async () => {
    const previousVoice = audioHandle("voice:old");
    const nextVoice = audioHandle("voice:zh:voice_validation_0001");
    const playVoice = viFn(() => nextVoice);
    const handles = { bgm: {}, sfx: {}, voice: previousVoice, oneShotSequence: 0 };
    const assetResolver = createAssetRegistry(manifestWithAssets([
      runtimeAsset("voice:zh:voice_validation_0001", "voice", "/voice/voice_validation_0001.ogg")
    ]));
    const audioPort: AudioPort = {
      playBgm: viFn(),
      playSfx: viFn(),
      playDialogueBleep: viFn(() => audioHandle("bleep")),
      playVoice,
      stopAll: viFn()
    };

    const result = await applyMediaRuntimeEffects({
      audioPort,
      handles,
      effects: [
        { type: "stop-voice" },
        {
          type: "play-voice",
          key: "voice:zh:voice_validation_0001",
          textId: "voice_validation_0001",
          sourceRef: "voice:zh:voice_validation_0001",
          volume: 0.42
        }
      ],
      resolver: ({ sourceRef, kind }) => resolveMediaSource({ sourceRef, kind, assetResolver })
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.voiceHandle).toBe(nextVoice);
    expect((previousVoice.stop as ReturnType<typeof viFn>).calls).toEqual([[]]);
    expect(playVoice.calls).toEqual([
      ["voice:zh:voice_validation_0001", "/voice/voice_validation_0001.ogg", { volume: 0.42 }]
    ]);
    expect(handles.voice).toBe(nextVoice);
  });

  it("reports missing voice assets without calling AudioPort", async () => {
    const previousVoice = audioHandle("voice:old");
    const playVoice = viFn(() => audioHandle("unused"));
    const handles = { bgm: {}, sfx: {}, voice: previousVoice, oneShotSequence: 0 };
    const audioPort: AudioPort = {
      playBgm: viFn(),
      playSfx: viFn(),
      playDialogueBleep: viFn(() => audioHandle("bleep")),
      playVoice,
      stopAll: viFn()
    };

    const result = await applyMediaRuntimeEffects({
      audioPort,
      handles,
      effects: [
        { type: "stop-voice" },
        {
          type: "play-voice",
          key: "voice:zh:missing_line",
          textId: "missing_line",
          sourceRef: "voice:zh:missing_line"
        }
      ],
      resolver: ({ sourceRef, kind }) => resolveMediaSource({ sourceRef, kind, assetResolver: createAssetRegistry(manifestWithAssets([])) })
    });

    expect((previousVoice.stop as ReturnType<typeof viFn>).calls).toEqual([[]]);
    expect(playVoice.calls).toEqual([]);
    expect(handles.voice).toBeUndefined();
    expect(result.voiceHandle).toBeUndefined();
    expect(result.diagnostics).toEqual([
      {
        source: "asset",
        code: "asset-missing",
        severity: "warning",
        message: "Runtime asset 'voice:zh:missing_line' is not declared in ContentManifest.runtimeAssets. (voice:zh:missing_line voice)"
      }
    ]);
  });

  it("does not return an earlier voice handle after a later voice boundary fails", async () => {
    const firstVoice = audioHandle("voice:zh:first_line");
    const playVoice = viFn(() => firstVoice);
    const handles: MediaHandleStore = { bgm: {}, sfx: {}, oneShotSequence: 0 };
    const audioPort: AudioPort = {
      playBgm: viFn(),
      playSfx: viFn(),
      playDialogueBleep: viFn(() => audioHandle("bleep")),
      playVoice,
      stopAll: viFn()
    };
    const assetResolver = createAssetRegistry(
      manifestWithAssets([runtimeAsset("voice:zh:first_line", "voice", "/voice/first_line.ogg")])
    );

    const result = await applyMediaRuntimeEffects({
      audioPort,
      handles,
      effects: [
        {
          type: "play-voice",
          key: "voice:zh:first_line",
          textId: "first_line",
          sourceRef: "voice:zh:first_line"
        },
        { type: "stop-voice" },
        {
          type: "play-voice",
          key: "voice:zh:missing_line",
          textId: "missing_line",
          sourceRef: "voice:zh:missing_line"
        }
      ],
      resolver: ({ sourceRef, kind }) => resolveMediaSource({ sourceRef, kind, assetResolver })
    });

    expect(playVoice.calls).toEqual([["voice:zh:first_line", "/voice/first_line.ogg", {}]]);
    expect((firstVoice.stop as ReturnType<typeof viFn>).calls).toEqual([[]]);
    expect(handles.voice).toBeUndefined();
    expect(result.voiceHandle).toBeUndefined();
    expect(result.diagnostics).toEqual([
      {
        source: "asset",
        code: "asset-missing",
        severity: "warning",
        message: "Runtime asset 'voice:zh:missing_line' is not declared in ContentManifest.runtimeAssets. (voice:zh:missing_line voice)"
      }
    ]);
  });

  it("reports voice playback failures without returning a gateable handle", async () => {
    const handles: MediaHandleStore = { bgm: {}, sfx: {}, oneShotSequence: 0 };
    const audioPort: AudioPort = {
      playBgm: viFn(),
      playSfx: viFn(),
      playDialogueBleep: viFn(() => audioHandle("bleep")),
      playVoice: viFn(() => {
        throw new Error("voice channel unavailable");
      }),
      stopAll: viFn()
    };

    const result = await applyMediaRuntimeEffects({
      audioPort,
      handles,
      effects: [
        {
          type: "play-voice",
          key: "voice:zh:voice_validation_0001",
          textId: "voice_validation_0001",
          sourceRef: "voice:zh:voice_validation_0001"
        }
      ],
      resolver: () => ({ uri: "/voice/voice_validation_0001.ogg" })
    });

    expect(handles.voice).toBeUndefined();
    expect(result.voiceHandle).toBeUndefined();
    expect(result.diagnostics).toEqual([
      {
        source: "media",
        code: "media-port-error",
        severity: "warning",
        message: "voice channel unavailable"
      }
    ]);
  });

  it("waits for voice end and post-voice delay before releasing pending AUTO advance", async () => {
    vi.useFakeTimers();
    try {
      const advances: string[] = [];
      const { handle, resolve } = deferredAudioHandle("voice:zh:line");
      const controller = createVoiceAutoAdvanceGateController({
        advance: (source) => advances.push(source),
        clearTimeoutFn: clearTimeout,
        setTimeoutFn: setTimeout,
        stopVoice: viFn()
      });

      controller.install(handle);
      expect(controller.request("auto")).toBe(false);

      resolve({ reason: "ended" });
      await Promise.resolve();
      vi.advanceTimersByTime(POST_VOICE_AUTO_ADVANCE_DELAY_MS - 1);
      expect(advances).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(advances).toEqual(["auto"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not advance from voice end before the text minimum timer asks for AUTO", async () => {
    vi.useFakeTimers();
    try {
      const advances: string[] = [];
      const { handle, resolve } = deferredAudioHandle("voice:zh:line");
      const controller = createVoiceAutoAdvanceGateController({
        advance: (source) => advances.push(source),
        clearTimeoutFn: clearTimeout,
        setTimeoutFn: setTimeout,
        stopVoice: viFn()
      });

      controller.install(handle);
      resolve({ reason: "ended" });
      await Promise.resolve();
      vi.advanceTimersByTime(POST_VOICE_AUTO_ADVANCE_DELAY_MS);

      expect(advances).toEqual([]);
      expect(controller.request("auto-next")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not release pending AUTO from stopped or cleared voice handles", async () => {
    vi.useFakeTimers();
    try {
      const advances: string[] = [];
      const stopVoice = viFn();
      const stopped = deferredAudioHandle("voice:zh:stopped");
      const cleared = deferredAudioHandle("voice:zh:cleared");
      const controller = createVoiceAutoAdvanceGateController({
        advance: (source) => advances.push(source),
        clearTimeoutFn: clearTimeout,
        setTimeoutFn: setTimeout,
        stopVoice
      });

      controller.install(stopped.handle);
      expect(controller.request("auto")).toBe(false);
      stopped.resolve({ reason: "stopped" });
      await Promise.resolve();
      vi.advanceTimersByTime(POST_VOICE_AUTO_ADVANCE_DELAY_MS);
      expect(advances).toEqual([]);

      controller.install(cleared.handle);
      expect(controller.request("skip")).toBe(true);
      expect(stopVoice.calls).toEqual([[]]);
      cleared.resolve({ reason: "ended" });
      await Promise.resolve();
      vi.advanceTimersByTime(POST_VOICE_AUTO_ADVANCE_DELAY_MS);
      expect(advances).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("releases pending AUTO immediately when voice playback fails", async () => {
    vi.useFakeTimers();
    try {
      const advances: string[] = [];
      const { handle, resolve } = deferredAudioHandle("voice:zh:failed");
      const controller = createVoiceAutoAdvanceGateController({
        advance: (source) => advances.push(source),
        clearTimeoutFn: clearTimeout,
        setTimeoutFn: setTimeout,
        stopVoice: viFn()
      });

      controller.install(handle);
      expect(controller.request("auto")).toBe(false);

      resolve({ reason: "failed" });
      await Promise.resolve();

      expect(advances).toEqual(["auto"]);
      vi.advanceTimersByTime(POST_VOICE_AUTO_ADVANCE_DELAY_MS);
      expect(advances).toEqual(["auto"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not install a stale wait when voice playback fails before AUTO asks to advance", async () => {
    vi.useFakeTimers();
    try {
      const advances: string[] = [];
      const { handle, resolve } = deferredAudioHandle("voice:zh:failed-before-auto");
      const controller = createVoiceAutoAdvanceGateController({
        advance: (source) => advances.push(source),
        clearTimeoutFn: clearTimeout,
        setTimeoutFn: setTimeout,
        stopVoice: viFn()
      });

      controller.install(handle);
      resolve({ reason: "failed" });
      await Promise.resolve();

      expect(advances).toEqual([]);
      expect(controller.request("auto-next")).toBe(true);
      vi.advanceTimersByTime(POST_VOICE_AUTO_ADVANCE_DELAY_MS);
      expect(advances).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not release pending AUTO from stopped handles after failed handles clear their own gate", async () => {
    vi.useFakeTimers();
    try {
      const advances: string[] = [];
      const failed = deferredAudioHandle("voice:zh:failed");
      const stopped = deferredAudioHandle("voice:zh:stopped-after-failed");
      const controller = createVoiceAutoAdvanceGateController({
        advance: (source) => advances.push(source),
        clearTimeoutFn: clearTimeout,
        setTimeoutFn: setTimeout,
        stopVoice: viFn()
      });

      controller.install(failed.handle);
      expect(controller.request("auto")).toBe(false);
      failed.resolve({ reason: "failed" });
      await Promise.resolve();
      expect(advances).toEqual(["auto"]);

      controller.install(stopped.handle);
      expect(controller.request("auto")).toBe(false);
      stopped.resolve({ reason: "stopped" });
      await Promise.resolve();
      vi.advanceTimersByTime(POST_VOICE_AUTO_ADVANCE_DELAY_MS);

      expect(advances).toEqual(["auto"]);
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
    const result = await applyMediaRuntimeEffects({
      videoPort,
      handles: { bgm: {}, sfx: {}, oneShotSequence: 0 },
      effects: [{ type: "play-movie", sourceRef: "video:intro", block: true }],
      resolver: () => ({ uri: "/resolved/intro.mp4" })
    });

    expect(result.diagnostics).toEqual([]);
    expect(play.calls).toEqual([["/resolved/intro.mp4"]]);
  });

  it("clears transient runtimeWait during restore with a diagnostic", () => {
    const runtimeScript = compileScenario("Felix: Restore wait.", "restore-runtime-wait-test.nani");
    const save = {
      version: 2 as const,
      savedAt: "2026-06-20T00:00:00.000Z",
      mode: "navi" as const,
      story: {
        ...storyRuntimeSnapshot(createInitialStoryState(runtimeScript)),
        runtimeWait: { kind: "pause" as const, commandId: "wait" as const, commandIndex: 0, mode: "confirm" as const }
      },
      pixiStage: createInitialPixiStageSnapshot(),
      inventory: { items: {} },
      evidence: { ownedEvidenceIds: [], submittedEvidenceIds: [] },
      characters: {}
    };

    const plan = createVerticalSliceRuntimeRestorePlan(save, runtimeScript);

    expect(plan.storyRuntime.state.runtimeWait).toBeUndefined();
    expect(plan.diagnostics).toEqual([
      {
        source: "story",
        code: "runtime-wait-cleared-on-load",
        severity: "warning",
        message: "Saved runtimeWait was cleared during restore because runtime waits are transient app state."
      }
    ]);
  });

  it("keeps story automation availability and presentation pacing as adapter decisions", () => {
    const runtimeScript = compileScenario("Felix: Adapter.", "adapter-playback-test.nani");
    const storyRuntime: StoryRuntime = {
      active: true,
      state: createInitialStoryState(runtimeScript)
    };

    expect(canToggleStoryAutomation(storyRuntime)).toBe(true);
    expect(
      canToggleStoryAutomation({
        ...storyRuntime,
        state: { ...storyRuntime.state, pendingChoices: [{ text: "Choice", enabled: true }] }
      })
    ).toBe(false);
    expect(
      canToggleStoryAutomation({
        ...storyRuntime,
        state: { ...storyRuntime.state, runtimeWait: { kind: "pause", commandId: "wait", commandIndex: 0, mode: "confirm" } }
      })
    ).toBe(false);
    expect(shouldAnimateStoryPlayPacing("normal")).toBe(true);
    expect(shouldAnimateStoryPlayPacing("skip")).toBe(false);
    expect(resolvePresentationWaitAdvanceSource("system", { mode: "manual" })).toBe("system");
    expect(resolvePresentationWaitAdvanceSource("system", { mode: "skip" })).toBe("skip");
    expect(resolvePresentationWaitAdvanceSource("manual", { mode: "skip" })).toBe("manual");
  });

  it("allows manual completion only for confirm-capable pause waits", () => {
    expect(
      canCompletePauseRuntimeWaitFromSource(
        { kind: "pause", commandId: "wait", commandIndex: 0, mode: "confirm" },
        "manual"
      )
    ).toBe(true);
    expect(
      canCompletePauseRuntimeWaitFromSource(
        { kind: "pause", commandId: "wait", commandIndex: 0, mode: "timer-or-confirm", durationMs: 5000 },
        "manual"
      )
    ).toBe(true);
    expect(
      canCompletePauseRuntimeWaitFromSource(
        { kind: "pause", commandId: "wait", commandIndex: 0, mode: "timer", durationMs: 5000 },
        "manual"
      )
    ).toBe(false);
    expect(
      canCompletePauseRuntimeWaitFromSource(
        { kind: "pause", commandId: "wait", commandIndex: 0, mode: "timer", durationMs: 5000 },
        "system"
      )
    ).toBe(true);
  });

  it("only treats user advance as story-mutating when the current wait can actually complete", () => {
    const runtimeScript = compileScenario("Felix: Adapter.", "adapter-advance-test.nani");
    const activeStory: StoryRuntime = {
      active: true,
      state: createInitialStoryState(runtimeScript)
    };

    expect(canStoryAdvanceFromSource(activeStory, "manual")).toBe(true);
    expect(canStoryAdvanceFromSource(activeStory, "skip")).toBe(true);
    expect(
      canStoryAdvanceFromSource(
        {
          ...activeStory,
          state: {
            ...activeStory.state,
            pendingChoices: [{ text: "Choice", enabled: true }]
          }
        },
        "manual"
      )
    ).toBe(false);
    expect(
      canStoryAdvanceFromSource(
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
      canStoryAdvanceFromSource(
        {
          ...activeStory,
          state: {
            ...activeStory.state,
            runtimeWait: { kind: "input", commandId: "input", commandIndex: 0, variableName: "answer", valueType: "string" }
          }
        },
        "manual"
      )
    ).toBe(false);
    expect(
      canStoryAdvanceFromSource(
        {
          ...activeStory,
          state: {
            ...activeStory.state,
            runtimeWait: { kind: "pause", commandId: "wait", commandIndex: 0, mode: "timer-or-confirm", durationMs: 5000 }
          }
        },
        "manual"
      )
    ).toBe(true);
  });
});

function manifestWithAssets(runtimeAssets: RuntimeAsset[]): ContentManifest {
  return {
    version: 2 as const,
    assets: [],
    runtimeAssets,
    uiAssets: [],
    interactionStyles: [],
    collisionProxies: [],
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

function runtimeCommand(commandId: string, category: NaniCommandCategory, params: Record<string, RuntimeValue>): RuntimeCommand {
  return {
    commandId,
    canonicalName: commandId,
    category,
    source: "v-ronpa",
    status: "implemented",
    params,
    loc: { scriptPath: "runtime-adapter-test.nani", line: 1, column: 1, raw: `@${commandId}` }
  };
}
