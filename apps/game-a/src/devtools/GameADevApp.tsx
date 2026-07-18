import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { VnRuntimeEntry } from "@v-ronpa/app-vn-runtime";
import type { SaveableVnState } from "@v-ronpa/contracts";
import { GameAAppCore, type GameAAppContext } from "../App";
import type { GameAVnLaunchDefinition } from "../gameAScripts";
import { GameANaniDevtools } from "./GameANaniDevtools";
import { prepareGameACandidateLaunch, stabilizeGameACandidateLaunch } from "./gameACandidateLaunch";
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
  candidate: GameAVnLaunchDefinition;
  previous: GameAVnLaunchDefinition;
  checkpoint: SaveableVnState;
  settlement: GameADevtoolsCommitSettlement;
  storySessionBefore?: number;
}

interface GameADevtoolsTransactionOwner {
  activeLaunchDefinitionRef: { current: GameAVnLaunchDefinition };
  commitSequenceRef: { current: number };
  pendingCommitRef: { current: PendingDevtoolsCommit | undefined };
  pendingRollbackRef: { current: GameADevtoolsDeferredEntryRollback<GameAVnLaunchDefinition> | undefined };
}

export function GameADevApp({
  initialLaunchDefinition
}: {
  initialLaunchDefinition: GameAVnLaunchDefinition;
}) {
  const [activeLaunchDefinition, setActiveLaunchDefinition] = useState(initialLaunchDefinition);
  const activeLaunchDefinitionRef = useRef(initialLaunchDefinition);
  const commitSequenceRef = useRef(0);
  const pendingCommitRef = useRef<PendingDevtoolsCommit | undefined>(undefined);
  const pendingRollbackRef = useRef<GameADevtoolsDeferredEntryRollback<GameAVnLaunchDefinition> | undefined>(undefined);
  const transactionOwner = useRef<GameADevtoolsTransactionOwner>({
    activeLaunchDefinitionRef,
    commitSequenceRef,
    pendingCommitRef,
    pendingRollbackRef
  }).current;
  if (!pendingRollbackRef.current) activeLaunchDefinitionRef.current = activeLaunchDefinition;

  return (
    <GameAAppCore
      activeEntry={activeLaunchDefinition.runtimeEntry}
      characterPreloadPlan={activeLaunchDefinition.characterPreloadPlan}
      className="game-a-shell-with-devtools"
      renderAfterPlayfield={({ runtime, flow }) => (
        <GameADevtoolsHost
          activeLaunchDefinition={activeLaunchDefinition}
          flow={flow}
          runtime={runtime}
          setActiveLaunchDefinition={setActiveLaunchDefinition}
          transactionOwner={transactionOwner}
        />
      )}
    />
  );
}

interface GameADevtoolsHostProps extends GameAAppContext {
  activeLaunchDefinition: GameAVnLaunchDefinition;
  setActiveLaunchDefinition: (definition: GameAVnLaunchDefinition) => void;
  transactionOwner: GameADevtoolsTransactionOwner;
}

function GameADevtoolsHost({
  activeLaunchDefinition,
  flow,
  runtime,
  setActiveLaunchDefinition,
  transactionOwner
}: GameADevtoolsHostProps) {
  const { activeLaunchDefinitionRef, commitSequenceRef, pendingCommitRef, pendingRollbackRef } = transactionOwner;
  const [pendingCommit, setPendingCommit] = useState<PendingDevtoolsCommit | undefined>(
    () => pendingCommitRef.current
  );
  const setActiveLaunchDefinitionRef = useRef(setActiveLaunchDefinition);
  setActiveLaunchDefinitionRef.current = setActiveLaunchDefinition;
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
        activeLaunchDefinitionRef.current = pending.previous;
        pendingRollbackRef.current = { entry: pending.previous, token: pending.token };
      },
      rollbackMountedEntry: () => {
        setActiveLaunchDefinitionRef.current(pending.previous);
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
    if (rollback) activeLaunchDefinitionRef.current = rollback.entry;
    reconcileGameADevtoolsEntryRollback({
      activeEntry: activeLaunchDefinition,
      pendingRollback: pendingRollbackRef,
      setActiveEntry: setActiveLaunchDefinitionRef.current,
      clearPendingState: () => setPendingCommit(undefined)
    });
  }, [activeLaunchDefinition, pendingRollbackRef]);

  const commitCandidate = useCallback(
    async (
      candidateEntry: VnRuntimeEntry,
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
      const prepared = await prepareGameACandidateLaunch(candidateEntry, signal);
      if (
        prepared.status !== "ready"
        || !mountedRef.current
        || pendingCommitRef.current
        || pendingRollbackRef.current
        || signal.aborted
      ) return false;

      const candidate = stabilizeGameACandidateLaunch(
        activeLaunchDefinitionRef.current,
        prepared.launchDefinition
      );
      const settlement = createGameADevtoolsCommitSettlement();
      const pending: PendingDevtoolsCommit = {
        token: ++commitSequenceRef.current,
        phase: "install",
        candidate,
        previous: activeLaunchDefinitionRef.current,
        checkpoint,
        settlement
      };
      const accepted = linearizeGameADevtoolsCommitAcceptance({
        signal,
        install() {
          pendingCommitRef.current = pending;
          activeLaunchDefinitionRef.current = candidate;
        },
        onAccepted
      });
      if (!accepted) return false;
      setPendingCommit(pending);
      setActiveLaunchDefinitionRef.current(candidate);
      return settlement.promise;
    },
    []
  );

  const adoptCandidate = useCallback(async (candidateEntry: VnRuntimeEntry, signal: AbortSignal) => {
    if (!mountedRef.current || pendingCommitRef.current || pendingRollbackRef.current || signal.aborted) return false;
    const prepared = await prepareGameACandidateLaunch(candidateEntry, signal);
    if (
      prepared.status !== "ready"
      || !mountedRef.current
      || pendingCommitRef.current
      || pendingRollbackRef.current
      || signal.aborted
    ) return false;
    const candidate = stabilizeGameACandidateLaunch(
      activeLaunchDefinitionRef.current,
      prepared.launchDefinition
    );
    activeLaunchDefinitionRef.current = candidate;
    setActiveLaunchDefinitionRef.current(candidate);
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

    if (pending.phase !== "install" || activeLaunchDefinition !== pending.candidate) return;
    if (installedCommitTokenRef.current === pending.token) return;
    installedCommitTokenRef.current = pending.token;

    const installResult = installGameADevtoolsCommit({
      storySessionBefore: runtime.presentation.storySession,
      restore: () => runtime.lifecycle.restoreVnState({ gameId: "game-a", state: pending.checkpoint }),
      enterVn: () => flow.send({ type: "ENTER_VN" })
    });
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
  }, [activeLaunchDefinition, failPendingCommit, flow.send, pendingCommit, runtime.diagnostics, runtime.lifecycle, runtime.presentation.storySession]);

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
      entry={activeLaunchDefinition.runtimeEntry}
      runtime={runtime}
      vnActive={runtime.shell.storyRuntime.active}
      adoptCandidate={adoptCandidate}
      commitCandidate={commitCandidate}
    />
  );
}
