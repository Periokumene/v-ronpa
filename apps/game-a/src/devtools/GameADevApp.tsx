import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { VnDevtoolsScriptCandidate } from "@v-ronpa/app-vn-devtools";
import type { SaveableVnState } from "@v-ronpa/contracts";
import { GameAAppCore, type GameAAppContext } from "../App";
import type { GameAStoryDefinition } from "../gameAScripts";
import { GameANaniDevtools } from "./GameANaniDevtools";
import { GameADevViewport } from "./GameADevViewport";
import { prepareGameACandidateStory } from "./gameACandidateStory";
import {
  canRollbackGameADevtoolsCommit,
  createGameADevtoolsCommitSettlement,
  failGameADevtoolsCommit,
  installGameADevtoolsCommit,
  linearizeGameADevtoolsCommitAcceptance,
  reconcileGameADevtoolsEntryRollback,
  type GameADevtoolsCommitSettlement,
  type GameADevtoolsDeferredEntryRollback
} from "./gameADevtoolsCommit";

interface PendingDevtoolsCommit {
  token: number;
  phase: "install" | "await-session";
  candidate: GameAStoryDefinition;
  previous: GameAStoryDefinition;
  checkpoint: SaveableVnState;
  settlement: GameADevtoolsCommitSettlement;
  storySessionBefore?: number;
}

interface GameADevtoolsTransactionOwner {
  activeStoryDefinitionRef: { current: GameAStoryDefinition };
  commitSequenceRef: { current: number };
  pendingCommitRef: { current: PendingDevtoolsCommit | undefined };
  pendingRollbackRef: { current: GameADevtoolsDeferredEntryRollback<GameAStoryDefinition> | undefined };
}

export function GameADevApp({
  initialStoryDefinition
}: {
  initialStoryDefinition: GameAStoryDefinition;
}) {
  const [activeStoryDefinition, setActiveStoryDefinition] = useState(initialStoryDefinition);
  const activeStoryDefinitionRef = useRef(initialStoryDefinition);
  const commitSequenceRef = useRef(0);
  const pendingCommitRef = useRef<PendingDevtoolsCommit | undefined>(undefined);
  const pendingRollbackRef = useRef<GameADevtoolsDeferredEntryRollback<GameAStoryDefinition> | undefined>(undefined);
  const transactionOwner = useRef<GameADevtoolsTransactionOwner>({
    activeStoryDefinitionRef,
    commitSequenceRef,
    pendingCommitRef,
    pendingRollbackRef
  }).current;
  if (!pendingRollbackRef.current) activeStoryDefinitionRef.current = activeStoryDefinition;

  return (
    <GameAAppCore
      storyDefinition={activeStoryDefinition}
      className="game-a-shell-with-devtools"
      wrapPlayfield={wrapGameADevPlayfield}
      renderAfterPlayfield={({ runtime, flow }) => (
        <GameADevtoolsHost
          activeStoryDefinition={activeStoryDefinition}
          flow={flow}
          runtime={runtime}
          setActiveStoryDefinition={setActiveStoryDefinition}
          transactionOwner={transactionOwner}
        />
      )}
    />
  );
}

function wrapGameADevPlayfield(playfield: ReactNode): ReactNode {
  return <GameADevViewport>{playfield}</GameADevViewport>;
}

interface GameADevtoolsHostProps extends GameAAppContext {
  activeStoryDefinition: GameAStoryDefinition;
  setActiveStoryDefinition: (definition: GameAStoryDefinition) => void;
  transactionOwner: GameADevtoolsTransactionOwner;
}

