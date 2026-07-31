import { describe, expect, it } from "vitest";
import {
  createSaveableStorySnapshot,
  type NaniCommandCategory,
  type PixiStageSnapshot,
  type RuntimeCommand,
  type RuntimeScript,
  type RuntimeValue,
  type SaveableVnState,
  type StoryRuntimeSnapshot
} from "@v-ronpa/contracts";
import { createGameplayState } from "@v-ronpa/gameplay";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import { createInitialPixiStageSnapshot, reducePixiRuntimeCommand } from "@v-ronpa/pixi-stage-model";
import { createInitialStoryState } from "@v-ronpa/story-engine";
import {
  HARNESS_SHOWCASE_DB,
  createHarnessShowcaseSaveData,
  harnessShowcaseManualSaveSlotCount,
  harnessShowcaseQuickSaveSlotId,
  harnessShowcaseSaveSlotPolicy,
  harnessShowcaseSaveSlotIds,
  selectHarnessShowcaseManualSaveSlotSummaries,
  selectHarnessShowcaseQuickSaveSlotSummary
} from "./useHarnessShowcaseSaveAdapter";

describe("harness showcase save adapter", () => {
  it("collects public runtime state into versioned SaveData without UI state", () => {
    const runtimeScript = compileScenario("Felix: Save me.", "save-test.nani");
    const story = {
      ...createInitialStoryState(runtimeScript),
      instructionPointer: 1,
      backlog: [{ speaker: "Felix", text: "Save me." }]
    };
    const gameplay = {
      ...createGameplayState(),
      inventory: { items: { "gift:coffee": 1 } },
      evidence: { ownedEvidenceIds: ["evidence:keycard"], submittedEvidenceIds: [] }
    };
    const stageWithBackground = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { appearance: "bg:harness" })
    ).snapshot;
    const pixiStage: PixiStageSnapshot = {
      ...stageWithBackground,
      characterTone: {
        preset: "rain",
        amount: 1,
        scopeScriptPath: "harness/showcase.nani",
        transition: { durationMs: 400, wait: false }
      }
    };

    const save = createHarnessShowcaseSaveData({
      savedAt: "2026-06-20T00:00:00.000Z",
      navi: { substate: "vn2d-overlay", activeMapId: "map:academy-hall", inputLock: "dialog" },
      vn: createVnCheckpoint(story, pixiStage),
      gameplay
    });

    expect(save).toMatchObject({
      version: 9,
      gameId: "game-harness",
      mode: "navi",
      vn: {
        media: {
          bgmByGroup: { music: { sourceRef: "bgm:main", volume: 0.4 } },
          loopingSfxByKey: { rain: { sourceRef: "sfx:rain", volume: 0.3, group: "rain" } }
        },
        pixiStage: {
          version: 5,
          revision: 1,
          backgroundsById: {
            MainBackground: { appearance: "bg:harness" }
          },
          characterTone: {
            preset: "rain",
            amount: 1,
            scopeScriptPath: "harness/showcase.nani"
          }
        }
      },
      navi: { substate: "vn2d-overlay", activeMapId: "map:academy-hall", inputLock: "dialog" },
      trial: null,
      inventory: { items: { "gift:coffee": 1 } },
      evidence: { ownedEvidenceIds: ["evidence:keycard"] }
    });
    expect(save).not.toHaveProperty("story");
    expect(save).not.toHaveProperty("pixiStage");
    expect(save).not.toHaveProperty("overlayStack");
    expect(save).not.toHaveProperty("storyPlay");
    expect(save).not.toHaveProperty("playback");
    expect(save).not.toHaveProperty("settings");
    expect(save).not.toHaveProperty("storyTextRevealRuntime");
    expect(save.vn?.story).not.toHaveProperty("storyTextRevealRuntime");
    expect(save).not.toHaveProperty("summary");
  });

  it("can include optional Trial runtime state without adding transient UI playback", () => {
    const runtimeScript = compileScenario("Felix: Trial save.", "trial-save-test.nani");
    const gameplay = createGameplayState();
    const trial = {
      trialId: "trial:door-lock",
      currentSegmentId: "debate:door-lock",
      presentation: "debate3d" as const,
      inputLock: "trial-targeting" as const,
      selectedEvidenceId: "evidence:keycard",
      keywordStates: { "kw:door-lock": "broken" as const }
    };

    const save = createHarnessShowcaseSaveData({
      mode: "trial",
      savedAt: "2026-06-20T00:00:00.000Z",
      navi: { substate: "walk", activeMapId: "map:academy-hall", inputLock: "none" },
      vn: createVnCheckpoint(createInitialStoryState(runtimeScript)),
      gameplay,
      trial
    });

    expect(save).toMatchObject({
      mode: "trial",
      vn: {
        story: {
          instructionPointer: 0
        }
      },
      navi: { substate: "walk", activeMapId: "map:academy-hall", inputLock: "none" },
      trial: {
        trialId: "trial:door-lock",
        currentSegmentId: "debate:door-lock",
        presentation: "debate3d",
        inputLock: "trial-targeting"
      }
    });
    expect(save).not.toHaveProperty("storyPlay");
    expect(save).not.toHaveProperty("playback");
  });

  it("rejects creating a saveable story snapshot while a runtime wait is active", () => {
    const runtimeScript = compileScenario("@wait i", "runtime-wait-save-test.nani");
    const story = {
      ...createInitialStoryState(runtimeScript),
      runtimeWait: { kind: "pause" as const, commandId: "wait" as const, commandIndex: 0, mode: "confirm" as const }
    };

    expect(() => createSaveableStorySnapshot(story)).toThrow("stable stop");
  });

  it("keeps forty manual slots plus an independent hidden quick slot through the shared media-save policy", () => {
    expect(HARNESS_SHOWCASE_DB).toBe("v-ronpa-harness-showcase-v11");
    expect(harnessShowcaseSaveSlotPolicy.namespace).toBe("harness");
    expect(harnessShowcaseSaveSlotIds).toHaveLength(harnessShowcaseManualSaveSlotCount);
    expect(harnessShowcaseSaveSlotIds.slice(0, 4)).toEqual([
      "slot:harness:1",
      "slot:harness:2",
      "slot:harness:3",
      "slot:harness:4"
    ]);
    expect(harnessShowcaseSaveSlotIds.at(-1)).toBe("slot:harness:40");
    expect(harnessShowcaseSaveSlotIds).not.toContain(harnessShowcaseQuickSaveSlotId);
    expect(harnessShowcaseSaveSlotPolicy.labelForSlot("slot:harness:1")).toBe("Slot 1");
    expect(harnessShowcaseSaveSlotPolicy.labelForSlot(harnessShowcaseQuickSaveSlotId)).toBe("Quick Save");
  });

  it("keeps quick slot summaries out of manual save/load pages", () => {
    const manual = {
      id: "slot:harness:1",
      label: "Slot 1",
      savedAt: "2026-06-20T00:00:00.000Z",
      mode: "navi" as const
    };
    const quick = {
      id: harnessShowcaseQuickSaveSlotId,
      label: "Quick Save",
      savedAt: "2026-06-20T00:00:00.000Z",
      mode: "navi" as const
    };

    expect(selectHarnessShowcaseManualSaveSlotSummaries([manual, quick])).toEqual([manual]);
    expect(selectHarnessShowcaseQuickSaveSlotSummary([manual, quick])).toBe(quick);
  });
});

function compileScenario(sourceText: string, scriptPath: string): RuntimeScript {
  const parsed = parseScenario({ sourceText, scriptPath });
  const compiled = compileRuntimeScript(parsed);
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
    loc: { scriptPath: "save-adapter-test.nani", line: 1, column: 1, raw: `@${commandId}` }
  };
}

function createVnCheckpoint(
  story: StoryRuntimeSnapshot,
  pixiStage: PixiStageSnapshot = createInitialPixiStageSnapshot()
): SaveableVnState {
  return {
    entryId: "vn:harness-showcase",
    script: { scriptPath: "harness/showcase.nani", scriptRevision: "sha256:test" },
    story: createSaveableStorySnapshot(story),
    pixiStage,
    media: {
      bgmByGroup: { music: { sourceRef: "bgm:main", volume: 0.4 } },
      loopingSfxByKey: { rain: { sourceRef: "sfx:rain", volume: 0.3, group: "rain" } }
    },
    ui: { dialog: true, commandBar: true, toastLayer: true, cue: false }
  };
}
