import type { HarnessScenario } from "./types";
import { VerticalSliceScenario } from "./scenarios/vertical-slice/VerticalSliceScenario";

export const harnessScenarios = [
  {
    id: "vertical-slice",
    label: "Vertical Slice",
    description: "Integrated Navi exploration to VN dialog playable slice.",
    Component: VerticalSliceScenario
  }
] satisfies HarnessScenario[];

export const defaultHarnessScenarioId = "vertical-slice";

const scenarioAliases: Record<string, string> = {
  baseline: "vertical-slice"
};

export function getHarnessScenario(id: string | null): HarnessScenario {
  const fallback = harnessScenarios.find((scenario) => scenario.id === defaultHarnessScenarioId);
  const canonicalId = id ? (scenarioAliases[id] ?? id) : defaultHarnessScenarioId;
  const scenario = harnessScenarios.find((candidate) => candidate.id === canonicalId) ?? fallback;
  if (!scenario) throw new Error("Harness registry is missing the default scenario.");
  return scenario;
}
