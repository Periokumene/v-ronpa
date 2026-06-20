import { describe, expect, it } from "vitest";
import { createGameplayState } from "@v-ronpa/gameplay";
import { parseScenario } from "@v-ronpa/nani-parser";
import { createInitialPixiStageSnapshot, reducePixiStageCommand } from "@v-ronpa/pixi-presenter";
import { advanceToNextStop, createInitialStoryState, storyRuntimeSnapshot } from "@v-ronpa/story-engine";
import type { VnOutputRouteTable } from "../vnOutputRoutes";
import {
  createVerticalSliceInteractionContext,
  createVerticalSlicePresentationTransaction,
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

  it("passes vertical-slice route options into the unified Story/Pixi transaction", () => {
    const { scenario } = parseScenario({
      sourceText: [
        "@back bg:harness effect:fade",
        "@charEnter character:felix portrait:portrait:felix:neutral slot:center",
        "@gameplay grant-evidence id:evidence:keycard",
        "Felix: Routed."
      ].join("\n"),
      scriptPath: "route-options-test.nani"
    });
    const routeTable: VnOutputRouteTable = {
      presentationCommands: {
        print: ["ui"],
        "set-background": ["debug"],
        "char-enter": ["debug"]
      },
      effects: {
        presentation: ["debug"],
        "gameplay-event": ["debug"]
      },
      wildcards: {}
    };
    const previousStory = createInitialStoryState(scenario);
    const nextStory = advanceToNextStop(previousStory, scenario).state;
    const previousPixiStage = createInitialPixiStageSnapshot();

    const transaction = createVerticalSlicePresentationTransaction({
      previousStory,
      nextStory,
      previousPixiStage,
      options: { profile: "vn3d", routeTable }
    });

    expect(transaction.pixiStage).toBe(previousPixiStage);
    expect(transaction.pixiHints).toEqual([]);
    expect(transaction.gameplayEffects).toEqual([]);
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
    const pixiStage = reducePixiStageCommand(createInitialPixiStageSnapshot(), {
      type: "char-enter",
      characterId: "character:felix",
      portraitId: "portrait:felix:neutral",
      slot: "center",
      effect: "fadeIn"
    }).snapshot;
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
    expect(plan.pixiStageRuntime).toEqual({
      snapshot: pixiStage,
      hints: [],
      hintSequence: 0,
      animate: false
    });
  });
});
