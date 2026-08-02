import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { inspectVnDebugScript, type VnDebugScriptInspection } from "@v-ronpa/app-vn-runtime/debug";
import type { SaveableVnState, VnRuntimeScriptCatalog } from "@v-ronpa/contracts";
import {
  canRollbackVnDevtoolsHostCommit,
  createVnDevtoolsHostCommitSettlement,
  installVnDevtoolsHostCommit,
  linearizeVnDevtoolsHostCommitAcceptance,
  reconcileVnDevtoolsDefinitionRollback
} from "./hostTransaction";
import { validateVnDevtoolsCandidateCatalog, type VnDevtoolsScriptCandidate } from "./scriptCandidate";
import type { VnDevtoolsDefinitionState, VnDevtoolsPendingHostCommit } from "./useVnDevtoolsDefinitionState";

export interface PrepareVnDevtoolsDefinitionInput<Definition> {
  activeDefinition: Definition;
  candidate: VnDevtoolsScriptCandidate;
  inspection: VnDebugScriptInspection;
  signal: AbortSignal;
}

export interface UseVnDevtoolsHostTransactionOptions<Definition> {
  definitionState: VnDevtoolsDefinitionState<Definition>;
  storySession: number;
  prepareDefinition(input: PrepareVnDevtoolsDefinitionInput<Definition>): Definition | Promise<Definition>;
  restoreCheckpoint(checkpoint: SaveableVnState): Promise<{ ok: boolean }>;
  enterFlow(): void;
  reportDiagnostic?(message: string): void;
}

export interface VnDevtoolsHostMutationCallbacks {
  adoptCandidate(candidate: VnDevtoolsScriptCandidate, signal: AbortSignal): Promise<boolean>;
  commitCandidate(
    candidate: VnDevtoolsScriptCandidate,
    checkpoint: SaveableVnState,
    signal: AbortSignal,
    onAccepted: () => void
  ): Promise<boolean>;
}

