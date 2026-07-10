import { useEffect } from "react";
import type { GameOverlayKind, GameUiAction } from "@v-ronpa/contracts";
import {
  createGameFlowSnapshot,
  deriveGameInteractionState,
  gameFlowMachine,
  modeFromSnapshotValue,
  type GameHostInteractionFacts,
  type VnInteractionFacts
} from "@v-ronpa/game-flow-machine";
import { useMachine } from "@xstate/react";

const inactiveVnFacts: VnInteractionFacts = {
  hasActiveStory: false,
  storyHasChoices: false,
  storyEnded: false,
  isAtStableStop: true,
  inputLock: "none"
};

export function useGameFlowActor() {
  const [snapshot, send] = useMachine(gameFlowMachine);

  useEffect(() => {
    if (modeFromSnapshotValue(snapshot.value) === "loading") send({ type: "BOOT" });
  }, [send, snapshot.value]);

  const flow = createGameFlowSnapshot(snapshot.value, snapshot.context);
  const defaultInteraction = deriveGameInteractionState({ flow, vn: inactiveVnFacts });
  const activeOverlay = flow.overlayStack.at(-1);
  const base = {
    activeOverlay,
    capabilities: defaultInteraction.capabilities,
    context: defaultInteraction.context,
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
      if (action === "new-game") send({ type: "START_NEW_GAME", mode: "navi" });
      if (action === "open-pause-menu") send({ type: "PAUSE" });
      if (action === "return-title") send({ type: "RETURN_TITLE" });
    }
  };

  function withInteractionFacts(vn: VnInteractionFacts, host: GameHostInteractionFacts = {}) {
    return { ...base, withInteractionFacts, ...deriveGameInteractionState({ flow, host, vn }) };
  }

  return { ...base, withInteractionFacts };
}
