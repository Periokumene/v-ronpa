import { describe, expect, it } from "vitest";
import type { NaniCommandCategory, RuntimeCommand, RuntimeScript, RuntimeValue } from "@v-ronpa/contracts";
import { createGameplayState } from "@v-ronpa/gameplay";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import { createInitialPixiStageSnapshot, reducePixiRuntimeCommand } from "@v-ronpa/pixi-presenter";
import { createInitialStoryState } from "@v-ronpa/story-engine";
import { canSaveHarnessShowcaseRuntime, createHarnessShowcaseSaveData, harnessShowcaseSaveSlotIds } from "./useHarnessShowcaseSaveAdapter";

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
    const pixiStage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { appearance: "bg:harness" })
    ).snapshot;

    const save = createHarnessShowcaseSaveData({
      savedAt: "2026-06-20T00:00:00.000Z",
      navi: { substate: "vn2d-overlay", activeMapId: "map:academy-hall", inputLock: "dialog" },
      story,
      pixiStage,
      gameplay
    });

    expect(save).toMatchObject({
      version: 5,
      mode: "navi",
      vn: {
        pixiStage: {
          version: 5,
          revision: 1,
          backgroundsById: {
            MainBackground: { appearance: "bg:harness" }
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
    expect(save).not.toHaveProperty("dialogRevealRuntime");
    expect(save.vn?.story).not.toHaveProperty("dialogRevealRuntime");
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
      story: createInitialStoryState(runtimeScript),
      pixiStage: createInitialPixiStageSnapshot(),
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

  it("does not persist runtimeWait and reports save availability as false while waiting", () => {
    const runtimeScript = compileScenario("@wait i", "runtime-wait-save-test.nani");
    const gameplay = createGameplayState();
    const story = {
      ...createInitialStoryState(runtimeScript),
      runtimeWait: { kind: "pause" as const, commandId: "wait" as const, commandIndex: 0, mode: "confirm" as const }
    };

    const save = createHarnessShowcaseSaveData({
      savedAt: "2026-06-20T00:00:00.000Z",
      navi: { substate: "vn2d-overlay", activeMapId: "map:academy-hall", inputLock: "dialog" },
      story,
      pixiStage: createInitialPixiStageSnapshot(),
      gameplay
    });

    expect(save.vn?.story.runtimeWait).toBeUndefined();
    expect(canSaveHarnessShowcaseRuntime({ storyRuntime: { active: true, state: story } })).toBe(false);
  });

  it("keeps the harness-showcase slot id policy in the app adapter layer", () => {
    expect(harnessShowcaseSaveSlotIds).toEqual([
      "slot:harness:1",
      "slot:harness:2",
      "slot:harness:3",
      "slot:harness:4"
    ]);
  });
});

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
    loc: { scriptPath: "save-adapter-test.nani", line: 1, column: 1, raw: `@${commandId}` }
  };
}
