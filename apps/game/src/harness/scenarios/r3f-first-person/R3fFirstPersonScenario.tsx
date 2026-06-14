import { ExplorationStage3D } from "@v-ronpa/r3f-adapter";
import { ScenarioFrame } from "../../ScenarioFrame";
import { verticalSliceMaps } from "../../fixtures/verticalSlice";

export function R3fFirstPersonScenario() {
  const map = verticalSliceMaps[0];
  return (
    <ScenarioFrame
      scenarioId="r3f-first-person"
      title="R3F First-Person Exploration"
      description="Reserved entry for R3F work: first-person movement, look, AABB clamp, spawn reset, hotspot focus, interact callback, and model/fallback rendering."
      status="P0 shell: renders current ExplorationStage3D"
      log={[
        { id: "map", label: "Map", value: map?.id ?? "missing" },
        { id: "bounds", label: "Walk Bounds", value: map?.walkBounds ? "reserved" : "missing" }
      ]}
      commands={
        <>
          <button data-testid="r3f-reset-spawn" type="button">
            Reset spawn
          </button>
          <button data-testid="r3f-trigger-interact" type="button">
            Trigger interact
          </button>
        </>
      }
    >
      <div className="scene-stack" data-testid="r3f-first-person-shell">
        <ExplorationStage3D {...(map ? { map } : {})} cameraMode="first-person" inputLock="none" />
      </div>
    </ScenarioFrame>
  );
}
