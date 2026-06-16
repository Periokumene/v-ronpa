import { useState } from "react";
import type { StoryChoiceOption } from "@v-ronpa/contracts";
import { VnDialogSurface } from "@v-ronpa/ui-kit";
import { ScenarioFrame } from "../../ScenarioFrame";
import type { HarnessLogEntry } from "../../types";

type DemoStep = "line" | "choices" | "ended";

const choiceOptions: StoryChoiceOption[] = [{ text: "Return to the hallway" }, { text: "Follow the witness" }];

const demoLines: Record<DemoStep, { speaker: string; text: string }> = {
  line: {
    speaker: "Felix",
    text: "The hallway camera is still rolling. Advance once to surface the pending choices."
  },
  choices: {
    speaker: "Felix",
    text: "Pick a UI option. These choices are display data only for the DOM surface."
  },
  ended: {
    speaker: "System",
    text: "The dialog segment has ended. Keyboard advance should now be blocked and observable."
  }
};

export function VnDialogScenario() {
  const [demoStep, setDemoStep] = useState<DemoStep>("line");
  const [log, setLog] = useState<HarnessLogEntry[]>([
    { id: "boot", label: "boot", value: "vn-dialog ready" }
  ]);
  const currentLine = demoLines[demoStep];
  const pendingChoices = demoStep === "choices" ? choiceOptions : [];

  function appendEvents(entries: Array<Omit<HarnessLogEntry, "id">>) {
    setLog((current) => [
      ...current,
      ...entries.map((entry, index) => ({
        ...entry,
        id: `${entry.label}-${current.length + index}`
      }))
    ]);
  }

  function advance() {
    if (demoStep === "ended") {
      advanceBlocked("ended");
      return;
    }

    if (demoStep === "choices") {
      appendEvents([{ label: "advance", value: "choice-pending" }]);
      return;
    }

    appendEvents([{ label: "advance", value: "line->choices" }]);
    setDemoStep("choices");
  }

  function choose(index: number, choice: StoryChoiceOption) {
    appendEvents([
      { label: "choice", value: `${index}:${choice.text}` },
      { label: "ended", value: "final-line-visible" }
    ]);
    setDemoStep("ended");
  }

  function cancel() {
    appendEvents([{ label: "cancel", value: demoStep }]);
  }

  function advanceBlocked(reason: "ended") {
    appendEvents([{ label: `advance-blocked:${reason}`, value: demoStep }]);
  }

  return (
    <ScenarioFrame
      scenarioId="vn-dialog"
      title="DOM VN Dialog"
      description="Reserved entry for ui-kit work: advance button, choice list, speaker, ended state, keyboard confirm/cancel, and readable low-chrome VN overlay."
      status={`UI-only demo state: ${demoStep}`}
      log={log}
      commands={
        <>
          <button data-testid="vn-dialog-command-advance" disabled={demoStep !== "line"} onClick={advance} type="button">
            Advance
          </button>
          <button data-testid="vn-dialog-command-cancel" onClick={cancel} type="button">
            Cancel
          </button>
        </>
      }
    >
      <div className="harness-dialog-preview" data-state={demoStep} data-testid="vn-dialog-shell">
        <VnDialogSurface
          choices={pendingChoices}
          ended={demoStep === "ended"}
          onAdvance={advance}
          onAdvanceBlocked={advanceBlocked}
          onCancel={cancel}
          onChoice={choose}
          speaker={currentLine.speaker}
          text={currentLine.text}
        />
      </div>
    </ScenarioFrame>
  );
}
