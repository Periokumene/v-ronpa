import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  VnDiagnosticsPort,
  VnLifecyclePort,
  VnPresentationPort,
  VnRuntimeShellPort
} from "@v-ronpa/app-vn-runtime";
import {
  EMPTY_VN_DEBUG_DECISION_TRACE,
  inspectVnDebugScript,
  materializeVnDebugTarget,
  resolveVnDebugFinalTextStageAnchor,
  type VnDebugDecisionTrace,
  type VnDebugChoiceDecision,
  type VnDebugScriptInspection,
  type VnDebugInputDecision,
  type VnDebugMaterializationMode,
  type VnDebugMaterializationProvenance,
  type VnDebugMaterializationResult,
  type VnDebugMaterializationDecisionRequired,
  type VnDebugTargetAnchor
} from "@v-ronpa/app-vn-runtime/debug";
import type { SaveableVnState, VnEntryDef, VnRuntimeScriptCatalog } from "@v-ronpa/contracts";
import {
  createDefaultVnDevtoolsSessionState,
  loadVnDevtoolsSessionState,
  saveVnDevtoolsSessionState,
  type VnDevtoolsPersistedDecision,
  type VnDevtoolsStorageLike
} from "./sessionPersistence";
import {
  createVnDevtoolsLatestTaskController,
  createVnDevtoolsMonotonicUpdateGate,
  createVnDevtoolsSerialCommitQueue,
  shouldAdoptCanonicalInitialEntry
} from "./sourceUpdates";
import {
  classifyVnDevtoolsScriptUpdateImpact,
  prepareVnDevtoolsCandidateUpdate
} from "./candidateUpdates";
import { prepareVnDevtoolsInitialCandidate } from "./initialCandidate";
import { mergeVnDevtoolsDiagnostics } from "./controllerDiagnostics";
import {
  createVnDevtoolsFixedPointCoordinator,
  type VnDevtoolsAcceptedFixedPoint,
  type VnDevtoolsFixedPointCoordinator
} from "./fixedPointCoordinator";
import {
  appendVnDevtoolsDecision,
  applyVnDevtoolsRuntimeDegradation,
  canMaterializeVnDevtoolsInspection,
  canPinCurrentVnDevtoolsInspection,
  canReauthorizeVnDevtoolsInspection,
  createCatalogVerifiedVnDevtoolsInspectionDisplay,
  createReadOnlyVnDevtoolsInspectionDisplay,
  createVerifiedLocalVnDevtoolsInspectionDisplay,
  resolveCurrentVnDevtoolsAnchor,
  vnDebugAnchorIdentity,
  vnDebugAnchorsEqual,
  vnDebugScriptIdentity,
  type VnDevtoolsInspectionDisplay
} from "./controllerSafety";
import type {
  VnDevtoolsController,
  VnDevtoolsDecision,
  VnDevtoolsDecisionSubmission,
  VnDevtoolsDiagnostic,
  VnDevtoolsLayoutState,
  VnDevtoolsLinePreviewability,
  VnDevtoolsRuntimeSummaries,
  VnDevtoolsSourceLine,
  VnDevtoolsStatus
} from "./types";
import { mergeVnDevtoolsLayout, resolveVnDevtoolsSelection } from "./controllerViewState";
import { resolveVnDevtoolsLineRange } from "./sourceViewModel";
import type {
  NaniDevtoolsViteDiagnostic,
  NaniDevtoolsViteInitialCandidate,
  NaniDevtoolsViteUpdate
} from "./viteProtocol";
import {
  candidateFromVnDebugInspection,
  createVnDevtoolsScriptCandidate,
  validateVnDevtoolsCandidateCatalog,
  type VnDevtoolsScriptCandidate
} from "./scriptCandidate";
import { createVnDevtoolsScriptAuthorityCoordinator } from "./scriptAuthorityCoordinator";

export interface VnDevtoolsRuntimeObservation {
  shell: Pick<VnRuntimeShellPort, "interactionFacts" | "storyRuntime" | "uiRuntime">;
  presentation: Pick<VnPresentationPort, "pixiStageRuntime" | "storySession">;
  lifecycle: Pick<VnLifecyclePort, "createVnSaveCheckpoint">;
  diagnostics: Pick<VnDiagnosticsPort, "runtimeDiagnostics">;
}

export interface VnDevtoolsSourceUpdateSource {
  subscribe(listener: (update: NaniDevtoolsViteUpdate) => void): () => void;
}

export interface UseVnDevtoolsControllerOptions {
  entry: VnEntryDef;
  catalog: VnRuntimeScriptCatalog;
  runtime: VnDevtoolsRuntimeObservation;
  vnActive: boolean;
  sessionKey: string;
  storage?: VnDevtoolsStorageLike;
  initialCandidates?: readonly NaniDevtoolsViteInitialCandidate[];
  updateSource?: VnDevtoolsSourceUpdateSource;
  adoptCandidate(candidate: VnDevtoolsScriptCandidate, signal: AbortSignal): boolean | Promise<boolean>;
  commitCandidate(
    candidate: VnDevtoolsScriptCandidate,
    checkpoint: SaveableVnState,
    signal: AbortSignal,
    onAccepted: () => void
  ): Promise<boolean>;
  copyText?(text: string): void | Promise<void>;
}

interface PendingDecisionContext {
  result: VnDebugMaterializationDecisionRequired;
  inspection: VnDebugScriptInspection;
  target: VnDebugTargetAnchor;
  mode: VnDebugMaterializationMode;
  expectedRevision?: string;
}

type VnDevtoolsHostMutation =
  | { kind: "adopt"; candidate: VnDevtoolsScriptCandidate }
  | {
      kind: "commit";
      candidate: VnDevtoolsScriptCandidate;
      checkpoint: SaveableVnState;
      onAccepted: () => void;
    };

interface VnDevtoolsSessionSnapshot {
  collapsed: boolean;
  width: number;
  layout: VnDevtoolsLayoutState;
  materializationMode: VnDebugMaterializationMode;
  pinnedTarget?: VnDebugTargetAnchor;
  decisions: VnDebugDecisionTrace;
  viewedScriptPath: string;
}

/**
 * Reusable controller for source inspection, latest-wins updates, decisions,
 * stable materialization, shared host transactions, and tab-local workbench
 * state. Apps retain only definition decoration, restore identity, and Flow.
 */