function GameADevtoolsHost({
  activeStoryDefinition,
  flow,
  runtime,
  setActiveStoryDefinition,
  transactionOwner
}: GameADevtoolsHostProps) {
  const { activeStoryDefinitionRef, commitSequenceRef, pendingCommitRef, pendingRollbackRef } = transactionOwner;
  const [pendingCommit, setPendingCommit] = useState<PendingDevtoolsCommit | undefined>(
    () => pendingCommitRef.current
  );
  const setActiveStoryDefinitionRef = useRef(setActiveStoryDefinition);
  setActiveStoryDefinitionRef.current = setActiveStoryDefinition;
  const mountedRef = useRef(false);
  const installedCommitTokenRef = useRef<number | undefined>(undefined);

  const failPendingCommit = useCallback((pending: PendingDevtoolsCommit) => {
    // Once restoreVnState has succeeded, rolling back only the entry would tear
    // script identity from the already-installed Story/Pixi/UI/media state.
    if (!canRollbackGameADevtoolsCommit(pending.phase)) return;
    if (pendingCommitRef.current?.token !== pending.token) {
      pending.settlement.settle(false);
      return;
    }

    pendingCommitRef.current = undefined;
    failGameADevtoolsCommit({
      mounted: mountedRef.current,
      settlement: pending.settlement,
      rollbackEntryRef: () => {
        activeStoryDefinitionRef.current = pending.previous;
        pendingRollbackRef.current = { entry: pending.previous, token: pending.token };
      },
      rollbackMountedEntry: () => {
        setActiveStoryDefinitionRef.current(pending.previous);
        setPendingCommit(undefined);
      }
    });
  }, []);

  const completePendingCommit = useCallback((pending: PendingDevtoolsCommit) => {
    if (pendingCommitRef.current?.token !== pending.token) {
      pending.settlement.settle(false);
      return;
    }

    pendingCommitRef.current = undefined;
    if (!pending.settlement.settle(true)) return;
    if (mountedRef.current) setPendingCommit(undefined);
  }, []);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const pending = pendingCommitRef.current;
      if (pending && canRollbackGameADevtoolsCommit(pending.phase)) failPendingCommit(pending);
    };
  }, [failPendingCommit]);

  useLayoutEffect(() => {
    const rollback = pendingRollbackRef.current;
    if (rollback) activeStoryDefinitionRef.current = rollback.entry;
    reconcileGameADevtoolsEntryRollback({
      activeEntry: activeStoryDefinition,
      pendingRollback: pendingRollbackRef,
      setActiveEntry: setActiveStoryDefinitionRef.current,
      clearPendingState: () => setPendingCommit(undefined)
    });
  }, [activeStoryDefinition, pendingRollbackRef]);

  const commitCandidate = useCallback(
    async (
      candidateEntry: VnDevtoolsScriptCandidate,
      checkpoint: SaveableVnState,
      signal: AbortSignal,
      onAccepted: () => void
    ): Promise<boolean> => {
      if (
        !mountedRef.current
        || pendingCommitRef.current
        || pendingRollbackRef.current
        || signal.aborted
      ) {
        return false;
      }
      const prepared = await prepareGameACandidateStory(activeStoryDefinitionRef.current, candidateEntry, signal);
      if (
        prepared.status !== "ready"
        || !mountedRef.current
        || pendingCommitRef.current
        || pendingRollbackRef.current
        || signal.aborted
      ) return false;

      const candidate = prepared.storyDefinition;
      const settlement = createGameADevtoolsCommitSettlement();
      const pending: PendingDevtoolsCommit = {
        token: ++commitSequenceRef.current,
        phase: "install",
        candidate,
        previous: activeStoryDefinitionRef.current,
        checkpoint,
        settlement
      };
      const accepted = linearizeGameADevtoolsCommitAcceptance({
        signal,
        install() {
          pendingCommitRef.current = pending;
          activeStoryDefinitionRef.current = candidate;
        },
        onAccepted
      });
      if (!accepted) return false;
      setPendingCommit(pending);
      setActiveStoryDefinitionRef.current(candidate);
      return settlement.promise;
    },
    []
  );

  const adoptCandidate = useCallback(async (candidateEntry: VnDevtoolsScriptCandidate, signal: AbortSignal) => {
    if (!mountedRef.current || pendingCommitRef.current || pendingRollbackRef.current || signal.aborted) return false;
    const prepared = await prepareGameACandidateStory(activeStoryDefinitionRef.current, candidateEntry, signal);
    if (
      prepared.status !== "ready"
      || !mountedRef.current
      || pendingCommitRef.current
      || pendingRollbackRef.current
      || signal.aborted
    ) return false;
    const candidate = prepared.storyDefinition;
    activeStoryDefinitionRef.current = candidate;
    setActiveStoryDefinitionRef.current(candidate);
    return true;
  }, []);

  useLayoutEffect(() => {
    const pending = pendingCommit;
    if (!pending) return;

    if (pendingCommitRef.current?.token !== pending.token) {
      if (!mountedRef.current) return;
      setPendingCommit(undefined);
      return;
    }

    if (pending.phase !== "install" || activeStoryDefinition !== pending.candidate) return;
    if (installedCommitTokenRef.current === pending.token) return;
    installedCommitTokenRef.current = pending.token;

    void installGameADevtoolsCommit({
      storySessionBefore: runtime.presentation.storySession,
      restore: () => runtime.lifecycle.restoreVnState({ gameId: "game-a", state: pending.checkpoint }),
      enterVn: () => flow.send({ type: "ENTER_VN" })
    }).then((installResult) => {
      if (pendingCommitRef.current?.token !== pending.token) return;
      if (installResult.status === "failed") {
        failPendingCommit(pending);
        return;
      }
      if (installResult.flowDispatchError) {
      runtime.diagnostics.observeAssetDiagnostic({
        code: "vn-devtools-flow-dispatch-failed",
        severity: "error",
        kind: "vn-devtools",
        message: `The Nani workbench restored the candidate runtime, but ENTER_VN dispatch failed: ${installResult.flowDispatchError}`
      });
      }

    const waiting = {
      ...pending,
      phase: "await-session" as const,
      storySessionBefore: installResult.storySessionBefore
    };
      pendingCommitRef.current = waiting;
      if (mountedRef.current) setPendingCommit(waiting);
    });
  }, [activeStoryDefinition, failPendingCommit, flow.send, pendingCommit, runtime.diagnostics, runtime.lifecycle, runtime.presentation.storySession]);

  useEffect(() => {
    const pending = pendingCommit;
    if (!pending || pendingCommitRef.current?.token !== pending.token) return;

    if (
      pending.phase === "await-session"
      && runtime.presentation.storySession !== pending.storySessionBefore
    ) {
      completePendingCommit(pending);
    }
  }, [completePendingCommit, pendingCommit, runtime.presentation.storySession]);

  return (
    <GameANaniDevtools
      storyDefinition={activeStoryDefinition}
      runtime={runtime}
      vnActive={runtime.shell.storyRuntime.active}
      adoptCandidate={adoptCandidate}
      commitCandidate={commitCandidate}
    />
  );
}
