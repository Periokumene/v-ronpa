import { describe, expect, it } from "vitest";
import type { RuntimeScript } from "@v-ronpa/contracts";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import { createInitialPixiStageSnapshot } from "@v-ronpa/pixi-presenter";
import { advanceToNextStop, createInitialStoryState } from "@v-ronpa/story-engine";
import { createVnRuntimePresentationTransaction } from "./vnRuntimeTransaction";

describe("VN runtime presentation transaction", () => {
  it("projects emitted runtime commands into Pixi stage snapshot while leaving print in Story UI state", () => {
    const runtimeScript = compileScenario(
      [
        "@back bg:harness effect:fade",
        "@char Ema.Pensive1,ArmR3 pos:50",
        "Felix: Hello."
      ].join("\n"),
      "transaction-test.nani"
    );
    const initialStory = createInitialStoryState(runtimeScript);
    const initialPixiStage = createInitialPixiStageSnapshot();
    const advanced = advanceToNextStop(initialStory, runtimeScript);

    const transaction = createVnRuntimePresentationTransaction({
      runtimeCommands: advanced.emittedRuntimeCommands,
      previousPixiStage: initialPixiStage
    });

    expect(advanced.state.backlog).toEqual([{ speaker: "Felix", text: "Hello." }]);
    expect(advanced.emittedRuntimeCommands.map((command) => command.commandId)).toEqual(["back", "char", "print"]);
    expect(transaction.pixiStage).toMatchObject({
      version: 3,
      revision: 2,
      backgroundsById: {
        MainBackground: {
          id: "MainBackground",
          kind: "background",
          appearance: "bg:harness"
        }
      },
      charactersById: {
        Ema: {
          id: "Ema",
          kind: "character",
          appearanceExpression: "Pensive1,ArmR3",
          pos: [0.5, 0]
        }
      },
      actorOrder: ["MainBackground", "Ema"]
    });
    expect(transaction.pixiStage).not.toHaveProperty("background");
    expect(transaction.pixiStage).not.toHaveProperty("slots");
    expect(transaction.pixiHints).toEqual([]);
  });

  it("keeps transient Pixi effects as render hints without changing the terminal stage snapshot", () => {
    const runtimeScript = compileScenario(
      ["Felix: First.", "@flash color:#ffffff duration:120", "Felix: Second."].join("\n"),
      "transaction-effect-test.nani"
    );
    const initialStory = createInitialStoryState(runtimeScript);
    const firstStop = advanceToNextStop(initialStory, runtimeScript).state;
    const initialPixiStage = createInitialPixiStageSnapshot();

    const secondStop = advanceToNextStop(firstStop, runtimeScript);
    const transaction = createVnRuntimePresentationTransaction({
      runtimeCommands: secondStop.emittedRuntimeCommands,
      previousPixiStage: initialPixiStage
    });

    expect(transaction.pixiStage).toBe(initialPixiStage);
    expect(transaction.pixiHints).toEqual([{ type: "flash", color: "#ffffff", durationMs: 120, wait: false }]);
    expect(transaction.pixiWaitTasks).toEqual([]);
    expect(transaction.diagnostics).toEqual([]);
  });

  it("projects waitable Pixi commands into task descriptors for Story/Pixi synchronization", () => {
    const runtimeScript = compileScenario(
      ["@char Ema.Pensive1 time:0.25 wait!", "Felix: After wait."].join("\n"),
      "transaction-wait-test.nani"
    );
    const advanced = advanceToNextStop(createInitialStoryState(runtimeScript), runtimeScript);
    const transaction = createVnRuntimePresentationTransaction({
      runtimeCommands: advanced.emittedRuntimeCommands,
      previousPixiStage: createInitialPixiStageSnapshot()
    });

    expect(advanced.state.presentationWait).toMatchObject({
      commandId: "char",
      commandIndex: 0,
      durationMs: 250
    });
    expect(transaction.pixiWaitTasks).toEqual([
      { kind: "actor-transition", target: "Ema", revision: transaction.pixiStage.revision }
    ]);
  });

  it("reports unsupported Pixi-routed runtime commands without changing stage state", () => {
    const runtimeScript = compileScenario(
      ["Felix: First.", "@focus Ema duration:420", "Felix: Second."].join("\n"),
      "transaction-unsupported-pixi-test.nani"
    );
    const initialStory = createInitialStoryState(runtimeScript);
    const firstStop = advanceToNextStop(initialStory, runtimeScript).state;
    const initialPixiStage = createInitialPixiStageSnapshot();

    const secondStop = advanceToNextStop(firstStop, runtimeScript);
    const transaction = createVnRuntimePresentationTransaction({
      runtimeCommands: secondStop.emittedRuntimeCommands,
      previousPixiStage: initialPixiStage
    });

    expect(transaction.pixiStage).toBe(initialPixiStage);
    expect(transaction.pixiHints).toEqual([]);
    expect(transaction.pixiWaitTasks).toEqual([]);
    expect(transaction.diagnostics).toEqual([
      {
        code: "unsupported-pixi-command",
        commandId: "focus",
        message: "@focus is routed to Pixi but is not consumed by pixi-presenter yet."
      }
    ]);
  });

  it("returns gameplay events from emitted runtime commands without coupling them to Pixi stage state", () => {
    const runtimeScript = compileScenario(
      ["@gameplay grant-evidence id:evidence:keycard", "Felix: Evidence updated."].join("\n"),
      "transaction-gameplay-test.nani"
    );
    const initialStory = createInitialStoryState(runtimeScript);
    const advanced = advanceToNextStop(initialStory, runtimeScript);
    const initialPixiStage = createInitialPixiStageSnapshot();

    const transaction = createVnRuntimePresentationTransaction({
      runtimeCommands: advanced.emittedRuntimeCommands,
      previousPixiStage: initialPixiStage
    });

    expect(transaction.pixiStage).toBe(initialPixiStage);
    expect(transaction.pixiWaitTasks).toEqual([]);
    expect(transaction.gameplayEvents).toEqual([{ type: "grant-evidence", evidenceId: "evidence:keycard" }]);
    expect(transaction.diagnostics).toEqual([]);
  });

  it("routes media-output commands into pure media effects without touching Pixi or UI", () => {
    const runtimeScript = compileScenario(
      ["@bgm bgm:validation-main group:music volume:0.45", "@sfx sfx:rain group:rain loop!"].join("\n"),
      "transaction-media-test.nani"
    );
    const advanced = advanceToNextStop(createInitialStoryState(runtimeScript), runtimeScript);
    const initialPixiStage = createInitialPixiStageSnapshot();

    const transaction = createVnRuntimePresentationTransaction({
      runtimeCommands: advanced.emittedRuntimeCommands,
      previousPixiStage: initialPixiStage
    });

    expect(transaction.pixiStage).toBe(initialPixiStage);
    expect(transaction.pixiHints).toEqual([]);
    expect(transaction.uiState).toMatchObject({ toasts: [] });
    expect(transaction.mediaEffects).toEqual([
      { type: "play-bgm", key: "music", group: "music", sourceRef: "bgm:validation-main", volume: 0.45 },
      { type: "play-sfx", sourceRef: "sfx:rain", loop: true, fast: false, key: "rain", group: "rain" }
    ]);
  });

  it("routes UI-output commands into UI runtime state without Pixi fallback", () => {
    const runtimeScript = compileScenario(
      ["@hideUI", "@showUI dialog", "@showUI commandBar visible:true", "@toast \"Ready\" time:1.2"].join("\n"),
      "transaction-ui-test.nani"
    );
    const advanced = advanceToNextStop(createInitialStoryState(runtimeScript), runtimeScript);
    const initialPixiStage = createInitialPixiStageSnapshot();

    const transaction = createVnRuntimePresentationTransaction({
      runtimeCommands: advanced.emittedRuntimeCommands,
      previousPixiStage: initialPixiStage
    });

    expect(transaction.pixiStage).toBe(initialPixiStage);
    expect(transaction.mediaEffects).toEqual([]);
    expect(transaction.uiState.visible.dialog).toBe(true);
    expect(transaction.uiState.visible.commandBar).toBe(true);
    expect(transaction.uiState.visible.toastLayer).toBe(false);
    expect(transaction.uiState.toasts).toEqual([{ id: "toast:1", text: "Ready", durationMs: 1200 }]);
  });

  it("does not leak story-control commands into media or UI via category fallback", () => {
    const initialPixiStage = createInitialPixiStageSnapshot();
    const runtimeScript: RuntimeScript = {
      scriptPath: "transaction-story-control-routing.nani",
      labels: {},
      assets: [],
      dependencies: [],
      commands: [
        {
          commandId: "input",
          canonicalName: "input",
          category: "ui",
          source: "naninovel",
          status: "implemented",
          params: { variableName: "name", valueType: "string" },
          loc: { scriptPath: "transaction-story-control-routing.nani", line: 1, column: 1, raw: "@input name" }
        },
        {
          commandId: "wait",
          canonicalName: "wait",
          category: "flow",
          source: "naninovel",
          status: "implemented",
          params: { waitMode: "i" },
          loc: { scriptPath: "transaction-story-control-routing.nani", line: 2, column: 1, raw: "@wait i" }
        },
        {
          commandId: "voice",
          canonicalName: "voice",
          category: "media",
          source: "naninovel",
          status: "stubbed",
          params: { primary: "voice:zh:voice_validation_0001" },
          loc: { scriptPath: "transaction-story-control-routing.nani", line: 3, column: 1, raw: "@voice voice:zh:voice_validation_0001" }
        },
        {
          commandId: "stopvoice",
          canonicalName: "stopVoice",
          category: "media",
          source: "naninovel",
          status: "stubbed",
          params: {},
          loc: { scriptPath: "transaction-story-control-routing.nani", line: 4, column: 1, raw: "@stopVoice" }
        }
      ]
    };

    const transaction = createVnRuntimePresentationTransaction({
      runtimeCommands: runtimeScript.commands,
      previousPixiStage: initialPixiStage
    });

    expect(transaction.mediaEffects).toEqual([]);
    expect(transaction.uiState).toMatchObject({ toasts: [] });
    expect(transaction.pixiStage).toBe(initialPixiStage);
  });

  it("skips adapter output for unresolved runtime expressions instead of falling back", () => {
    const initialPixiStage = createInitialPixiStageSnapshot();
    const runtimeScript: RuntimeScript = {
      scriptPath: "unresolved-app-expression.nani",
      labels: {},
      assets: [],
      dependencies: [],
      commands: [
        {
          commandId: "flash",
          canonicalName: "flash",
          category: "effect",
          source: "v-ronpa",
          status: "implemented",
          params: {
            color: "#ffffff",
            duration: { type: "expression", source: "flashDuration" }
          },
          loc: { scriptPath: "unresolved-app-expression.nani", line: 1, column: 1, raw: "@flash duration:{flashDuration}" }
        },
        {
          commandId: "gameplay",
          canonicalName: "gameplay",
          category: "state",
          source: "v-ronpa",
          status: "implemented",
          params: {
            type: "grant-item",
            itemId: "gift:coffee",
            quantity: { type: "expression", source: "itemCount" }
          },
          loc: { scriptPath: "unresolved-app-expression.nani", line: 2, column: 1, raw: "@gameplay grant-item quantity:{itemCount}" }
        }
      ]
    };

    const transaction = createVnRuntimePresentationTransaction({
      runtimeCommands: runtimeScript.commands,
      previousPixiStage: initialPixiStage
    });

    expect(transaction.pixiStage).toBe(initialPixiStage);
    expect(transaction.pixiHints).toEqual([]);
    expect(transaction.pixiWaitTasks).toEqual([]);
    expect(transaction.gameplayEvents).toEqual([]);
    expect(transaction.diagnostics).toEqual([
      {
        code: "unresolved-runtime-expression",
        commandId: "flash",
        message: "@flash contains unresolved expression params; app adapters require resolved runtime values."
      },
      {
        code: "unresolved-runtime-expression",
        commandId: "gameplay",
        message: "@gameplay contains unresolved expression params; app adapters require resolved runtime values."
      }
    ]);
  });
});

function compileScenario(sourceText: string, scriptPath: string): RuntimeScript {
  const parsed = parseScenario({ sourceText, scriptPath });
  const compiled = compileRuntimeScript(parsed.scenario);
  expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  return compiled.script;
}