export function useVnDevtoolsController({
  adoptCandidate,
  commitCandidate,
  copyText,
  catalog,
  entry: entryDefinition,
  initialCandidates,
  runtime,
  sessionKey,
  storage: configuredStorage,
  updateSource,
  vnActive
}: UseVnDevtoolsControllerOptions): VnDevtoolsController {
  const storage = configuredStorage ?? (typeof window === "undefined" ? undefined : window.sessionStorage);
  const initialSession = useMemo(
    () => storage
      ? loadVnDevtoolsSessionState(storage, sessionKey) ?? createDefaultVnDevtoolsSessionState()
      : createDefaultVnDevtoolsSessionState(),
    [sessionKey, storage]
  );
  const [inspectionDisplay, setInspectionDisplay] = useState<VnDevtoolsInspectionDisplay | undefined>(undefined);
  const inspection = inspectionDisplay?.inspection;
  const [selectedLineId, setSelectedLineId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsed, setCollapsed] = useState(initialSession.collapsed);
  const [width, setWidth] = useState(initialSession.width);
  const [layout, setLayout] = useState(initialSession.layout);
  const [materializationMode, setMaterializationMode] = useState(initialSession.materializationMode);
  const [viewedScriptPath, setViewedScriptPath] = useState(
    initialSession.viewedScriptPath && catalog.some((source) => source.scriptPath === initialSession.viewedScriptPath)
      ? initialSession.viewedScriptPath
      : entryDefinition.initialScriptPath
  );
  const entry = useMemo(
    () => createVnDevtoolsScriptCandidate(entryDefinition, catalog, viewedScriptPath)
      ?? createVnDevtoolsScriptCandidate(entryDefinition, catalog, entryDefinition.initialScriptPath)!,
    [catalog, entryDefinition, viewedScriptPath]
  );
  const initialCandidate = initialCandidates?.find((candidate) =>
    candidate.entryId === entry.entry.id && candidate.scriptPath === entry.source.scriptPath);
  const [pinnedTarget, setPinnedTarget] = useState<VnDebugTargetAnchor | undefined>(initialSession.pinnedTarget);
  const armedTargetRef = useRef<VnDebugTargetAnchor | undefined>(initialSession.pinnedTarget);
  // A persisted fixed point is restored at most once for the controller boot.
  // Browsing another catalog record must never replay or validate that global
  // target as though it belonged to the newly viewed script.
  const persistedTargetRestoreCompletedRef = useRef(!initialSession.pinnedTarget);
  const [decisions, setDecisions] = useState<VnDebugDecisionTrace>(() => restoreDecisions(initialSession.decisions));
  const [status, setStatus] = useState<VnDevtoolsStatus>({
    phase: "inspecting",
    message: "Inspecting active Nani source.",
    cancellable: true
  });
  const [pendingDecision, setPendingDecision] = useState<PendingDecisionContext | undefined>(undefined);
  const [lastCheckpoint, setLastCheckpoint] = useState<SaveableVnState | undefined>(undefined);
  const lastCheckpointRef = useRef<SaveableVnState | undefined>(undefined);
  const [hasUpdateBadge, setHasUpdateBadge] = useState(false);
  const [, setScriptAuthorityRevision] = useState(0);
  const [bridgeDiagnostics, setBridgeDiagnostics] = useState<VnDevtoolsDiagnostic[]>([]);
  const scriptAuthorityRef = useRef<ReturnType<typeof createVnDevtoolsScriptAuthorityCoordinator> | undefined>(undefined);
  if (!scriptAuthorityRef.current) {
    scriptAuthorityRef.current = createVnDevtoolsScriptAuthorityCoordinator(viewedScriptPath);
  }
  const scriptAuthority = scriptAuthorityRef.current;
  scriptAuthority.view(viewedScriptPath);
  const updatedScriptPaths = scriptAuthority.updatedScriptPaths();
  const storySessionRef = useRef(runtime.presentation.storySession);
  storySessionRef.current = runtime.presentation.storySession;
  const installedMaterializationProvenanceRef = useRef<{
    storySession: number;
    mode: VnDebugMaterializationMode;
    executedScriptPaths: readonly string[];
  } | undefined>(undefined);
  const [lastMaterialization, setLastMaterialization] = useState<{
    provenance: VnDebugMaterializationProvenance;
    executedInstructions: number;
    executedScriptPaths: readonly string[];
  } | undefined>(undefined);
  const latestTasksRef = useRef(createVnDevtoolsLatestTaskController());
  const updateGateRef = useRef(createVnDevtoolsMonotonicUpdateGate());
  const adoptCandidateRef = useRef(adoptCandidate);
  adoptCandidateRef.current = adoptCandidate;
  const commitCandidateRef = useRef(commitCandidate);
  commitCandidateRef.current = commitCandidate;
  const hostMutationQueueRef = useRef(createVnDevtoolsSerialCommitQueue<VnDevtoolsHostMutation>(
    (value, signal) => {
      if (value.kind === "adopt") return Promise.resolve(adoptCandidateRef.current(value.candidate, signal));
      return commitCandidateRef.current(value.candidate, value.checkpoint, signal, value.onAccepted);
    }
  ));
  const hostCommitInFlightRef = useRef<number | undefined>(undefined);
  const selectedTargetRef = useRef<VnDebugTargetAnchor | undefined>(undefined);
  const selectionInspectionRef = useRef<VnDebugScriptInspection | undefined>(undefined);
  const sessionSnapshotRef = useRef<VnDevtoolsSessionSnapshot>({
    collapsed: initialSession.collapsed,
    width: initialSession.width,
    layout: initialSession.layout,
    materializationMode: initialSession.materializationMode,
    viewedScriptPath,
    ...(initialSession.pinnedTarget ? { pinnedTarget: initialSession.pinnedTarget } : {}),
    decisions: restoreDecisions(initialSession.decisions)
  });
  sessionSnapshotRef.current = {
    collapsed,
    width,
    layout,
    materializationMode,
    viewedScriptPath,
    ...(pinnedTarget ? { pinnedTarget } : {}),
    decisions
  };

  const persistSession = useCallback((next?: {
    collapsed?: boolean;
    width?: number;
    layout?: Partial<VnDevtoolsLayoutState>;
    materializationMode?: VnDebugMaterializationMode;
    pinnedTarget?: VnDebugTargetAnchor | null;
    decisions?: VnDebugDecisionTrace;
    viewedScriptPath?: string;
  }) => {
    if (!storage) return;
    const current = sessionSnapshotRef.current;
    const hasPinnedTargetUpdate = Boolean(next && Object.prototype.hasOwnProperty.call(next, "pinnedTarget"));
    const nextPinnedTarget = hasPinnedTargetUpdate
      ? next?.pinnedTarget ?? undefined
      : current.pinnedTarget;
    const nextLayout = mergeVnDevtoolsLayout(current.layout, next?.layout ?? {});
    const snapshot: VnDevtoolsSessionSnapshot = {
      collapsed: next?.collapsed ?? current.collapsed,
      width: next?.width ?? current.width,
      layout: nextLayout,
      materializationMode: next?.materializationMode ?? current.materializationMode,
      viewedScriptPath: next?.viewedScriptPath ?? current.viewedScriptPath,
      ...(nextPinnedTarget ? { pinnedTarget: nextPinnedTarget } : {}),
      decisions: next?.decisions ?? current.decisions
    };
    sessionSnapshotRef.current = snapshot;
    saveVnDevtoolsSessionState(storage, sessionKey, {
      collapsed: snapshot.collapsed,
      width: snapshot.width,
      layout: snapshot.layout,
      materializationMode: snapshot.materializationMode,
      viewedScriptPath: snapshot.viewedScriptPath,
      ...(nextPinnedTarget ? { pinnedTarget: nextPinnedTarget } : {}),
      decisions: [...snapshot.decisions.choices, ...snapshot.decisions.inputs]
    });
  }, [sessionKey, storage]);

  const updateLayout = useCallback((patch: Partial<VnDevtoolsLayoutState>) => {
    setLayout((current) => {
      const next = mergeVnDevtoolsLayout(current, patch);
      persistSession({ layout: next });
      return next;
    });
  }, [persistSession]);

  const installFixedPoint = useCallback((
    target: VnDebugTargetAnchor | undefined,
    checkpoint: SaveableVnState | undefined
  ) => {
    armedTargetRef.current = target;
    lastCheckpointRef.current = checkpoint;
    setPinnedTarget(target);
    setLastCheckpoint(checkpoint);
    persistSession({ pinnedTarget: target ?? null });
  }, [persistSession]);
  const fixedPointCoordinatorRef = useRef<VnDevtoolsFixedPointCoordinator<
    VnDebugTargetAnchor,
    SaveableVnState
  > | undefined>(undefined);
  if (!fixedPointCoordinatorRef.current) {
    fixedPointCoordinatorRef.current = createVnDevtoolsFixedPointCoordinator(
      initialSession.pinnedTarget ? { target: initialSession.pinnedTarget } : {},
      (state) => installFixedPoint(state.target, state.checkpoint)
    );
  }

  const acceptReadyResult = useCallback(async ({
    candidateInspection,
    result,
    task,
    updateId,
    message,
    expectedRevision
  }: {
    candidateInspection: VnDebugScriptInspection;
    result: Extract<Awaited<ReturnType<typeof materializeVnDebugTarget>>, { status: "ready" }>;
    task: ReturnType<ReturnType<typeof createVnDevtoolsLatestTaskController>["begin"]>;
    updateId?: number;
    message: string;
    expectedRevision?: string;
  }) => {
    if (!task.isCurrent()) return;
    const candidatePath = candidateInspection.source.scriptPath;
    const previousInitializedIdentity = scriptAuthority.installedIdentity(candidatePath);
    const candidate = candidateFromVnDebugInspection(entry, candidateInspection);
    const candidateIdentity = scriptCandidateIdentity(candidate);
    let acceptedFixedPoint: VnDevtoolsAcceptedFixedPoint<VnDebugTargetAnchor, SaveableVnState> | undefined;
    let hostError: unknown;
    // Mark the candidate before the host renders it so the definition-observation
    // effect cannot start a duplicate restore during the atomic commit window.
    scriptAuthority.install(candidatePath, candidateIdentity);
    scriptAuthority.expectHost(candidateIdentity);
    let committed = false;
    try {
      committed = await hostMutationQueueRef.current.enqueue({
        kind: "commit",
        candidate,
        checkpoint: result.checkpoint,
        onAccepted() {
          if (acceptedFixedPoint) return;
          acceptedFixedPoint = fixedPointCoordinatorRef.current!.accept(result.resolvedTarget);
          hostCommitInFlightRef.current = acceptedFixedPoint.epoch;
          setStatus({
            phase: "materializing",
            message: "Checkpoint accepted; finishing the host restore.",
            cancellable: false,
            degraded: result.degraded,
            ...(updateId !== undefined ? { updateId } : {})
          });
          // Host acceptance is the linearization point: later HMR work must
          // materialize from this target even while the atomic restore settles.
        }
      }, task.signal);
    } catch (error: unknown) {
      hostError = error;
    } finally {
      if (acceptedFixedPoint && hostCommitInFlightRef.current === acceptedFixedPoint.epoch) {
        hostCommitInFlightRef.current = undefined;
      }
    }
    if (!committed) {
      scriptAuthority.rejectHost(candidateIdentity);
      if (acceptedFixedPoint) fixedPointCoordinatorRef.current!.rollback(acceptedFixedPoint);
      if (scriptAuthority.installedIdentity(candidatePath) === candidateIdentity) {
        if (previousInitializedIdentity) {
          scriptAuthority.install(candidatePath, previousInitializedIdentity);
        } else {
          scriptAuthority.clearInstalled(candidatePath);
        }
      }
      if (task.isCurrent()) {
        setStatus({
          phase: "blocked",
          message: hostError instanceof Error
            ? `The host restore failed (${hostError.message}); the previous runtime remains installed.`
            : "The host rejected the atomic restore; the previous runtime remains installed."
        });
      }
      return;
    }
    // A user may explicitly unpin after host acceptance. Do not resurrect that
    // target when the already-accepted restore finishes.
    if (acceptedFixedPoint) fixedPointCoordinatorRef.current!.complete(acceptedFixedPoint, result.checkpoint);
    installedMaterializationProvenanceRef.current = {
      storySession: storySessionRef.current,
      mode: result.provenance.mode,
      executedScriptPaths: result.executedScriptPaths
    };
    setLastMaterialization({
      provenance: result.provenance,
      executedInstructions: result.executedInstructions,
      executedScriptPaths: result.executedScriptPaths
    });
    if (!task.isCurrent()) return;
    const installedDisplay = createCatalogVerifiedVnDevtoolsInspectionDisplay(candidateInspection, expectedRevision);
    const nextStatus: VnDevtoolsStatus = {
      phase: "ready",
      message,
      degraded: result.degraded,
      ...(updateId !== undefined ? { updateId } : {})
    };
    scriptAuthority.cache(candidatePath, {
      display: installedDisplay,
      diagnostics: [],
      status: nextStatus
    });
    if (candidatePath === scriptAuthority.viewedScriptPath()) {
      scriptAuthority.authorizePreview(candidatePath);
      setInspectionDisplay(installedDisplay);
      setHasUpdateBadge(false);
      scriptAuthority.clearUpdated(candidatePath);
      setScriptAuthorityRevision((current) => current + 1);
    }
    setStatus(nextStatus);
  }, [entry, installFixedPoint, scriptAuthority]);

  const handleMaterializationResult = useCallback(async ({
    candidateInspection,
    expectedRevision,
    result,
    task,
    updateId
  }: {
    candidateInspection: VnDebugScriptInspection;
    expectedRevision?: string;
    result: VnDebugMaterializationResult;
    task: ReturnType<ReturnType<typeof createVnDevtoolsLatestTaskController>["begin"]>;
    updateId?: number;
  }) => {
    if (!task.isCurrent()) return;
    if (result.status === "decision-required") {
      setPendingDecision({
        result,
        inspection: candidateInspection,
        target: result.target,
        mode: result.provenance.mode,
        ...(expectedRevision ? { expectedRevision } : {})
      });
      setStatus({
        phase: "decision-required",
        message: "This path needs a temporary tab-local decision before it can reach the preview point.",
        degraded: result.degraded,
        ...(updateId !== undefined ? { updateId } : {})
      });
      return;
    }
    if (result.status === "blocked") {
      setStatus({
        phase: result.code === "invalid-source" || result.code === "expression-error" ? "error" : "blocked",
        message: result.message,
        degraded: result.degraded,
        ...(updateId !== undefined ? { updateId } : {})
      });
      setHasUpdateBadge(true);
      return;
    }
    await acceptReadyResult({
      candidateInspection,
      result,
      task,
      ...(updateId !== undefined ? { updateId } : {}),
      ...(expectedRevision ? { expectedRevision } : {}),
      message: "Stable checkpoint installed. External saves will return here."
    });
  }, [acceptReadyResult]);

  const runMaterialization = useCallback(async ({
    candidateInspection,
    expectedRevision,
    target,
    updateId
  }: {
    candidateInspection: VnDebugScriptInspection;
    expectedRevision?: string;
    target: VnDebugTargetAnchor;
    updateId?: number;
  }) => {
    const task = latestTasksRef.current.begin();
    setPendingDecision(undefined);
    setStatus({
      phase: "materializing",
      message: materializationMode === "fast-current-script"
        ? "Replaying only the current Nani script from a cold debug state."
        : "Replaying from the canonical entry without side effects.",
      cancellable: true,
      ...(updateId !== undefined ? { updateId } : {})
    });
    const finalTarget = resolveVnDebugFinalTextStageAnchor(candidateInspection, target) ?? target;
    const common = {
      entry: candidateInspection.entry,
      inspection: candidateInspection,
      target: finalTarget,
      decisions: sessionSnapshotRef.current.decisions,
      ...(expectedRevision ? { expectedRevision } : {}),
      signal: task.signal
    };
    const materialization = materializationMode === "fast-current-script"
      ? materializeVnDebugTarget({ mode: materializationMode, ...common })
      : materializeVnDebugTarget({
          mode: materializationMode,
          ...common,
          catalog: candidateFromVnDebugInspection(entry, candidateInspection).catalog
        });
    const result = await materialization.catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return undefined;
      throw error;
    });
    if (!result || !task.isCurrent()) return;
    await handleMaterializationResult({
      candidateInspection,
      result,
      task,
      ...(expectedRevision ? { expectedRevision } : {}),
      ...(updateId !== undefined ? { updateId } : {})
    });
  }, [entry, handleMaterializationResult, materializationMode]);

  useEffect(() => {
    const identity = scriptCandidateIdentity(entry);
    if (scriptAuthority.observeHost(entry.source.scriptPath, identity)) return;
    if (scriptAuthority.installedIdentity(entry.source.scriptPath) === identity) return;
    const task = latestTasksRef.current.begin();
    const persistedTargetCandidate = persistedTargetRestoreCompletedRef.current
      ? undefined
      : initialSession.pinnedTarget;
    const crossViewedFastTarget = materializationMode === "fast-current-script"
      && persistedTargetCandidate?.scriptPath !== entry.source.scriptPath
      ? persistedTargetCandidate
      : undefined;
    const persistedTarget = crossViewedFastTarget ? undefined : persistedTargetCandidate;
    const restoreCrossViewedFastTarget = async (): Promise<boolean> => {
      if (!crossViewedFastTarget) return false;
      const targetCandidate = createVnDevtoolsScriptCandidate(
        entryDefinition,
        catalog,
        crossViewedFastTarget.scriptPath
      );
      if (!targetCandidate) {
        setStatus({ phase: "blocked", message: "The persisted FastDebug target script is no longer in the catalog." });
        return true;
      }
      const targetInitialCandidate = initialCandidates?.find((candidate) =>
        candidate.entryId === entryDefinition.id && candidate.scriptPath === crossViewedFastTarget.scriptPath);
      const targetSource = targetInitialCandidate
        ? {
            ...targetCandidate.source,
            sourceText: targetInitialCandidate.sourceText,
            scriptRevision: targetInitialCandidate.serverRevision ?? targetCandidate.source.scriptRevision
          }
        : targetCandidate.source;
      const targetInspection = await inspectVnDebugScript(entryDefinition, targetSource);
      if (
        !targetInspection.canMaterialize
        || (targetInitialCandidate?.serverRevision
          ? targetInspection.revision !== targetInitialCandidate.serverRevision
          : !targetInspection.declaredRevisionMatches)
      ) {
        setStatus({
          phase: "blocked",
          message: "The persisted FastDebug target source could not be authenticated after refresh."
        });
        return true;
      }
      await runMaterialization({
        candidateInspection: targetInspection,
        target: crossViewedFastTarget,
        expectedRevision: targetInspection.revision
      });
      return true;
    };
    scriptAuthority.freezePreview(entry.source.scriptPath);
    setInspectionDisplay((current) => current
      ? createReadOnlyVnDevtoolsInspectionDisplay(current.inspection)
      : current);
    setBridgeDiagnostics([]);
    setStatus({ phase: "inspecting", message: "Inspecting active Nani source.", cancellable: true });
    if (initialCandidate) {
      setBridgeDiagnostics(toBridgeDiagnostics(initialCandidate.diagnostics, "initial"));
      void prepareVnDevtoolsInitialCandidate({
        activeCandidate: entry,
        candidate: initialCandidate,
        ...(persistedTarget ? { pinnedTarget: persistedTarget } : {}),
        decisions: sessionSnapshotRef.current.decisions,
        materializationMode,
        vnActive,
        signal: task.signal
      }).then(async (prepared) => {
        if (!task.isCurrent()) return;
        persistedTargetRestoreCompletedRef.current = true;
        scriptAuthority.install(entry.source.scriptPath, identity);
        if (prepared.kind === "retain-read-only") {
          scriptAuthority.freezePreview(entry.source.scriptPath);
          const display = createReadOnlyVnDevtoolsInspectionDisplay(prepared.inspection);
          const nextStatus: VnDevtoolsStatus = {
            phase: prepared.reason === "invalid-source" || prepared.reason === "catalog-link-error"
              ? "error"
              : "blocked",
            message: prepared.message ?? initialCandidateFailureMessage(prepared.reason),
            degraded: prepared.inspection.degraded
          };
          scriptAuthority.cache(entry.source.scriptPath, {
            display,
            diagnostics: toBridgeDiagnostics(initialCandidate.diagnostics, "initial"),
            status: nextStatus
          });
          setInspectionDisplay(display);
          setStatus(nextStatus);
          if (await restoreCrossViewedFastTarget()) return;
          return;
        }
        if (prepared.kind === "materialize-pinned-target") {
          scriptAuthority.authorizePreview(entry.source.scriptPath);
          setInspectionDisplay(prepared.catalogVerified
            ? createCatalogVerifiedVnDevtoolsInspectionDisplay(prepared.inspection, prepared.expectedRevision)
            : createVerifiedLocalVnDevtoolsInspectionDisplay(prepared.inspection, prepared.expectedRevision));
          await handleMaterializationResult({
            candidateInspection: prepared.inspection,
            expectedRevision: prepared.expectedRevision,
            result: prepared.result,
            task
          });
          return;
        }
        if (prepared.kind === "adopt-for-next-start") {
          const candidate = candidateFromVnDebugInspection(entry, prepared.inspection);
          const candidateIdentity = scriptCandidateIdentity(candidate);
          scriptAuthority.expectHost(candidateIdentity);
          const adopted = await hostMutationQueueRef.current.enqueue({
            kind: "adopt",
            candidate
          }, task.signal);
          if (!adopted) scriptAuthority.rejectHost(candidateIdentity);
          if (!task.isCurrent()) return;
          if (!adopted) {
            setInspectionDisplay(createReadOnlyVnDevtoolsInspectionDisplay(prepared.inspection));
            setStatus({
              phase: "blocked",
              message: "The host rejected the verified initial source; the previous definition remains installed.",
              degraded: prepared.inspection.degraded
            });
            return;
          }
          scriptAuthority.install(candidate.source.scriptPath, candidateIdentity);
          scriptAuthority.authorizePreview(candidate.source.scriptPath);
          const display = createCatalogVerifiedVnDevtoolsInspectionDisplay(
            prepared.inspection,
            prepared.expectedRevision
          );
          const nextStatus: VnDevtoolsStatus = {
            phase: "ready",
            message: "Verified initial source adopted for the next New Game.",
            degraded: prepared.inspection.degraded
          };
          scriptAuthority.cache(entry.source.scriptPath, {
            display,
            diagnostics: toBridgeDiagnostics(initialCandidate.diagnostics, "initial"),
            status: nextStatus
          });
          setInspectionDisplay(display);
          setStatus(nextStatus);
          if (await restoreCrossViewedFastTarget()) return;
          return;
        }
        scriptAuthority.authorizePreview(entry.source.scriptPath);
        const display = prepared.catalogVerified
          ? createCatalogVerifiedVnDevtoolsInspectionDisplay(prepared.inspection, prepared.expectedRevision)
          : createVerifiedLocalVnDevtoolsInspectionDisplay(prepared.inspection, prepared.expectedRevision);
        const nextStatus: VnDevtoolsStatus = prepared.kind === "require-preview-target"
          ? {
              phase: "blocked",
              message: "The verified initial source changed while VN is active. Preview a line before installing it.",
              degraded: prepared.inspection.degraded
            }
          : {
              phase: "ready",
              message: "Initial source revision verified by the server and browser. Choose a line and press Preview.",
              degraded: prepared.inspection.degraded
            };
        scriptAuthority.cache(entry.source.scriptPath, {
          display,
          diagnostics: toBridgeDiagnostics(initialCandidate.diagnostics, "initial"),
          status: nextStatus
        });
        setInspectionDisplay(display);
        setStatus(nextStatus);
        if (await restoreCrossViewedFastTarget()) return;
      }).catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!task.isCurrent()) return;
        setStatus({
          phase: "error",
          message: error instanceof Error ? error.message : "The initial source handshake failed."
        });
      });
      return;
    }
    if (updateSource) {
      void inspectVnDebugScript(entry.entry, entry.source).then((nextInspection) => {
        if (!task.isCurrent()) return;
        persistedTargetRestoreCompletedRef.current = true;
        scriptAuthority.install(entry.source.scriptPath, identity);
        scriptAuthority.freezePreview(entry.source.scriptPath);
        const display = createReadOnlyVnDevtoolsInspectionDisplay(nextInspection);
        const nextStatus: VnDevtoolsStatus = {
          phase: "blocked",
          message: "The Vite server did not provide an initial source handshake; restore and adoption are disabled."
        };
        scriptAuthority.cache(entry.source.scriptPath, { display, diagnostics: [], status: nextStatus });
        setInspectionDisplay(display);
        setStatus(nextStatus);
      });
      return;
    }
    void inspectVnDebugScript(entry.entry, entry.source).then(async (nextInspection) => {
      if (!task.isCurrent()) return;
      persistedTargetRestoreCompletedRef.current = true;
      scriptAuthority.install(entry.source.scriptPath, identity);
      scriptAuthority.authorizePreview(entry.source.scriptPath, nextInspection.canMaterialize);
      setInspectionDisplay(nextInspection.canMaterialize
        ? createCatalogVerifiedVnDevtoolsInspectionDisplay(nextInspection)
        : createReadOnlyVnDevtoolsInspectionDisplay(nextInspection));
      if (await restoreCrossViewedFastTarget()) return;
      if (persistedTarget) {
        void runMaterialization({ candidateInspection: nextInspection, target: persistedTarget });
        return;
      }
      if (!nextInspection.canMaterialize) {
        setStatus({ phase: "error", message: "The active source has errors; no checkpoint was installed.", degraded: nextInspection.degraded });
        return;
      }
      if (!nextInspection.declaredRevisionMatches) {
        if (shouldAdoptCanonicalInitialEntry({
          canMaterialize: nextInspection.canMaterialize,
          declaredRevisionMatches: nextInspection.declaredRevisionMatches,
          hasPinnedTarget: false,
          vnActive
        })) {
          const candidate = candidateFromVnDebugInspection(entry, nextInspection);
          const candidateIdentity = scriptCandidateIdentity(candidate);
          scriptAuthority.expectHost(candidateIdentity);
          const adopted = await hostMutationQueueRef.current.enqueue({
            kind: "adopt",
            candidate
          }, task.signal);
          if (!adopted) scriptAuthority.rejectHost(candidateIdentity);
          if (!task.isCurrent()) return;
          if (!adopted) {
            setStatus({
              phase: "blocked",
              message: "The host rejected the canonical source revision; the previous definition remains installed.",
              degraded: nextInspection.degraded
            });
            return;
          }
          scriptAuthority.install(candidate.source.scriptPath, candidateIdentity);
          setStatus({
            phase: "ready",
            message: "Canonical source revision adopted for the next New Game.",
            degraded: nextInspection.degraded
          });
          return;
        }
        setStatus({
          phase: "blocked",
          message: "The active source revision changed without a fixed point. Choose a preview target before installing it.",
          degraded: nextInspection.degraded
        });
        return;
      }
      setStatus({
        phase: "ready",
        message: "Choose a source line and press Preview.",
        degraded: nextInspection.degraded
      });
    });
  }, [catalog, entry, entryDefinition, handleMaterializationResult, initialCandidate, initialCandidates, initialSession.pinnedTarget, materializationMode, runMaterialization, scriptAuthority, updateSource, vnActive]);

  const handleSourceUpdate = useCallback((update: NaniDevtoolsViteUpdate) => {
      const updateCandidate = createVnDevtoolsScriptCandidate(entryDefinition, catalog, update.scriptPath);
      if (update.entryId !== entryDefinition.id || !updateCandidate) return;
      if (!updateGateRef.current.accept(update.updateId)) return;
      const updateIsViewed = update.scriptPath === scriptAuthority.viewedScriptPath();
      // Freeze synchronously. React may not have committed the read-only
      // display before a user click, so the ref is the authoritative guard
      // against previewing stale source while this updateId is being consumed.
      if (updateIsViewed) {
        scriptAuthority.freezePreview(update.scriptPath);
        setInspectionDisplay((current) => current
          ? createReadOnlyVnDevtoolsInspectionDisplay(current.inspection)
          : current);
      }
      const task = updateIsViewed
        ? latestTasksRef.current.begin()
        : scriptAuthority.beginTask(update.scriptPath);
      const updateDiagnostics = toBridgeDiagnostics(update.diagnostics, String(update.updateId));
      scriptAuthority.markUpdated(update.scriptPath);
      setScriptAuthorityRevision((current) => current + 1);
      if (updateIsViewed) {
        setPendingDecision(undefined);
        setBridgeDiagnostics(updateDiagnostics);
        setHasUpdateBadge(collapsed);
        setStatus({
          phase: "updating",
          message: "Checking the latest saved source.",
          updateId: update.updateId,
          cancellable: true
        });
      }
      const fixedTarget = armedTargetRef.current;
      const installedProvenance = installedMaterializationProvenanceRef.current;
      const executedScriptPaths = installedProvenance?.storySession === runtime.presentation.storySession
        ? installedProvenance.mode === "fast-current-script"
          ? installedProvenance.executedScriptPaths
          : [...runtime.shell.storyRuntime.executedScriptPaths, ...installedProvenance.executedScriptPaths]
        : runtime.shell.storyRuntime.executedScriptPaths;
      void prepareVnDevtoolsCandidateUpdate({
        activeCandidate: updateCandidate,
        update,
        ...(fixedTarget ? { pinnedTarget: fixedTarget } : {}),
        decisions: sessionSnapshotRef.current.decisions,
        materializationMode,
        impact: classifyVnDevtoolsScriptUpdateImpact({
          executedScriptPaths,
          runtimeScriptPath: runtime.shell.storyRuntime.state.currentScriptPath,
          updatedScriptPath: update.scriptPath,
          vnActive
        }),
        signal: task.signal
      }).then(async (prepared) => {
        if (!task.isCurrent()) return;
        const isUpdateViewed = () => update.scriptPath === scriptAuthority.viewedScriptPath();
        if (prepared.kind === "retain-last-known-good") {
          const display = createReadOnlyVnDevtoolsInspectionDisplay(prepared.inspection);
          const nextStatus: VnDevtoolsStatus = {
            phase: prepared.reason === "revision-mismatch" ? "blocked" : "error",
            message: prepared.message ?? (prepared.reason === "invalid-source"
              ? "The saved source has errors. The last-known-good game state is still running."
              : prepared.reason === "catalog-link-error"
                ? "The saved source breaks the runtime catalog links. The last-known-good catalog is still running."
                : "Server and browser computed different script revisions; refusing to install the candidate."),
            updateId: update.updateId,
            degraded: prepared.inspection.degraded
          };
          scriptAuthority.cache(update.scriptPath, {
            display,
            diagnostics: updateDiagnostics,
            status: nextStatus
          });
          if (isUpdateViewed()) {
            scriptAuthority.freezePreview(update.scriptPath);
            setInspectionDisplay(display);
            setStatus(nextStatus);
          }
          return;
        }
        const candidateDisplay = prepared.catalogVerified
          ? createCatalogVerifiedVnDevtoolsInspectionDisplay(prepared.inspection, prepared.expectedRevision)
          : createVerifiedLocalVnDevtoolsInspectionDisplay(prepared.inspection, prepared.expectedRevision);
        if (isUpdateViewed()) {
          scriptAuthority.authorizePreview(update.scriptPath);
          setInspectionDisplay(candidateDisplay);
        }
        if (prepared.kind === "refresh-source-mapping") {
          if (
            fixedTarget
            && fixedTarget.scriptPath === update.scriptPath
            && !prepared.remappedTarget
          ) {
            const nextStatus: VnDevtoolsStatus = {
              phase: "blocked",
              message: "The fixed point no longer has a unique source match; the last-known-good catalog remains installed.",
              updateId: update.updateId
            };
            if (isUpdateViewed()) setStatus(nextStatus);
            return;
          }
          const candidate = candidateFromVnDebugInspection(updateCandidate, prepared.inspection);
          const candidateIdentity = scriptCandidateIdentity(candidate);
          scriptAuthority.expectHost(candidateIdentity);
          const adopted = await hostMutationQueueRef.current.enqueue({
            kind: "adopt",
            candidate
          }, task.signal);
          if (!adopted) scriptAuthority.rejectHost(candidateIdentity);
          if (!task.isCurrent()) return;
          if (!adopted) {
            const nextStatus: VnDevtoolsStatus = {
              phase: "blocked",
              message: "The host rejected the source mapping update; the last-known-good catalog remains installed.",
              updateId: update.updateId
            };
            if (isUpdateViewed()) setStatus(nextStatus);
            return;
          }
          scriptAuthority.install(candidate.source.scriptPath, candidateIdentity);
          scriptAuthority.cache(update.scriptPath, {
            display: candidateDisplay,
            diagnostics: updateDiagnostics,
            status: {
              phase: "ready",
              message: "Source mapping updated; runtime presentation was not remounted.",
              updateId: update.updateId
            }
          });
          if (prepared.remappedTarget) {
            fixedPointCoordinatorRef.current!.replace(prepared.remappedTarget, lastCheckpointRef.current);
          }
          if (isUpdateViewed()) {
            setStatus({ phase: "ready", message: "Source mapping updated; runtime presentation was not remounted.", updateId: update.updateId });
            setHasUpdateBadge(false);
            scriptAuthority.clearUpdated(update.scriptPath);
            setScriptAuthorityRevision((current) => current + 1);
          }
          return;
        }
        if (prepared.kind === "materialize-pinned-target") {
          await handleMaterializationResult({
            candidateInspection: prepared.inspection,
            result: prepared.result,
            task,
            expectedRevision: prepared.expectedRevision,
            updateId: update.updateId
          });
          return;
        }
        if (prepared.kind === "adopt-catalog") {
          const candidate = candidateFromVnDebugInspection(updateCandidate, prepared.inspection);
          const candidateIdentity = scriptCandidateIdentity(candidate);
          scriptAuthority.expectHost(candidateIdentity);
          const adopted = await hostMutationQueueRef.current.enqueue({
            kind: "adopt",
            candidate
          }, task.signal);
          if (!adopted) scriptAuthority.rejectHost(candidateIdentity);
          if (!task.isCurrent()) return;
          if (!adopted) {
            const nextStatus: VnDevtoolsStatus = {
              phase: "blocked",
              message: "The host rejected the source update; the previous definition remains installed.",
              updateId: update.updateId
            };
            if (isUpdateViewed()) setStatus(nextStatus);
            return;
          }
          scriptAuthority.install(candidate.source.scriptPath, candidateIdentity);
          const nextStatus: VnDevtoolsStatus = {
            phase: "ready",
            message: isUpdateViewed()
              ? prepared.impact === "next-start"
                ? "New revision adopted for the next New Game."
                : "Updated script installed for future navigation; the current session was unchanged."
              : "Updated script installed in the catalog for future navigation; the current session was unchanged.",
            updateId: update.updateId
          };
          scriptAuthority.cache(update.scriptPath, {
            display: candidateDisplay,
            diagnostics: updateDiagnostics,
            status: nextStatus
          });
          if (isUpdateViewed()) {
            setStatus(nextStatus);
            setHasUpdateBadge(false);
            scriptAuthority.clearUpdated(update.scriptPath);
            setScriptAuthorityRevision((current) => current + 1);
          }
          return;
        }
        if (isUpdateViewed()) setStatus({
          phase: "blocked",
          message: "The source changed while VN is active. Preview a line to arm a stable return point.",
          updateId: update.updateId
        });
      }).catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!task.isCurrent()) return;
        const nextStatus: VnDevtoolsStatus = {
          phase: "error",
          message: error instanceof Error ? error.message : "The saved source could not be inspected.",
          updateId: update.updateId
        };
        if (update.scriptPath === scriptAuthority.viewedScriptPath()) setStatus(nextStatus);
      });
  }, [catalog, collapsed, entryDefinition, handleMaterializationResult, materializationMode, runtime.presentation.storySession, runtime.shell.storyRuntime.executedScriptPaths, runtime.shell.storyRuntime.state.currentScriptPath, scriptAuthority, vnActive]);
  const handleSourceUpdateRef = useRef(handleSourceUpdate);
  handleSourceUpdateRef.current = handleSourceUpdate;

  useEffect(() => {
    if (!updateSource) return;
    return updateSource.subscribe((update) => handleSourceUpdateRef.current(update));
  }, [updateSource]);

  useEffect(() => () => {
    latestTasksRef.current.cancel();
    scriptAuthority.cancelTasks();
  }, [scriptAuthority]);

  const diagnostics = useMemo(
    () => createDiagnostics(inspection, runtime.diagnostics.runtimeDiagnostics, bridgeDiagnostics),
    [bridgeDiagnostics, inspection, runtime.diagnostics.runtimeDiagnostics]
  );
  const lineModel = useMemo(
    () => createLineModel(
      inspection,
      canMaterializeVnDevtoolsInspection(inspectionDisplay, materializationMode),
      Boolean(
        inspection
        && inspection.source.scriptPath === runtime.shell.storyRuntime.state.currentScriptPath
        && vnDebugScriptIdentity(inspection) === vnDebugScriptIdentity(entry)
      ),
      runtime.shell.storyRuntime.active,
      runtime.shell.storyRuntime.state.instructionPointer,
      pinnedTarget,
      diagnostics
    ),
    [diagnostics, entry, inspection, inspectionDisplay?.access, materializationMode, pinnedTarget, runtime.shell.storyRuntime.active, runtime.shell.storyRuntime.state.currentScriptPath, runtime.shell.storyRuntime.state.instructionPointer]
  );
  const decision = useMemo(() => pendingDecision ? toDockDecision(pendingDecision.result) : undefined, [pendingDecision]);
  const summaries = useMemo(
    () => createSummaries(runtime, lastCheckpoint, materializationMode, lastMaterialization, inspection),
    [inspection, lastCheckpoint, lastMaterialization, materializationMode, runtime]
  );
  const effectiveStatus = useMemo(
    () => applyVnDevtoolsRuntimeDegradation(status, runtime.diagnostics.runtimeDiagnostics),
    [runtime.diagnostics.runtimeDiagnostics, status]
  );

  useEffect(() => {
    if (!inspection || selectionInspectionRef.current === inspection) return;
    selectionInspectionRef.current = inspection;
    const resolved = resolveVnDevtoolsSelection({
      inspection,
      lines: lineModel.lines,
      anchorsByLineId: lineModel.anchorByLineId,
      ...(selectedTargetRef.current ? { previousAnchor: selectedTargetRef.current } : {})
    });
    setSelectedLineId(resolved.lineId);
    selectedTargetRef.current = resolved.anchor;
  }, [inspection, lineModel]);

  useEffect(() => {
    if (status.phase === "blocked" || status.phase === "error") {
      updateLayout({ bottomPanelOpen: true, activePanel: "problems" });
    }
  }, [status, updateLayout]);

  useEffect(() => {
    if (decision) updateLayout({ bottomPanelOpen: true });
  }, [decision, updateLayout]);

  const previewLine = useCallback((lineId: string) => {
    updateLayout({ bottomPanelOpen: true, activePanel: "state" });
    if (
      !scriptAuthority.canPreview(entry.source.scriptPath)
      || !inspection
      || !canMaterializeVnDevtoolsInspection(inspectionDisplay, materializationMode)
    ) {
      setStatus({
        phase: "blocked",
        message: "The displayed source was rejected and is available for diagnostics only. Save a verified candidate before previewing it."
      });
      return;
    }
    const target = lineModel.anchorByLineId.get(lineId);
    if (!target) return;
    void runMaterialization({
      candidateInspection: inspection,
      target,
      ...(inspectionDisplay.expectedRevision ? { expectedRevision: inspectionDisplay.expectedRevision } : {})
    });
  }, [entry.source.scriptPath, inspection, inspectionDisplay, lineModel.anchorByLineId, materializationMode, runMaterialization, scriptAuthority, updateLayout]);

  const submitDecision = useCallback((submission: VnDevtoolsDecisionSubmission) => {
    if (!pendingDecision) return;
    const next = appendVnDevtoolsDecision(sessionSnapshotRef.current.decisions, pendingDecision.result, submission);
    if (!next) return;
    setDecisions(next);
    persistSession({ decisions: next });
    const context = pendingDecision;
    setPendingDecision(undefined);
    const task = latestTasksRef.current.begin();
    setStatus({
      phase: "materializing",
      message: "Continuing with the selected temporary decision.",
      cancellable: true
    });
    const common = {
      entry: context.inspection.entry,
      inspection: context.inspection,
      target: context.target,
      decisions: next,
      ...(context.expectedRevision ? { expectedRevision: context.expectedRevision } : {}),
      signal: task.signal
    };
    const materialization = context.mode === "fast-current-script"
      ? materializeVnDebugTarget({ mode: context.mode, ...common })
      : materializeVnDebugTarget({
          mode: context.mode,
          ...common,
          catalog: candidateFromVnDebugInspection(entry, context.inspection).catalog
        });
    void materialization.then(async (result) => {
      if (!task.isCurrent()) return;
      if (result.status === "decision-required") {
        setPendingDecision({ ...context, result });
        setStatus({ phase: "decision-required", message: "Another path decision is required.", degraded: result.degraded });
        return;
      }
      if (result.status === "blocked") {
        setStatus({ phase: "blocked", message: result.message, degraded: result.degraded });
        return;
      }
      await acceptReadyResult({
        candidateInspection: context.inspection,
        result,
        task,
        ...(context.expectedRevision ? { expectedRevision: context.expectedRevision } : {}),
        message: "Decision path materialized and installed."
      });
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return;
      if (!task.isCurrent()) return;
      setStatus({
        phase: "error",
        message: error instanceof Error ? error.message : "The decision path could not be materialized."
      });
    });
  }, [acceptReadyResult, entry, pendingDecision, persistSession]);

  return {
    entryId: entry.entry.id,
    viewedScriptPath: entry.source.scriptPath,
    runtimeScriptPath: runtime.shell.storyRuntime.state.currentScriptPath,
    scripts: catalog.map((source) => ({
      scriptPath: source.scriptPath,
      revision: inspection?.source.scriptPath === source.scriptPath
        ? inspection.revision
        : scriptAuthority.cached(source.scriptPath)?.display.inspection.revision
          ?? source.scriptRevision,
      viewed: source.scriptPath === entry.source.scriptPath,
      runtime: source.scriptPath === runtime.shell.storyRuntime.state.currentScriptPath,
      ...(updatedScriptPaths.has(source.scriptPath) ? { hasUpdateBadge: true } : {})
    })),
    lines: lineModel.lines,
    ...(selectedLineId ? { selectedLineId } : {}),
    searchQuery,
    collapsed,
    width,
    layout,
    status: effectiveStatus,
    materializationMode,
    materializationModeLocked: hostCommitInFlightRef.current !== undefined,
    diagnostics,
    summaries,
    ...(decision ? { decision } : {}),
    hasUpdateBadge,
    actions: {
      selectScript(scriptPath) {
        if (!catalog.some((source) => source.scriptPath === scriptPath)) return;
        persistedTargetRestoreCompletedRef.current = true;
        latestTasksRef.current.cancel();
        scriptAuthority.view(scriptPath);
        const cached = scriptAuthority.cached(scriptPath);
        if (cached) {
          const selectedCandidate = createVnDevtoolsScriptCandidate(entryDefinition, catalog, scriptPath);
          if (selectedCandidate) {
            scriptAuthority.install(scriptPath, scriptCandidateIdentity(selectedCandidate));
          }
          scriptAuthority.authorizePreview(
            scriptPath,
            canMaterializeVnDevtoolsInspection(cached.display, materializationMode)
          );
          setInspectionDisplay(cached.display);
          setBridgeDiagnostics(cached.diagnostics);
          setStatus(cached.status);
        } else {
          scriptAuthority.clearInstalled(scriptPath);
          scriptAuthority.freezePreview(scriptPath);
          setInspectionDisplay(undefined);
          setBridgeDiagnostics([]);
          setStatus({ phase: "inspecting", message: "Inspecting selected Nani source.", cancellable: true });
        }
        setViewedScriptPath(scriptPath);
        scriptAuthority.clearUpdated(scriptPath);
        setScriptAuthorityRevision((current) => current + 1);
        setSelectedLineId(undefined);
        selectedTargetRef.current = undefined;
        persistSession({ viewedScriptPath: scriptPath });
      },
      selectLine(lineId) {
        setSelectedLineId(lineId);
        selectedTargetRef.current = lineModel.anchorByLineId.get(lineId);
      },
      previewLine,
      pinCurrent() {
        if (hostCommitInFlightRef.current !== undefined) {
          setStatus({ phase: "blocked", message: "An accepted atomic restore is still settling; pin after it completes." });
          return;
        }
        if (
          !inspection
          || !canPinCurrentVnDevtoolsInspection(inspectionDisplay, entry)
        ) {
          setStatus({
            phase: "blocked",
            message: "The displayed source is not the installed runtime mapping, so the current position cannot be pinned."
          });
          return;
        }
        const anchor = lineModel.currentAnchor && inspection
          ? resolveVnDebugFinalTextStageAnchor(inspection, lineModel.currentAnchor) ?? lineModel.currentAnchor
          : lineModel.currentAnchor;
        if (!anchor || !runtime.shell.interactionFacts.isAtStableStop) {
          setStatus({ phase: "blocked", message: "The current runtime position is not a stable checkpoint." });
          return;
        }
        const checkpoint = runtime.lifecycle.createVnSaveCheckpoint({ allowInactive: true });
        if (!checkpoint.ok) {
          setStatus({ phase: "blocked", message: checkpoint.message });
          return;
        }
        latestTasksRef.current.cancel();
        fixedPointCoordinatorRef.current!.replace(anchor, checkpoint.value);
        setStatus({ phase: "ready", message: "Current stable runtime position pinned without changing the game." });
      },
      unpin() {
        const restoreStillSettling = hostCommitInFlightRef.current !== undefined;
        latestTasksRef.current.cancel();
        fixedPointCoordinatorRef.current!.replace(undefined, undefined);
        setStatus({
          phase: "ready",
          message: restoreStillSettling
            ? "Pinned return point cleared. The already-accepted atomic restore will still finish."
            : "Pinned return point cleared."
        });
      },
      setCollapsed(next) {
        setCollapsed(next);
        if (!next) setHasUpdateBadge(false);
        persistSession({ collapsed: next });
      },
      resize(next) {
        setWidth(next);
        persistSession({ width: next });
      },
      updateLayout,
      search: setSearchQuery,
      setMaterializationMode(nextMode) {
        if (nextMode === materializationMode) return;
        if (hostCommitInFlightRef.current !== undefined) {
          setStatus({
            phase: "blocked",
            message: "The accepted host restore must finish before changing debug modes."
          });
          return;
        }
        latestTasksRef.current.cancel();
        scriptAuthority.cancelTasks();
        installedMaterializationProvenanceRef.current = undefined;
        setPendingDecision(undefined);
        setDecisions(EMPTY_VN_DEBUG_DECISION_TRACE);
        fixedPointCoordinatorRef.current!.replace(undefined, undefined);
        setMaterializationMode(nextMode);
        const previewAllowed = canMaterializeVnDevtoolsInspection(inspectionDisplay, nextMode);
        scriptAuthority.authorizePreview(entry.source.scriptPath, previewAllowed);
        persistSession({
          materializationMode: nextMode,
          pinnedTarget: null,
          decisions: EMPTY_VN_DEBUG_DECISION_TRACE
        });
        setStatus({
          phase: "ready",
          message: nextMode === "fast-current-script"
            ? "FastDebug enabled. The next Preview will cold-start from the current script."
            : "Entry mode enabled. The next Preview will replay from the canonical entry."
        });
        if (nextMode === "canonical-entry" && inspectionDisplay?.access === "verified-local") {
          const task = latestTasksRef.current.begin();
          scriptAuthority.freezePreview(entry.source.scriptPath);
          setStatus({
            phase: "inspecting",
            message: "Validating the complete catalog for Entry replay.",
            cancellable: true
          });
          const candidate = candidateFromVnDebugInspection(entry, inspectionDisplay.inspection);
          void validateVnDevtoolsCandidateCatalog(candidate).then((validation) => {
            if (!task.isCurrent()) return;
            if (!validation.ok) {
              setStatus({
                phase: validation.code === "revision-mismatch" ? "blocked" : "error",
                message: `Entry replay remains unavailable (${validation.message})`
              });
              return;
            }
            const verified = createCatalogVerifiedVnDevtoolsInspectionDisplay(
              inspectionDisplay.inspection,
              inspectionDisplay.expectedRevision
            );
            const nextStatus: VnDevtoolsStatus = {
              phase: "ready",
              message: "Entry mode enabled and the complete catalog is verified."
            };
            scriptAuthority.authorizePreview(entry.source.scriptPath);
            scriptAuthority.cache(entry.source.scriptPath, {
              display: verified,
              diagnostics: bridgeDiagnostics,
              status: nextStatus
            });
            setInspectionDisplay(verified);
            setStatus(nextStatus);
          }).catch((error: unknown) => {
            if (!task.isCurrent()) return;
            setStatus({
              phase: "error",
              message: error instanceof Error
                ? `Entry catalog validation failed (${error.message}).`
                : "Entry catalog validation failed."
            });
          });
        }
      },
      submitDecision,
      cancelDecision() {
        const restoreStillSettling = hostCommitInFlightRef.current !== undefined;
        latestTasksRef.current.cancel();
        setPendingDecision(undefined);
        setStatus({
          phase: "blocked",
          message: restoreStillSettling
            ? "Decision task cancelled. The already-accepted atomic restore will still finish."
            : "Decision cancelled; no game state was changed."
        });
      },
      cancelCandidate() {
        const restoreStillSettling = hostCommitInFlightRef.current !== undefined;
        latestTasksRef.current.cancel();
        setPendingDecision(undefined);
        const reauthorizeInstalledSource = canReauthorizeVnDevtoolsInspection(inspectionDisplay, entry);
        scriptAuthority.authorizePreview(entry.source.scriptPath, reauthorizeInstalledSource);
        if (reauthorizeInstalledSource && inspection) {
          setInspectionDisplay(createCatalogVerifiedVnDevtoolsInspectionDisplay(inspection));
        }
        setStatus({
          phase: "blocked",
          message: restoreStillSettling
            ? "Candidate task cancelled. The already-accepted atomic restore will still finish."
            : "Candidate task cancelled; the running game was not changed."
        });
      },
      copyLocation(location) {
        const value = `${location.scriptPath}:${location.lineNumber}`;
        void Promise.resolve().then(async () => {
          if (copyText) {
            await copyText(value);
          } else if (typeof navigator !== "undefined" && navigator.clipboard) {
            await navigator.clipboard.writeText(value);
          } else {
            throw new Error("Clipboard access is unavailable");
          }
          setStatus({ phase: "ready", message: `Copied ${value}.` });
        }).catch((error: unknown) => {
          setStatus({
            phase: "error",
            message: error instanceof Error
              ? `Could not copy the source location (${error.message}).`
              : "Could not copy the source location."
          });
        });
      }
    }
  };
}

