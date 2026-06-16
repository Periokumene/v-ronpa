import type { HarnessScenario } from "./types";
import { BaselineScenario } from "./scenarios/baseline/BaselineScenario";
import { VerticalSliceScenario } from "./scenarios/vertical-slice/VerticalSliceScenario";

export const harnessScenarios = [
  {
    id: "baseline",
    label: "Baseline",
    description: "Existing Navi and Trial mode boundary harness.",
    Component: BaselineScenario
  },
  {
    id: "vertical-slice",
    label: "Vertical Slice",
    description: "Integrated Navi exploration to VN dialog playable slice.",
    Component: VerticalSliceScenario
  }
] satisfies HarnessScenario[];

export const defaultHarnessScenarioId = "baseline";

export function getHarnessScenario(id: string | null): HarnessScenario {
  const fallback = harnessScenarios.find((scenario) => scenario.id === defaultHarnessScenarioId);
  const scenario = harnessScenarios.find((candidate) => candidate.id === id) ?? fallback;
  if (!scenario) throw new Error("Harness registry is missing the baseline scenario.");
  return scenario;
}
