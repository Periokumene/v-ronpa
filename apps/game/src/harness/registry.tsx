import type { HarnessScenario } from "./types";
import { BaselineScenario } from "./scenarios/baseline/BaselineScenario";
import { NaviInteractionScenario } from "./scenarios/navi-interaction/NaviInteractionScenario";
import { PixiVnScenario } from "./scenarios/pixi-vn/PixiVnScenario";
import { R3fFirstPersonScenario } from "./scenarios/r3f-first-person/R3fFirstPersonScenario";
import { StoryVnScenario } from "./scenarios/story-vn/StoryVnScenario";
import { VerticalSliceScenario } from "./scenarios/vertical-slice/VerticalSliceScenario";
import { VnDialogScenario } from "./scenarios/vn-dialog/VnDialogScenario";

export const harnessScenarios = [
  {
    id: "baseline",
    label: "Baseline",
    description: "Existing Navi and Trial mode boundary harness.",
    Component: BaselineScenario
  },
  {
    id: "navi-interaction",
    label: "Navi Interaction",
    description: "Gameplay and Navi director interaction flow shell.",
    Component: NaviInteractionScenario
  },
  {
    id: "r3f-first-person",
    label: "R3F First Person",
    description: "R3F first-person exploration shell.",
    Component: R3fFirstPersonScenario
  },
  {
    id: "story-vn",
    label: "Story VN",
    description: "Story engine VN stepper shell.",
    Component: StoryVnScenario
  },
  {
    id: "vn-dialog",
    label: "VN Dialog",
    description: "DOM dialog surface shell.",
    Component: VnDialogScenario
  },
  {
    id: "pixi-vn",
    label: "Pixi VN",
    description: "Pixi portrait presenter shell.",
    Component: PixiVnScenario
  },
  {
    id: "vertical-slice",
    label: "Vertical Slice",
    description: "Final integration shell for Navi to VN playable slice.",
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