function createLineModel(
  inspection: VnDebugScriptInspection | undefined,
  previewAuthorized: boolean,
  mapsInstalledScript: boolean,
  runtimeActive: boolean,
  instructionPointer: number,
  pinnedTarget: VnDebugTargetAnchor | undefined,
  diagnostics: readonly VnDevtoolsDiagnostic[]
): {
  lines: VnDevtoolsSourceLine[];
  anchorByLineId: Map<string, VnDebugTargetAnchor>;
  currentAnchor?: VnDebugTargetAnchor;
} {
  if (!inspection) return { lines: [], anchorByLineId: new Map() };
  const currentAnchor = resolveCurrentVnDevtoolsAnchor({
    inspection,
    instructionPointer,
    mapsInstalledScript,
    runtimeActive
  });
  const anchorByLineId = new Map<string, VnDebugTargetAnchor>();
  const labelsByLine = new Map(inspection.labels.map((label) => [label.line, label.name]));
  const commandByIndex = new Map(inspection.commands.map((command) => [command.anchor.commandIndex, command]));
  const diagnosticsByLine = new Map<string, VnDevtoolsDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    if (!diagnostic.lineId) continue;
    const sourceRange = diagnostic.lineNumber === undefined
      ? undefined
      : resolveVnDevtoolsLineRange(
          inspection.source.sourceText,
          diagnostic.lineNumber,
          diagnostic.span
        );
    const renderedDiagnostic = {
      ...diagnostic,
      ...(sourceRange ? { sourceRange } : {})
    } satisfies VnDevtoolsDiagnostic;
    diagnosticsByLine.set(
      diagnostic.lineId,
      [...(diagnosticsByLine.get(diagnostic.lineId) ?? []), renderedDiagnostic]
    );
  }
  const lines = inspection.sourceLines.map((sourceLine) => {
    const lineId = `line-${sourceLine.line}`;
    const commandAnchors = sourceLine.anchors.filter((candidate) => candidate.kind === "command");
    const anchor = commandAnchors.find((candidate) => {
      const stage = commandByIndex.get(candidate.commandIndex)?.command.textStage;
      return Boolean(stage && stage.index === stage.count - 1);
    }) ?? commandAnchors[0] ?? sourceLine.anchors[0];
    if (anchor) anchorByLineId.set(lineId, anchor);
    const command = anchor?.kind === "command" ? commandByIndex.get(anchor.commandIndex) : undefined;
    const label = labelsByLine.get(sourceLine.line);
    const lineDiagnostics = diagnosticsByLine.get(lineId);
    return {
      id: lineId,
      lineNumber: sourceLine.line,
      sourceText: sourceLine.text,
      ...(label ? { label } : {}),
      ...(command ? { command: `@${command.command.canonicalName}` } : {}),
      previewability: previewAuthorized ? mapPreviewability(sourceLine.previewability) : "blocked",
      current: Boolean(currentAnchor && sourceLine.anchors.some((candidate) => anchorsEqual(candidate, currentAnchor))),
      pinned: Boolean(
        mapsInstalledScript
        && pinnedTarget
        && sourceLine.anchors.some((candidate) => anchorsEqual(candidate, pinnedTarget))
      ),
      ...(lineDiagnostics?.length ? { diagnostics: lineDiagnostics } : {})
    } satisfies VnDevtoolsSourceLine;
  });
  return { lines, anchorByLineId, ...(currentAnchor ? { currentAnchor } : {}) };
}

