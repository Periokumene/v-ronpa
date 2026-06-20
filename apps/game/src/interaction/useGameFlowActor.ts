import { useEffect } from "react";
import type { GameInteractionContext, GameOverlayKind, GameUiAction } from "@v-ronpa/contracts";
import { useMachine } from "@xstate/react";
import { gameFlowMachine, modeFromSnapshotValue } from "@v-ronpa/game-flow-machine";

export function useGameFlowActor() {
  const [snapshot, send] = useMachine(gameFlowMachine);

  useEffect(() => {
    if (modeFromSnapshotValue(snapshot.value) === "loading") send({ type: "BOOT" });
  }, [send, snapshot.value]);

  const mode = modeFromSnapshotValue(snapshot.value);
  const activeOverlay = snapshot.context.interaction.overlayStack.at(-1);

  return {
    activeOverlay,
    capabilities: snapshot.context.capabilities,
    context: snapshot.context.interaction,
    mode,
    overlayStack: snapshot.context.interaction.overlayStack,
    send,
    updateContext(context: Partial<GameInteractionContext>) {
      send({ type: "UPDATE_CONTEXT", context });
    },
    openOverlay(overlay: GameOverlayKind) {
      send({ type: "OPEN_OVERLAY", overlay });
    },
    closeTopOverlay() {
      send({ type: "POP_OVERLAY" });
    },
    closeAllOverlays() {
      send({ type: "CLOSE_OVERLAY" });
    },
    dispatchAction(action: GameUiAction) {
      if (action === "new-game") send({ type: "START_NEW_GAME" });
      if (action === "open-pause-menu") send({ type: "PAUSE" });
      if (action === "return-title") send({ type: "RETURN_TITLE" });
    }
  };
}
