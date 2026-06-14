import { ScenarioFrame } from "../../ScenarioFrame";
import { verticalSliceMaps } from "../../fixtures/verticalSlice";

const sliceSteps = [
  "spawn in academy hall",
  "interact with notebook tool",
  "show keycard evidence in inspector",
  "change map through classroom door",
  "trigger witness VN overlay",
  "choice A returns to hallway",
  "choice B changes scene"
];

export function VerticalSliceScenario() {
  return (
    <ScenarioFrame
      scenarioId="vertical-slice"
      title="Navi To VN Vertical Slice"
      description="Reserved integration entry. It should remain a shell until P1-A through P1-E are merged, then connect the full playable path."
      status="P0 shell: integration work pending"
      log={[
        { id: "maps", label: "Maps", value: verticalSliceMaps.map((map) => map.id).join(", ") },
        { id: "steps", label: "Acceptance Steps", value: String(sliceSteps.length) }
      ]}
      commands={
        <>
          <button data-testid="vertical-slice-start" type="button">
            Start slice
          </button>
          <button data-testid="vertical-slice-reset" type="button">
            Reset
          </button>
        </>
      }
    >
      <ol className="harness-checklist" data-testid="vertical-slice-shell">
        {sliceSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </ScenarioFrame>
  );
}