function mapPreviewability(previewability: VnDebugScriptInspection["sourceLines"][number]["previewability"]): VnDevtoolsLinePreviewability {
  if (previewability === "stable") return "previewable";
  if (previewability === "decision") return "decision-required";
  return previewability ?? "no-stable-result";
}

function toDockDecision(result: VnDebugMaterializationDecisionRequired): VnDevtoolsDecision {
  const request = result.decision;
  const id = anchorIdentity(request.anchor);
  if (request.kind === "choice") {
    return {
      kind: "choice",
      id,
      prompt: "Choose the branch used only for this browser tab.",
      options: request.choices.map((choice, index) => ({
        id: choice.id ?? String(index),
        label: choice.text,
        enabled: choice.enabled !== false,
        ...(choice.goto ? { detail: `goto #${choice.goto}` } : {})
      }))
    };
  }
  return {
    kind: "input",
    id,
    prompt: request.summary ?? `Value for ${request.variableName}`,
    variableName: request.variableName,
    inputType: request.valueType === "string" ? "text" : request.valueType,
    ...(request.defaultValue !== undefined ? { defaultValue: String(request.defaultValue) } : {})
  };
}

function createDiagnostics(
  inspection: VnDebugScriptInspection | undefined,
  runtimeDiagnostics: readonly {
    code: string;
    severity: "info" | "warning" | "error";
    message: string;
    loc?: string;
    span?: VnDevtoolsDiagnostic["span"];
  }[],
  bridgeDiagnostics: readonly VnDevtoolsDiagnostic[]
): VnDevtoolsDiagnostic[] {
  const runtime = [...(inspection?.diagnostics ?? []), ...runtimeDiagnostics].map((diagnostic, index) => {
    const location = diagnostic.loc?.match(/:(\d+):(\d+)$/u);
    const lineNumber = location ? Number(location[1]) : undefined;
    const columnNumber = location ? Number(location[2]) : undefined;
    return {
      id: `${diagnostic.code}:${index}:${diagnostic.message}`,
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      ...(diagnostic.span ? { span: diagnostic.span } : {}),
      ...(columnNumber !== undefined ? { columnNumber } : {}),
      ...(lineNumber !== undefined ? { lineNumber, lineId: `line-${lineNumber}` } : {})
    } satisfies VnDevtoolsDiagnostic;
  });
  return mergeVnDevtoolsDiagnostics(bridgeDiagnostics, runtime);
}

