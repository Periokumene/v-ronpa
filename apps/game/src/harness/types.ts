import type { ComponentType } from "react";

export interface HarnessScenario {
  id: string;
  label: string;
  description: string;
  Component: ComponentType;
}

export interface HarnessLogEntry {
  id: string;
  label: string;
  value: string;
}
