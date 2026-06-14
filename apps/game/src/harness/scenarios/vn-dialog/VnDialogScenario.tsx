import { DialogBox } from "@v-ronpa/ui-kit";
import { ScenarioFrame } from "../../ScenarioFrame";

export function VnDialogScenario() {
  return (
    <ScenarioFrame
      scenarioId="vn-dialog"
      title="DOM VN Dialog"
      description="Reserved entry for ui-kit work: advance button, choice list, speaker, ended state, keyboard confirm/cancel, and readable low-chrome VN overlay."
      status="P0 shell: current DialogBox mounted"
      log={[{ id: "speaker", label: "Speaker", value: "Felix" }]}
      commands={
        <>
          <button data-testid="vn-dialog-advance" type="button">
            Advance
          </button>
          <button data-testid="vn-dialog-cancel" type="button">
            Cancel
          </button>
        </>
      }
    >
      <div className="harness-dialog-preview" data-testid="vn-dialog-shell">
        <DialogBox speaker="Felix" text="This dialog shell is reserved for the UI Kit independent line.">
          <div className="choice-row" data-testid="vn-dialog-choice-row">
            <button type="button">Return to the hallway</button>
            <button type="button">Follow the witness</button>
          </div>
        </DialogBox>
      </div>
    </ScenarioFrame>
  );
}
