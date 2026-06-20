import { describe, expect, it } from "vitest";
import { createGameplayState } from "@v-ronpa/gameplay";
import { parseScenario } from "@v-ronpa/nani-parser";
import { createInitialStoryState, storyRuntimeSnapshot } from "@v-ronpa/story-engine";
import {
  createVerticalSliceInteractionContext,
  createVerticalSliceRuntimeRestorePlan,
  type StoryRuntime
} from "./useVerticalSliceRuntimeAdapter";

describe("vertical slice runtime adapter helpers", () => {
  it("extracts a small GameInteractionContext from vertical slice runtime state", () => {
    const { scenario } = parseScenario({ sourceText: "Felix: Hello.\n- Choice A", scriptPath: "context-test.nani" });
    const storyRuntime: StoryRuntime = {
      active: true,
      state: {
        ...createInitialStoryState(scenario),
        pendingChoices: [{ text: "Choice A" }]
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
  });

  it("plans restore of Navi, Story, and Gameplay without carrying transient UI state", () => {
    const { scenario } = parseScenario({ sourceText: "Felix: Restore me.", scriptPath: "restore-test.nani" });
    const story = {
      ...createInitialStoryState(scenario),
      instructionPointer: 1,
      backlog: [{ speaker: "Felix", text: "Restore me." }],
      presentationCommands: [{ type: "print" as const, text: "transient", autoNext: false }],
      effects: [{ type: "presentation" as const, command: { type: "print" as const, text: "transient", autoNext: false } }]
    };
    const gameplay = {
      ...createGameplayState(),
      inventory: { items: { "tool:notebook": 1 } },
      evidence: { ownedEvidenceIds: ["evidence:keycard"], submittedEvidenceIds: [] }
    };
    const save = {
      version: 1 as const,
      savedAt: "2026-06-20T00:00:00.000Z",
      mode: "navi" as const,
      navi: {
        substate: "vn2d-overlay" as const,
        activeMapId: "map:academy-hall",
        inputLock: "dialog" as const,
        playerPose: { position: [0, 1.7, 4] as [number, number, number], yaw: 0, pitch: 0 }
      },
      story: storyRuntimeSnapshot(story),
      inventory: gameplay.inventory,
      evidence: gameplay.evidence,
      characters: gameplay.characters
    };

    const plan = createVerticalSliceRuntimeRestorePlan(save, scenario);

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
      backlog: [{ speaker: "Felix", text: "Restore me." }],
      presentationCommands: [],
      effects: []
    });
  });
});