export function useVnDevtoolsHostTransaction<Definition>({
  definitionState,
  enterFlow,
  prepareDefinition,
  reportDiagnostic,
  restoreCheckpoint,
  storySession
}: UseVnDevtoolsHostTransactionOptions<Definition>): VnDevtoolsHostMutationCallbacks {
  const {
    activeDefinition,
    activeDefinitionRef,
    commitSequenceRef,
    pendingCommitRef,
    pendingRollbackRef,
    setActiveDefinition
  } = definitionState;
  const [pendingCommit, setPendingCommit] = useState<VnDevtoolsPendingHostCommit<Definition> | undefined>(
    () => pendingCommitRef.current
  );
  const setActiveDefinitionRef = useRef(setActiveDefinition);
  setActiveDefinitionRef.current = setActiveDefinition;
  const mountedRef = useRef(false);
  const installedCommitTokenRef = useRef<number | undefined>(undefined);

  const failPendingCommit = useCallback((pending: VnDevtoolsPendingHostCommit<Definition>) => {
    if (!canRollbackVnDevtoolsHostCommit(pending.phase)) return;
    if (pendingCommitRef.current?.token !== pending.token) {
      pending.settlement.settle(false);
      return;
    }
    pendingCommitRef.current = undefined;
    if (!pending.settlement.settle(false)) return;
    activeDefinitionRef.current = pending.previous;
    pendingRollbackRef.current = { definition: pending.previous, token: pending.token };
    if (mountedRef.current) {
      setActiveDefinitionRef.current(pending.previous);
      setPendingCommit(undefined);
    }
  }, [activeDefinitionRef, pendingCommitRef, pendingRollbackRef]);

  const completePendingCommit = useCallback((pending: VnDevtoolsPendingHostCommit<Definition>) => {
    if (pendingCommitRef.current?.token !== pending.token) {
      pending.settlement.settle(false);
      return;
    }
    pendingCommitRef.current = undefined;
    if (pending.settlement.settle(true) && mountedRef.current) setPendingCommit(undefined);
  }, [pendingCommitRef]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const pending = pendingCommitRef.current;
      if (pending && canRollbackVnDevtoolsHostCommit(pending.phase)) failPendingCommit(pending);
    };
  }, [failPendingCommit, pendingCommitRef]);

  useLayoutEffect(() => {
    const rollback = pendingRollbackRef.current;
    if (rollback) activeDefinitionRef.current = rollback.definition;
    reconcileVnDevtoolsDefinitionRollback({
      activeDefinition,
      pendingRollback: pendingRollbackRef,
      setActiveDefinition: setActiveDefinitionRef.current,
      clearPendingState: () => setPendingCommit(undefined)
    });
  }, [activeDefinition, activeDefinitionRef, pendingRollbackRef]);

  const prepare = useCallback(async (candidate: VnDevtoolsScriptCandidate, signal: AbortSignal) => {
    if (signal.aborted) return undefined;
    const inspection = await inspectVnDebugScript(
      candidate.entry,
      candidate.source,
      candidate.sourceDiagnosticPolicy
    );
    if (signal.aborted || !inspection.declaredRevisionMatches || !inspection.canMaterialize) return undefined;
    const catalogValidation = await validateVnDevtoolsCandidateCatalog(candidate);
    if (signal.aborted || !catalogValidation.ok) return undefined;
    return prepareDefinition({
      activeDefinition: activeDefinitionRef.current,
      candidate,
      inspection,
      signal
    });
  }, [activeDefinitionRef, prepareDefinition]);

  const commitCandidate = useCallback(async (
    candidate: VnDevtoolsScriptCandidate,
    checkpoint: SaveableVnState,
    signal: AbortSignal,
    onAccepted: () => void
  ) => {
    if (!mountedRef.current || pendingCommitRef.current || pendingRollbackRef.current || signal.aborted) return false;
    const prepared = await prepare(candidate, signal);
    if (!prepared || !mountedRef.current || pendingCommitRef.current || pendingRollbackRef.current || signal.aborted) return false;
    const settlement = createVnDevtoolsHostCommitSettlement();
    const pending: VnDevtoolsPendingHostCommit<Definition> = {
      token: ++commitSequenceRef.current,
      phase: "install",
      candidate: prepared,
      previous: activeDefinitionRef.current,
      checkpoint,
      settlement
    };
    const accepted = linearizeVnDevtoolsHostCommitAcceptance({
      signal,
      install() {
        pendingCommitRef.current = pending;
        activeDefinitionRef.current = prepared;
      },
      onAccepted
    });
    if (!accepted) return false;
    setPendingCommit(pending);
    setActiveDefinitionRef.current(prepared);
    return settlement.promise;
  }, [activeDefinitionRef, commitSequenceRef, pendingCommitRef, pendingRollbackRef, prepare]);

  const adoptCandidate = useCallback(async (candidate: VnDevtoolsScriptCandidate, signal: AbortSignal) => {
    if (!mountedRef.current || pendingCommitRef.current || pendingRollbackRef.current || signal.aborted) return false;
    const prepared = await prepare(candidate, signal);
    if (!prepared || !mountedRef.current || pendingCommitRef.current || pendingRollbackRef.current || signal.aborted) return false;
    activeDefinitionRef.current = prepared;
    setActiveDefinitionRef.current(prepared);
    return true;
  }, [activeDefinitionRef, pendingCommitRef, pendingRollbackRef, prepare]);

  useLayoutEffect(() => {
    const pending = pendingCommit;
    if (!pending || pendingCommitRef.current?.token !== pending.token) return;
    if (pending.phase !== "install" || activeDefinition !== pending.candidate) return;
    if (installedCommitTokenRef.current === pending.token) return;
    installedCommitTokenRef.current = pending.token;
    void installVnDevtoolsHostCommit({
      storySessionBefore: storySession,
      restore: () => restoreCheckpoint(pending.checkpoint),
      enterFlow
    }).then((result) => {
      if (pendingCommitRef.current?.token !== pending.token) return;
      if (result.status === "failed") {
        failPendingCommit(pending);
        return;
      }
      if (result.flowDispatchError) reportDiagnostic?.(result.flowDispatchError);
      const waiting = {
        ...pending,
        phase: "await-session" as const,
        storySessionBefore: result.storySessionBefore
      };
      pendingCommitRef.current = waiting;
      if (mountedRef.current) setPendingCommit(waiting);
    });
  }, [activeDefinition, enterFlow, failPendingCommit, pendingCommit, pendingCommitRef, reportDiagnostic, restoreCheckpoint, storySession]);

  useEffect(() => {
    const pending = pendingCommit;
    if (
      pending?.phase === "await-session"
      && pendingCommitRef.current?.token === pending.token
      && storySession !== pending.storySessionBefore
    ) completePendingCommit(pending);
  }, [completePendingCommit, pendingCommit, pendingCommitRef, storySession]);

  return { adoptCandidate, commitCandidate };
}

export function stabilizeVnDevtoolsScriptCatalog(
  installed: VnRuntimeScriptCatalog,
  candidate: VnRuntimeScriptCatalog
): VnRuntimeScriptCatalog {
  const equal = installed.length === candidate.length && installed.every((source, index) => {
    const next = candidate[index];
    return next?.scriptPath === source.scriptPath
      && next.sourceText === source.sourceText
      && next.scriptRevision === source.scriptRevision;
  });
  return equal ? installed : candidate;
}
