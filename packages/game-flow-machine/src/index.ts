import { createMachine } from "xstate";
import type { GameMode } from "@v-ronpa/contracts";

export type GameFlowEvent =
  | { type: "BOOT" }
  | { type: "ENTER_NAVI" }
  | { type: "ENTER_TRIAL" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "SAVE" }
  | { type: "SAVED" };

const rootModeTransitions = {
  ENTER_NAVI: "navi",
  ENTER_TRIAL: "trial",
  PAUSE: "paused",
  SAVE: "saving"
} as const;

export const gameFlowMachine = createMachine({
  id: "v-ronpa-flow",
  types: {} as {
    events: GameFlowEvent;
  },
  initial: "loading",
  states: {
    loading: {
      on: { BOOT: "navi" }
    },
    navi: {
      on: rootModeTransitions
    },
    trial: {
      on: rootModeTransitions
    },
    paused: {
      on: { RESUME: "navi", ENTER_NAVI: "navi", ENTER_TRIAL: "trial" }
    },
    saving: {
      on: { SAVED: "navi", ENTER_NAVI: "navi", ENTER_TRIAL: "trial" }
    }
  }
});

export function modeFromSnapshotValue(value: unknown): GameMode {
  return String(value) as GameMode;
}
