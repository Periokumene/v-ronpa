import { describe, expect, it } from "vitest";
import type { RuntimeScript } from "@v-ronpa/contracts";
import { createGameplayState } from "@v-ronpa/gameplay";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import { createInitialPixiStageSnapshot, reducePixiStageCommand } from "@v-ronpa/pixi-presenter";
import { advanceToNextStop, createInitialStoryState, storyRuntimeSnapshot } from "@v-ronpa/story-engine";
import type { VnOutputRouteTable } from "../vnOutputRoutes";
import {
  collectVerticalSliceRuntimeDiagnostics,
  createInitialVerticalSliceDiagnostics,
  createVerticalSliceInteractionContext,
  createVerticalSlicePresentationTransaction,
  createVerticalSliceRuntimeRestorePlan,
  type StoryRuntime
} from "./useVerticalSliceRuntimeAdapter";

describe("vertical slice runtime adapter helpers", () => {
  it("extracts a small GameInteractionContext from vertical slice runtime state", () => {
    const runtimeScript = compileScenario("Felix: Hello.\n- Choice A", "context-test.nani");
    const storyRuntime: StoryRuntime = {
      active: true,
      state: {
        ...createInitialStoryState(runtimeScript),
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
    const runtimeScript = compileScenario(
      [
        "@back bg:harness effect:fade",
        "@charEnter character:felix portrait:portrait:felix:neutral slot:center",
        "@gameplay grant-evidence id:evidence:keycard",
        "Felix: Routed."
      ].join("\n"),
      "route-options-test.nani"
    );
    const routeTable: VnOutputRouteTable = {
      commands: {
        print: ["debug"],
        back: ["debug"],
        charenter: ["debug"],
        gameplay: ["debug"]
      },
      categories: {},
      wildcards: {}
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
    expect(plan.pixiStageRuntime).toEqual({
      snapshot: pixiStage,
      hints: [],
      hintSequence: 0,
      animate: false
    });
  });
});

function compileScenario(sourceText: string, scriptPath: string): RuntimeScript {
  const parsed = parseScenario({ sourceText, scriptPath });
  const compiled = compileRuntimeScript(parsed.scenario);
  expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  return compiled.script;
}