function toBridgeDiagnostics(
  diagnostics: readonly NaniDevtoolsViteDiagnostic[],
  candidateId: string
): VnDevtoolsDiagnostic[] {
  return diagnostics.map((diagnostic, index) => ({
    id: `bridge:${candidateId}:${index}`,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.code ? { code: diagnostic.code } : {}),
    ...(diagnostic.columnNumber !== undefined ? { columnNumber: diagnostic.columnNumber } : {}),
    ...(diagnostic.span ? { span: diagnostic.span } : {}),
    ...(diagnostic.lineNumber !== undefined
      ? { lineNumber: diagnostic.lineNumber, lineId: `line-${diagnostic.lineNumber}` }
      : {})
  }));
}

function initialCandidateFailureMessage(
  reason: "invalid-source" | "revision-mismatch" | "catalog-link-error" | "identity-mismatch"
): string {
  if (reason === "invalid-source") {
    return "The current server source has errors. Initial restore and adoption are disabled.";
  }
  if (reason === "revision-mismatch") {
    return "Server and browser computed different initial revisions; refusing to restore or adopt the source.";
  }
  if (reason === "identity-mismatch") {
    return "The initial server source does not identify the active entry; restore and adoption are disabled.";
  }
  return "The verified initial scripts do not form a linkable runtime catalog; restore and adoption are disabled.";
}

