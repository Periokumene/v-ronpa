import { useEffect } from "react";
import type { GameOverlayKind, GameUiAction } from "@v-ronpa/contracts";
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
  const activeOverlay = flow.overlayStack.at(-1);

  return {
    activeOverlay,
    capabilities: interaction.capabilities,
    context: interaction.context,
    mode: flow.mode,
    overlayStack: flow.overlayStack,
    send,
    openOverlay(overlay: GameOverlayKind) {
      if (overlay === "pause-menu") send({ type: "PAUSE" });
      else send({ type: "OPEN_OVERLAY", overlay });
    },
    closeTopOverlay() {
      send({ type: "POP_OVERLAY" });
    },
    closeAllOverlays() {
      send({ type: "CLOSE_OVERLAY" });
    },
    dispatchAction(action: GameUiAction) {
      if (action === "new-game") send({ type: "START_NEW_GAME", mode: "vn" });
      if (action === "open-pause-menu") send({ type: "PAUSE" });
      if (action === "return-title") send({ type: "RETURN_TITLE" });
    }
  };
}
