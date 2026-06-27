import { describe, expect, it } from "vitest";
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
import type { AudioHandle, AudioPort, VideoPort } from "@v-ronpa/media-save";
import {
  applyMediaRuntimeEffects,
  canCompletePauseRuntimeWaitFromSource,
  canToggleStoryAutomation,
  collectVerticalSliceRuntimeDiagnostics,
  createInitialVerticalSliceDiagnostics,
  createVoiceAssetId,
  createVerticalSliceInteractionContext,
  createVerticalSlicePresentationTransaction,
  createVerticalSliceRuntimeRestorePlan,
  deriveVoiceMediaEffects,
  resolveMediaSource,
  shouldAnimateStoryPlayPacing,
  syncRuntimeToastDismissalTimers,
  type StoryRuntime
} from "./useVerticalSliceRuntimeAdapter";

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
        "@char character:felix.portrait:felix:neutral pos:50,0",
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
        target: "character:felix",
        appearance: "portrait:felix:neutral",
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
    const playBgm = viFn(() => ({ id: "unused", stop: viFn(), fade: viFn(), fadeOutAndStop: viFn() }));
    const playSfx = viFn(() => ({ id: "unused", stop: viFn(), fade: viFn(), fadeOutAndStop: viFn() }));
    const playVoice = viFn(() => ({ id: "unused", stop: viFn(), fade: viFn(), fadeOutAndStop: viFn() }));
    const audioPort: AudioPort = {
      playBgm,
      playSfx,
      playVoice,
      stopAll: viFn()
    };
    const diagnostics = await applyMediaRuntimeEffects({
      audioPort,
      handles: { bgm: {}, sfx: {}, oneShotSequence: 0 },
      effects: [{ type: "play-bgm", key: "music", group: "music", sourceRef: "bgm:missing" }],
      resolver: ({ sourceRef, kind }) => resolveMediaSource({ sourceRef, kind, assetResolver: createAssetRegistry(manifestWithAssets([])) })
    });

    expect(playBgm.calls).toEqual([]);
    expect(playVoice.calls).toEqual([]);
    expect(diagnostics).toEqual([
      {
        source: "asset",
        code: "asset-missing",
        severity: "error",
        message: "Runtime asset 'bgm:missing' is not declared in ContentManifest.runtimeAssets. (bgm:missing bgm)"
      }
    ]);
  });

  it("applies audio effects through AudioPort handles with fade cleanup semantics", async () => {
    const bgmHandle: AudioHandle = { id: "music", stop: viFn(), fade: viFn(), fadeOutAndStop: viFn() };
    const sfxHandle: AudioHandle = { id: "rain", stop: viFn(), fade: viFn(), fadeOutAndStop: viFn() };
    const handles = { bgm: {}, sfx: {}, oneShotSequence: 0 };
    const playBgm = viFn(() => bgmHandle);
    const playSfx = viFn(() => sfxHandle);
    const playVoice = viFn(() => ({ id: "voice", stop: viFn(), fade: viFn(), fadeOutAndStop: viFn() }));
    const audioPort: AudioPort = {
      playBgm,
      playSfx,
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

  it("derives voice effects from print textId only for non-skip pacing", () => {
    const commands = [
      runtimeCommand("print", "text", { text: "Voiced.", textId: "voice_validation_0001" }),
      runtimeCommand("print", "text", { text: "Unvoiced." })
    ];

    expect(createVoiceAssetId("voice_validation_0001", "zh")).toBe("voice:zh:voice_validation_0001");
    expect(deriveVoiceMediaEffects(commands, { locale: "zh", volume: 0.25 }, "normal")).toEqual([
      {
        type: "play-voice",
        key: "voice:zh:voice_validation_0001",
        textId: "voice_validation_0001",
        sourceRef: "voice:zh:voice_validation_0001",
        volume: 0.25
      }
    ]);
    expect(deriveVoiceMediaEffects(commands, { locale: "zh", volume: 0.25 }, "skip")).toEqual([]);
  });

  it("applies voice effects through AssetRegistry and interrupts the previous voice handle", async () => {
    const previousVoice: AudioHandle = { id: "voice:old", stop: viFn(), fade: viFn(), fadeOutAndStop: viFn() };
    const nextVoice: AudioHandle = { id: "voice:zh:voice_validation_0001", stop: viFn(), fade: viFn(), fadeOutAndStop: viFn() };
    const playVoice = viFn(() => nextVoice);
    const handles = { bgm: {}, sfx: {}, voice: previousVoice, oneShotSequence: 0 };
    const assetResolver = createAssetRegistry(manifestWithAssets([
      runtimeAsset("voice:zh:voice_validation_0001", "voice", "/voice/voice_validation_0001.ogg")
    ]));
    const audioPort: AudioPort = {
      playBgm: viFn(),
      playSfx: viFn(),
      playVoice,
      stopAll: viFn()
    };

    const diagnostics = await applyMediaRuntimeEffects({
      audioPort,
      handles,
      effects: [
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

    expect(diagnostics).toEqual([]);
    expect((previousVoice.stop as ReturnType<typeof viFn>).calls).toEqual([[]]);
    expect(playVoice.calls).toEqual([
      ["voice:zh:voice_validation_0001", "/voice/voice_validation_0001.ogg", { volume: 0.42 }]
    ]);
    expect(handles.voice).toBe(nextVoice);
  });

  it("reports missing voice assets without calling AudioPort", async () => {
    const previousVoice: AudioHandle = { id: "voice:old", stop: viFn(), fade: viFn(), fadeOutAndStop: viFn() };
    const playVoice = viFn(() => ({ id: "unused", stop: viFn(), fade: viFn(), fadeOutAndStop: viFn() }));
    const handles = { bgm: {}, sfx: {}, voice: previousVoice, oneShotSequence: 0 };
    const audioPort: AudioPort = {
      playBgm: viFn(),
      playSfx: viFn(),
      playVoice,
      stopAll: viFn()
    };

    const diagnostics = await applyMediaRuntimeEffects({
      audioPort,
      handles,
      effects: [
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
    expect(diagnostics).toEqual([
      {
        source: "asset",
        code: "asset-missing",
        severity: "warning",
        message: "Runtime asset 'voice:zh:missing_line' is not declared in ContentManifest.runtimeAssets. (voice:zh:missing_line voice)"
      }
    ]);
  });

  it("can apply movie effects through an attached VideoPort when used directly", async () => {
    const play = viFn(async () => undefined);
    const videoPort: VideoPort = {
      attach: viFn(),
      play,
      stop: viFn()
    };
    const diagnostics = await applyMediaRuntimeEffects({
      videoPort,
      handles: { bgm: {}, sfx: {}, oneShotSequence: 0 },
      effects: [{ type: "play-movie", sourceRef: "video:intro", block: true }],
      resolver: () => ({ uri: "/resolved/intro.mp4" })
    });

    expect(diagnostics).toEqual([]);
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
  const format: RuntimeAssetFormat = kind === "video" ? "mp4" : kind === "glb" ? "gltf" : kind === "bgm" || kind === "sfx" || kind === "voice" ? "ogg" : "png";
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
