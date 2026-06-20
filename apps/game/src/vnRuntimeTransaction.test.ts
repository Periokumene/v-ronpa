import { describe, expect, it } from "vitest";
import { parseScenario } from "@v-ronpa/nani-parser";
import { createInitialPixiStageSnapshot } from "@v-ronpa/pixi-presenter";
import { advanceToNextStop, createInitialStoryState } from "@v-ronpa/story-engine";
import { createVnRuntimePresentationTransaction } from "./vnRuntimeTransaction";

describe("VN runtime presentation transaction", () => {
  it("projects new Story presentation commands into Pixi stage snapshot while leaving print in Story UI state", () => {
    const { scenario } = parseScenario({
      sourceText: [
        "@back bg:harness effect:fade",
        "@charEnter character:felix portrait:portrait:felix:neutral slot:center",
        "Felix: Hello."
      ].join("\n"),
      scriptPath: "transaction-test.nani"
    });
    const initialStory = createInitialStoryState(scenario);
    const initialPixiStage = createInitialPixiStageSnapshot();
    const advanced = advanceToNextStop(initialStory, scenario).state;

    const transaction = createVnRuntimePresentationTransaction({
      previousStory: initialStory,
      nextStory: advanced,
      previousPixiStage: initialPixiStage
    });

    expect(advanced.backlog).toEqual([{ speaker: "Felix", text: "Hello." }]);
    expect(advanced.presentationCommands.at(-1)).toEqual({
      type: "print",
      speaker: "Felix",
      text: "Hello.",
      autoNext: false
    });
    expect(transaction.pixiStage).toEqual({
      version: 1,
      revision: 2,
      background: { backgroundId: "bg:harness" },
      slots: {
        center: {
          slot: "center",
          characterId: "character:felix",
          portraitId: "portrait:felix:neutral"
        }
      }
    });
    expect(transaction.pixiHints).toEqual([]);
  });

  it("keeps transient Pixi effects as render hints without changing the terminal stage snapshot", () => {
    const { scenario } = parseScenario({
      sourceText: ["Felix: First.", "@flash color:#ffffff duration:120", "Felix: Second."].join("\n"),
      scriptPath: "transaction-effect-test.nani"
    });
    const initialStory = createInitialStoryState(scenario);
    const firstStop = advanceToNextStop(initialStory, scenario).state;
    const initialPixiStage = createInitialPixiStageSnapshot();

    const secondStop = advanceToNextStop(firstStop, scenario).state;
    const transaction = createVnRuntimePresentationTransaction({
      previousStory: firstStop,
      nextStory: secondStop,
      previousPixiStage: initialPixiStage
    });

    expect(transaction.pixiStage).toBe(initialPixiStage);
    expect(transaction.pixiHints).toEqual([{ type: "flash", color: "#ffffff", durationMs: 120 }]);
  });

  it("returns gameplay effects from the same Story delta without coupling them to Pixi stage state", () => {
    const { scenario } = parseScenario({
      sourceText: ["@gameplay grant-evidence id:evidence:keycard", "Felix: Evidence updated."].join("\n"),
      scriptPath: "transaction-gameplay-test.nani"
    });
    const initialStory = createInitialStoryState(scenario);
    const advanced = advanceToNextStop(initialStory, scenario).state;
    const initialPixiStage = createInitialPixiStageSnapshot();

    const transaction = createVnRuntimePresentationTransaction({
      previousStory: initialStory,
      nextStory: advanced,
      previousPixiStage: initialPixiStage
    });

    expect(transaction.pixiStage).toBe(initialPixiStage);
    expect(transaction.gameplayEffects).toEqual([
      { type: "gameplay-event", event: { type: "grant-evidence", evidenceId: "evidence:keycard" } }
    ]);
  });
});
