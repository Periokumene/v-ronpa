import { useMemo } from "react";
import { parseScenario } from "@v-ronpa/nani-parser";
import { createInitialStoryState } from "@v-ronpa/story-engine";
import { ScenarioFrame } from "../../ScenarioFrame";
import { verticalSliceScript } from "../../fixtures/verticalSlice";

export function StoryVnScenario() {
  const parsed = useMemo(
    () => parseScenario({ sourceText: verticalSliceScript, scriptPath: "harness/vertical-slice.nani" }),
    []
  );
  const initial = useMemo(() => createInitialStoryState(parsed.scenario), [parsed.scenario]);

  return (
    <ScenarioFrame
      scenarioId="story-vn"
      title="Story VN Stepper"
      description="Reserved entry for story-engine work: advance-to-next-presentable, local choice branching, ended state, gameplay effects, and no-op invalid choices."
      status="P0 shell: parsed script is available"
      log={[
        { id: "statements", label: "Statements", value: String(parsed.scenario.statements.length) },
        { id: "labels", label: "Labels", value: Object.keys(parsed.scenario.labels).join(", ") },
        { id: "pointer", label: "Initial Pointer", value: String(initial.instructionPointer) }
      ]}
      commands={
        <>
          <button data-testid="story-vn-advance" type="button">
            Advance
          </button>
          <button data-testid="story-vn-choice-a" type="button">
            Choice A
          </button>
          <button data-testid="story-vn-choice-b" type="button">
            Choice B
          </button>
        </>
      }
    >
      <div className="harness-placeholder" data-testid="story-vn-shell">
        <h1>Story VN shell</h1>
        <p>Independent line wires the package helper into this fixed script fixture.</p>
      </div>
    </ScenarioFrame>
  );
}