function createSummaries(
  runtime: VnDevtoolsRuntimeObservation,
  lastCheckpoint: SaveableVnState | undefined,
  materializationMode: VnDebugMaterializationMode,
  lastMaterialization: {
    provenance: VnDebugMaterializationProvenance;
    executedInstructions: number;
    executedScriptPaths: readonly string[];
  } | undefined,
  inspection: VnDebugScriptInspection | undefined
): VnDevtoolsRuntimeSummaries {
  const story = runtime.shell.storyRuntime.state;
  const pixi = runtime.presentation.pixiStageRuntime.snapshot;
  const checkpoint = runtime.lifecycle.createVnSaveCheckpoint({ allowInactive: true });
  const stableCheckpoint = checkpoint.ok ? checkpoint.value : lastCheckpoint;
  const currentStage = inspection?.source.scriptPath === story.currentScriptPath
    ? inspection.script.commands[story.instructionPointer - 1]?.textStage
    : undefined;
  return {
    story: [
      {
        label: "preview mode",
        value: materializationMode === "fast-current-script" ? "FAST" : "ENTRY",
        tone: "accent"
      },
      { label: "installed origin", value: lastMaterialization?.provenance.originScriptPath ?? null },
      { label: "origin pointer", value: lastMaterialization?.provenance.originInstructionPointer ?? null },
      { label: "executed instructions", value: lastMaterialization?.executedInstructions ?? null },
      { label: "executed scripts", value: lastMaterialization?.executedScriptPaths.join(", ") ?? null },
      { label: "pointer", value: story.instructionPointer },
      ...(currentStage ? [{ label: "stage", value: `${currentStage.index + 1}/${currentStage.count}` }] : []),
      { label: "variables", value: Object.keys(story.variables).length },
      { label: "choices", value: story.pendingChoices.length },
      { label: "text", value: story.text?.current?.text ?? null },
      { label: "left pinned point", value: Boolean(lastCheckpoint && story.instructionPointer !== lastCheckpoint.story.instructionPointer), tone: "warning" }
    ],
    pixi: [
      { label: "revision", value: pixi.revision },
      { label: "backgrounds", value: Object.keys(pixi.backgroundsById).length },
      { label: "characters", value: Object.keys(pixi.charactersById).length },
      { label: "weather", value: Object.keys(pixi.weather).join(", ") || null }
    ],
    ui: Object.entries(runtime.shell.uiRuntime.state.surfaces).map(([label, surface]) => ({ label, value: surface.targetVisible })),
    media: stableCheckpoint
      ? [
          { label: "bgm groups", value: Object.keys(stableCheckpoint.media.bgmByGroup).join(", ") || null },
          { label: "looping sfx", value: Object.keys(stableCheckpoint.media.loopingSfxByKey).join(", ") || null }
        ]
      : []
  };
}

function restoreDecisions(values: readonly VnDevtoolsPersistedDecision[] | undefined): VnDebugDecisionTrace {
  if (!values) return EMPTY_VN_DEBUG_DECISION_TRACE;
  return { choices: values.filter(isChoiceDecision), inputs: values.filter(isInputDecision) };
}

function isChoiceDecision(value: VnDevtoolsPersistedDecision): value is VnDebugChoiceDecision {
  return "text" in value;
}

function isInputDecision(value: VnDevtoolsPersistedDecision): value is VnDebugInputDecision {
  return "value" in value;
}

function anchorsEqual(left: VnDebugTargetAnchor, right: VnDebugTargetAnchor): boolean {
  return vnDebugAnchorsEqual(left, right);
}

function anchorIdentity(anchor: VnDebugTargetAnchor): string {
  return vnDebugAnchorIdentity(anchor);
}

function scriptCandidateIdentity(value: VnDevtoolsScriptCandidate | VnDebugScriptInspection): string {
  return vnDebugScriptIdentity(value);
}
