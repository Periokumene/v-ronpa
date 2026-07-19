import { useCallback, type ReactNode } from "react";
import {
  useVnDevtoolsDefinitionState,
  useVnDevtoolsHostTransaction,
  type VnDevtoolsDefinitionState
} from "@v-ronpa/app-vn-devtools";
import type { SaveableVnState } from "@v-ronpa/contracts";
import { GameAAppCore, type GameAAppContext } from "../App";
import type { GameAStoryDefinition } from "../gameAScripts";
import { GameANaniDevtools } from "./GameANaniDevtools";
import { GameADevViewport } from "./GameADevViewport";
import { decorateGameACandidateStory } from "./gameACandidateStory";

export function GameADevApp({
  initialStoryDefinition
}: {
  initialStoryDefinition: GameAStoryDefinition;
}) {
  const definitionState = useVnDevtoolsDefinitionState(initialStoryDefinition);
  return (
    <GameAAppCore
      storyDefinition={definitionState.activeDefinition}
      className="game-a-shell-with-devtools"
      wrapPlayfield={wrapGameADevPlayfield}
      renderAfterPlayfield={({ runtime, flow }) => (
        <GameADevtoolsHost
          definitionState={definitionState}
          flow={flow}
          runtime={runtime}
        />
      )}
    />
  );
}

function wrapGameADevPlayfield(playfield: ReactNode): ReactNode {
  return <GameADevViewport>{playfield}</GameADevViewport>;
}

interface GameADevtoolsHostProps extends GameAAppContext {
  definitionState: VnDevtoolsDefinitionState<GameAStoryDefinition>;
}

function GameADevtoolsHost({ definitionState, flow, runtime }: GameADevtoolsHostProps) {
  const restoreCheckpoint = useCallback(
    (checkpoint: SaveableVnState) => runtime.lifecycle.restoreVnState({ gameId: "game-a", state: checkpoint }),
    [runtime.lifecycle]
  );
  const enterFlow = useCallback(() => flow.send({ type: "ENTER_VN" }), [flow.send]);
  const reportDiagnostic = useCallback((message: string) => {
    runtime.diagnostics.observeAssetDiagnostic({
      code: "vn-devtools-flow-dispatch-failed",
      severity: "error",
      kind: "vn-devtools",
      message: `The Nani workbench restored the candidate runtime, but ENTER_VN dispatch failed: ${message}`
    });
  }, [runtime.diagnostics]);
  const mutations = useVnDevtoolsHostTransaction({
    definitionState,
    storySession: runtime.presentation.storySession,
    prepareDefinition: decorateGameACandidateStory,
    restoreCheckpoint,
    enterFlow,
    reportDiagnostic
  });

  return (
    <GameANaniDevtools
      storyDefinition={definitionState.activeDefinition}
      runtime={runtime}
      vnActive={runtime.shell.storyRuntime.active}
      adoptCandidate={mutations.adoptCandidate}
      commitCandidate={mutations.commitCandidate}
    />
  );
}
