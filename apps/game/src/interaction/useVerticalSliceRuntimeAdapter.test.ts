import { describe, expect, it } from "vitest";
import type { NaniCommandCategory, RuntimeCommand, RuntimeScript, RuntimeValue } from "@v-ronpa/contracts";
import { createGameplayState } from "@v-ronpa/gameplay";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import { createInitialPixiStageSnapshot, reducePixiRuntimeCommand } from "@v-ronpa/pixi-presenter";
import { advanceToNextStop, createInitialStoryState, storyRuntimeSnapshot } from "@v-ronpa/story-engine";
import { verticalSliceScript } from "../harness/fixtures/verticalSlice";
import type { VnOutputRouteTable } from "../vnOutputRoutes";
import {
  canToggleStoryAutomation,
  collectVerticalSliceRuntimeDiagnostics,
  createInitialVerticalSliceDiagnostics,
  createVerticalSliceInteractionContext,
  createVerticalSlicePresentationTransaction,
  createVerticalSliceRuntimeRestorePlan,
  shouldAnimateStoryPlayPacing,
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
      animate: false
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
        state: { ...storyRuntime.state, pendingChoices: [{ text: "Choice" }] }
      })
    ).toBe(false);
    expect(shouldAnimateStoryPlayPacing("normal")).toBe(true);
    expect(shouldAnimateStoryPlayPacing("skip")).toBe(false);
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
    loc: { scriptPath: "runtime-adapter-test.nani", line: 1, column: 1, raw: `@${commandId}` }
  };
}
