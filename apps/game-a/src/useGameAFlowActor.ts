import { useEffect } from "react";
import type { GameInteractionContext, GameOverlayKind, GameUiAction } from "@v-ronpa/contracts";
import { gameFlowMachine, modeFromSnapshotValue } from "@v-ronpa/game-flow-machine";
import { useMachine } from "@xstate/react";
import { GAME_A_PAUSE_ENTRY_OVERLAY, isGameAPauseTabOverlay } from "./gameAPauseTabs";

export function useGameAFlowActor() {
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
    replaceOverlay(overlay: GameOverlayKind) {
      send({ type: "POP_OVERLAY" });
      send({ type: "OPEN_OVERLAY", overlay });
    },
    closeTopOverlay() {
      send({ type: "POP_OVERLAY" });
    },
    closeAllOverlays() {
      send({ type: "CLOSE_OVERLAY" });
    },
    dispatchAction(action: GameUiAction) {
      if (action === "new-game") send({ type: "ENTER_VN" });
      if (action === "open-pause-menu") {
        if (isGameAPauseTabOverlay(activeOverlay)) send({ type: "POP_OVERLAY" });
        send({ type: "OPEN_OVERLAY", overlay: GAME_A_PAUSE_ENTRY_OVERLAY });
      }
      if (action === "return-title") send({ type: "RETURN_TITLE" });
    }
  };
}
