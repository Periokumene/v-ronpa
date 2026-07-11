import { useEffect } from "react";
import type { GameOverlayKind, GamePauseSection } from "@v-ronpa/contracts";
import type { VnInteractionFacts } from "@v-ronpa/app-vn-runtime";
import {
  createGameFlowSnapshot,
  deriveGameInteractionState,
  gameFlowMachine,
  modeFromSnapshotValue
} from "@v-ronpa/game-flow-machine";
import { useMachine } from "@xstate/react";

export function useGameAFlowActor(vn: VnInteractionFacts) {
  const [snapshot, send] = useMachine(gameFlowMachine);

  useEffect(() => {
    if (modeFromSnapshotValue(snapshot.value) === "loading") send({ type: "BOOT" });
  }, [send, snapshot.value]);

  const flow = createGameFlowSnapshot(snapshot.value, snapshot.context);
  const interaction = deriveGameInteractionState({ flow, vn });
  return {
    activeOverlay: flow.activeOverlay,
    pauseSection: flow.pauseSection,
    capabilities: interaction.capabilities,
    context: interaction.context,
    mode: flow.mode,
    send,
    openOverlay(overlay: GameOverlayKind) {
      send({ type: "OPEN_OVERLAY", overlay });
    },
    closeOverlay() {
      send({ type: "CLOSE_OVERLAY" });
    },
    openPauseSection(section: GamePauseSection) {
      send({ type: "OPEN_PAUSE", section });
    },
    resumeFromPause() {
      send({ type: "RESUME" });
    }
  };
}
