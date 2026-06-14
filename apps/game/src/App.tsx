import { defaultHarnessScenarioId, getHarnessScenario } from "./harness/registry";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const requestedScenario = params.get("scenario") ?? defaultHarnessScenarioId;
  const scenario = getHarnessScenario(requestedScenario);
  const Scenario = scenario.Component;

  return <Scenario />;
}
