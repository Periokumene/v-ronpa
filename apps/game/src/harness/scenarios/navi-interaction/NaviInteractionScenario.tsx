import { ScenarioFrame } from "../../ScenarioFrame";
import { verticalSliceEvidence, verticalSliceItem, verticalSliceMaps } from "../../fixtures/verticalSlice";

export function NaviInteractionScenario() {
  const hall = verticalSliceMaps[0];
  return (
    <ScenarioFrame
      scenarioId="navi-interaction"
      title="Navi Interaction Flow"
      description="Reserved entry for gameplay + navi-director work: pose-based focus, confirm interaction, item/evidence grants, map changes, and VN overlay transitions."
      status="P0 shell: package behavior not implemented here"
      log={[
        { id: "map", label: "Map", value: hall?.id ?? "missing" },
        { id: "item", label: "Tool Item", value: verticalSliceItem.id },
        { id: "evidence", label: "Evidence", value: verticalSliceEvidence.id },
        { id: "interactables", label: "Interactables", value: String(hall?.interactables.length ?? 0) }
      ]}
      commands={
        <>
          <button data-testid="navi-interaction-focus" type="button">
            Focus nearest
          </button>
          <button data-testid="navi-interaction-confirm" type="button">
            Confirm interact
          </button>
          <button data-testid="navi-interaction-close-overlay" type="button">
            Close overlay
          </button>
        </>
      }
    >
      <div className="harness-placeholder" data-testid="navi-interaction-shell">
        <h1>Navi interaction shell</h1>
        <p>Independent line owns the director/gameplay implementation behind this fixed harness entry.</p>
      </div>
    </ScenarioFrame>
  );
}
