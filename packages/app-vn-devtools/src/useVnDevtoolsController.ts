import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  VnDiagnosticsPort,
  VnLifecyclePort,
  VnPresentationPort,
  VnRuntimeShellPort
} from "@v-ronpa/app-vn-runtime";
import {
  EMPTY_VN_DEBUG_DECISION_TRACE,
  inspectVnDebugEntry,
  materializeVnDebugTarget,
  type VnDebugDecisionTrace,
  type VnDebugChoiceDecision,
  type VnDebugEntryInspection,
  type VnDebugInputDecision,
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
  isVnDevtoolsUpdateRuntimeActive,
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
  createInstallableVnDevtoolsInspectionDisplay,
  createReadOnlyVnDevtoolsInspectionDisplay,
  createVnDevtoolsPreviewAuthorization,
  resolveCurrentVnDevtoolsAnchor,
  vnDebugAnchorIdentity,
  vnDebugAnchorsEqual,
  vnDebugEntryIdentity,
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
  type VnDevtoolsScriptCandidate
} from "./scriptCandidate";

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
  inspection: VnDebugEntryInspection;
  target: VnDebugTargetAnchor;
  expectedRevision?: string;
}

type VnDevtoolsHostMutation =
  | { kind: "adopt"; entry: VnDevtoolsScriptCandidate }
  | {
      kind: "commit";
      entry: VnDevtoolsScriptCandidate;
      checkpoint: SaveableVnState;
      onAccepted: () => void;
    };

interface VnDevtoolsSessionSnapshot {
  collapsed: boolean;
  width: number;
  layout: VnDevtoolsLayoutState;
  pinnedTarget?: VnDebugTargetAnchor;
  decisions: VnDebugDecisionTrace;
  viewedScriptPath: string;
}

interface CachedVnDevtoolsScriptDisplay {
  display: VnDevtoolsInspectionDisplay;
  diagnostics: VnDevtoolsDiagnostic[];
  status: VnDevtoolsStatus;
}

/**
 * Reusable controller for source inspection, latest-wins updates, decisions,
 * stable materialization, and tab-local workbench state. Apps retain only the
 * atomic entry/checkpoint commit and flow transition.
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
  const [updatedScriptPaths, setUpdatedScriptPaths] = useState<ReadonlySet<string>>(() => new Set());
  const [bridgeDiagnostics, setBridgeDiagnostics] = useState<VnDevtoolsDiagnostic[]>([]);
  const cachedScriptDisplaysRef = useRef(new Map<string, CachedVnDevtoolsScriptDisplay>());
  const viewedScriptPathRef = useRef(viewedScriptPath);
  viewedScriptPathRef.current = viewedScriptPath;
  const runtimeScriptHistoryRef = useRef({
    storySession: runtime.presentation.storySession,
    paths: new Set<string>()
  });
  if (runtimeScriptHistoryRef.current.storySession !== runtime.presentation.storySession) {
    runtimeScriptHistoryRef.current = {
      storySession: runtime.presentation.storySession,
      paths: new Set<string>()
    };
  }
  if (vnActive) {
    runtimeScriptHistoryRef.current.paths.add(runtime.shell.storyRuntime.state.currentScriptPath);
  } else {
    runtimeScriptHistoryRef.current.paths.clear();
  }
  const previewAuthorizationRef = useRef(createVnDevtoolsPreviewAuthorization());
  const latestTasksRef = useRef(createVnDevtoolsLatestTaskController());
  const updateGateRef = useRef(createVnDevtoolsMonotonicUpdateGate());
  const adoptCandidateRef = useRef(adoptCandidate);
  adoptCandidateRef.current = adoptCandidate;
  const commitCandidateRef = useRef(commitCandidate);
  commitCandidateRef.current = commitCandidate;
  const hostMutationQueueRef = useRef(createVnDevtoolsSerialCommitQueue<VnDevtoolsHostMutation>(
    (value, signal) => {
      if (value.kind === "adopt") return Promise.resolve(adoptCandidateRef.current(value.entry, signal));
      return commitCandidateRef.current(value.entry, value.checkpoint, signal, value.onAccepted);
    }
  ));
  const initializedEntriesRef = useRef(new Map<string, string>());
  const expectedHostEntryIdentitiesRef = useRef(new Set<string>());
  const hostCommitInFlightRef = useRef<number | undefined>(undefined);
  const selectedTargetRef = useRef<VnDebugTargetAnchor | undefined>(undefined);
  const selectionInspectionRef = useRef<VnDebugEntryInspection | undefined>(undefined);
  const sessionSnapshotRef = useRef<VnDevtoolsSessionSnapshot>({
    collapsed: initialSession.collapsed,
    width: initialSession.width,
    layout: initialSession.layout,
    viewedScriptPath,
    ...(initialSession.pinnedTarget ? { pinnedTarget: initialSession.pinnedTarget } : {}),
    decisions: restoreDecisions(initialSession.decisions)
  });
  sessionSnapshotRef.current = {
    collapsed,
    width,
    layout,
    viewedScriptPath,
    ...(pinnedTarget ? { pinnedTarget } : {}),
    decisions
  };

  const persistSession = useCallback((next?: {
    collapsed?: boolean;
    width?: number;
    layout?: Partial<VnDevtoolsLayoutState>;
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
      viewedScriptPath: next?.viewedScriptPath ?? current.viewedScriptPath,
      ...(nextPinnedTarget ? { pinnedTarget: nextPinnedTarget } : {}),
      decisions: next?.decisions ?? current.decisions
    };
    sessionSnapshotRef.current = snapshot;
    saveVnDevtoolsSessionState(storage, sessionKey, {
      collapsed: snapshot.collapsed,
      width: snapshot.width,
      layout: snapshot.layout,
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
    candidateInspection: VnDebugEntryInspection;
    result: Extract<Awaited<ReturnType<typeof materializeVnDebugTarget>>, { status: "ready" }>;
    task: ReturnType<ReturnType<typeof createVnDevtoolsLatestTaskController>["begin"]>;
    updateId?: number;
    message: string;
    expectedRevision?: string;
  }) => {
    if (!task.isCurrent()) return;
    const candidatePath = candidateInspection.source.scriptPath;
    const previousInitializedIdentity = initializedEntriesRef.current.get(candidatePath);
    const candidate = candidateFromVnDebugInspection(entry, candidateInspection);
    const candidateIdentity = entryIdentity(candidate);
    let acceptedFixedPoint: VnDevtoolsAcceptedFixedPoint<VnDebugTargetAnchor, SaveableVnState> | undefined;
    let hostError: unknown;
    // Mark the candidate before the host renders it so the entry-observation
    // effect cannot start a duplicate restore during the atomic commit window.
    initializedEntriesRef.current.set(candidatePath, candidateIdentity);
    expectedHostEntryIdentitiesRef.current.add(candidateIdentity);
    let committed = false;
    try {
      committed = await hostMutationQueueRef.current.enqueue({
        kind: "commit",
        entry: candidate,
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
      expectedHostEntryIdentitiesRef.current.delete(candidateIdentity);
      if (acceptedFixedPoint) fixedPointCoordinatorRef.current!.rollback(acceptedFixedPoint);
      if (initializedEntriesRef.current.get(candidatePath) === candidateIdentity) {
        if (previousInitializedIdentity) {
          initializedEntriesRef.current.set(candidatePath, previousInitializedIdentity);
        } else {
          initializedEntriesRef.current.delete(candidatePath);
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
    if (!task.isCurrent()) return;
    const installedDisplay = createInstallableVnDevtoolsInspectionDisplay(candidateInspection, expectedRevision);
    const nextStatus: VnDevtoolsStatus = {
      phase: "ready",
      message,
      degraded: result.degraded,
      ...(updateId !== undefined ? { updateId } : {})
    };
    cachedScriptDisplaysRef.current.set(candidatePath, {
      display: installedDisplay,
      diagnostics: [],
      status: nextStatus
    });
    if (candidatePath === viewedScriptPathRef.current) {
      previewAuthorizationRef.current.authorize();
      setInspectionDisplay(installedDisplay);
      setHasUpdateBadge(false);
      setUpdatedScriptPaths((current) => {
        const next = new Set(current);
        next.delete(candidatePath);
        return next;
      });
    }
    setStatus(nextStatus);
  }, [entry, installFixedPoint]);

  const handleMaterializationResult = useCallback(async ({
    candidateInspection,
    expectedRevision,
    result,
    task,
    updateId
  }: {
    candidateInspection: VnDebugEntryInspection;
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
    candidateInspection: VnDebugEntryInspection;
    expectedRevision?: string;
    target: VnDebugTargetAnchor;
    updateId?: number;
  }) => {
    const task = latestTasksRef.current.begin();
    setPendingDecision(undefined);
    setStatus({
      phase: "materializing",
      message: "Replaying from the canonical entry without side effects.",
      cancellable: true,
      ...(updateId !== undefined ? { updateId } : {})
    });
    const result = await materializeVnDebugTarget({
      entry: candidateInspection.entry,
      catalog: candidateFromVnDebugInspection(entry, candidateInspection).catalog,
      inspection: candidateInspection,
      target,
      decisions: sessionSnapshotRef.current.decisions,
      ...(expectedRevision ? { expectedRevision } : {}),
      signal: task.signal
    }).catch((error: unknown) => {
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
  }, [entry, handleMaterializationResult]);

  useEffect(() => {
    const identity = entryIdentity(entry);
    if (expectedHostEntryIdentitiesRef.current.delete(identity)) {
      initializedEntriesRef.current.set(entry.source.scriptPath, identity);
      return;
    }
    if (initializedEntriesRef.current.get(entry.source.scriptPath) === identity) return;
    const task = latestTasksRef.current.begin();
    const persistedTarget = persistedTargetRestoreCompletedRef.current
      ? undefined
      : initialSession.pinnedTarget;
    previewAuthorizationRef.current.freeze();
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
        vnActive,
        signal: task.signal
      }).then(async (prepared) => {
        if (!task.isCurrent()) return;
        persistedTargetRestoreCompletedRef.current = true;
        initializedEntriesRef.current.set(entry.source.scriptPath, identity);
        if (prepared.kind === "retain-read-only") {
          previewAuthorizationRef.current.freeze();
          setInspectionDisplay(createReadOnlyVnDevtoolsInspectionDisplay(prepared.inspection));
          setStatus({
            phase: prepared.reason === "invalid-source" || prepared.reason === "catalog-link-error"
              ? "error"
              : "blocked",
            message: prepared.message ?? initialCandidateFailureMessage(prepared.reason),
            degraded: prepared.inspection.degraded
          });
          return;
        }
        if (prepared.kind === "materialize-pinned-target") {
          previewAuthorizationRef.current.authorize();
          setInspectionDisplay(createInstallableVnDevtoolsInspectionDisplay(
            prepared.inspection,
            prepared.expectedRevision
          ));
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
          const candidateIdentity = entryIdentity(candidate);
          expectedHostEntryIdentitiesRef.current.add(candidateIdentity);
          const adopted = await hostMutationQueueRef.current.enqueue({
            kind: "adopt",
            entry: candidate
          }, task.signal);
          if (!adopted) expectedHostEntryIdentitiesRef.current.delete(candidateIdentity);
          if (!task.isCurrent()) return;
          if (!adopted) {
            setInspectionDisplay(createReadOnlyVnDevtoolsInspectionDisplay(prepared.inspection));
            setStatus({
              phase: "blocked",
              message: "The host rejected the verified initial source; the previous entry remains installed.",
              degraded: prepared.inspection.degraded
            });
            return;
          }
          initializedEntriesRef.current.set(candidate.source.scriptPath, candidateIdentity);
          previewAuthorizationRef.current.authorize();
          setInspectionDisplay(createInstallableVnDevtoolsInspectionDisplay(
            prepared.inspection,
            prepared.expectedRevision
          ));
          setStatus({
            phase: "ready",
            message: "Verified initial source adopted for the next New Game.",
            degraded: prepared.inspection.degraded
          });
          return;
        }
        previewAuthorizationRef.current.authorize();
        setInspectionDisplay(createInstallableVnDevtoolsInspectionDisplay(
          prepared.inspection,
          prepared.expectedRevision
        ));
        setStatus(prepared.kind === "require-preview-target"
          ? {
              phase: "blocked",
              message: "The verified initial source changed while VN is active. Preview a line before installing it.",
              degraded: prepared.inspection.degraded
            }
          : {
              phase: "ready",
              message: "Initial source revision verified by the server and browser. Choose a line and press Preview.",
              degraded: prepared.inspection.degraded
            });
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
      void inspectVnDebugEntry(entry.entry, entry.source).then((nextInspection) => {
        if (!task.isCurrent()) return;
        persistedTargetRestoreCompletedRef.current = true;
        initializedEntriesRef.current.set(entry.source.scriptPath, identity);
        previewAuthorizationRef.current.freeze();
        setInspectionDisplay(createReadOnlyVnDevtoolsInspectionDisplay(nextInspection));
        setStatus({
          phase: "blocked",
          message: "The Vite server did not provide an initial source handshake; restore and adoption are disabled."
        });
      });
      return;
    }
    void inspectVnDebugEntry(entry.entry, entry.source).then(async (nextInspection) => {
      if (!task.isCurrent()) return;
      persistedTargetRestoreCompletedRef.current = true;
      initializedEntriesRef.current.set(entry.source.scriptPath, identity);
      previewAuthorizationRef.current.authorize(nextInspection.canMaterialize);
      setInspectionDisplay(nextInspection.canMaterialize
        ? createInstallableVnDevtoolsInspectionDisplay(nextInspection)
        : createReadOnlyVnDevtoolsInspectionDisplay(nextInspection));
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
          const candidateIdentity = entryIdentity(candidate);
          expectedHostEntryIdentitiesRef.current.add(candidateIdentity);
          const adopted = await hostMutationQueueRef.current.enqueue({
            kind: "adopt",
            entry: candidate
          }, task.signal);
          if (!adopted) expectedHostEntryIdentitiesRef.current.delete(candidateIdentity);
          if (!task.isCurrent()) return;
          if (!adopted) {
            setStatus({
              phase: "blocked",
              message: "The host rejected the canonical source revision; the previous entry remains installed.",
              degraded: nextInspection.degraded
            });
            return;
          }
          initializedEntriesRef.current.set(candidate.source.scriptPath, candidateIdentity);
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
  }, [entry, handleMaterializationResult, initialCandidate, initialSession.pinnedTarget, runMaterialization, updateSource, vnActive]);

  const handleSourceUpdate = useCallback((update: NaniDevtoolsViteUpdate) => {
      const updateCandidate = createVnDevtoolsScriptCandidate(entryDefinition, catalog, update.scriptPath);
      if (update.entryId !== entryDefinition.id || !updateCandidate) return;
      if (!updateGateRef.current.accept(update.updateId)) return;
      const updateIsViewed = update.scriptPath === viewedScriptPathRef.current;
      const markScriptUpdated = () => setUpdatedScriptPaths((current) => {
        const next = new Set(current);
        next.add(update.scriptPath);
        return next;
      });
      // Freeze synchronously. React may not have committed the read-only
      // display before a user click, so the ref is the authoritative guard
      // against previewing stale source while this updateId is being consumed.
      if (updateIsViewed) {
        previewAuthorizationRef.current.freeze();
        setInspectionDisplay((current) => current
          ? createReadOnlyVnDevtoolsInspectionDisplay(current.inspection)
          : current);
      }
      const task = latestTasksRef.current.begin();
      const updateDiagnostics = toBridgeDiagnostics(update.diagnostics, String(update.updateId));
      markScriptUpdated();
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
      void prepareVnDevtoolsCandidateUpdate({
        activeCandidate: updateCandidate,
        update,
        ...(fixedTarget ? { pinnedTarget: fixedTarget } : {}),
        decisions: sessionSnapshotRef.current.decisions,
        vnActive: isVnDevtoolsUpdateRuntimeActive({
          hasFixedPoint: Boolean(fixedTarget),
          runtimeScriptPath: runtime.shell.storyRuntime.state.currentScriptPath,
          runtimeVisitedScriptPaths: runtimeScriptHistoryRef.current.paths,
          updatedScriptPath: update.scriptPath,
          vnActive
        }),
        signal: task.signal
      }).then(async (prepared) => {
        if (!task.isCurrent()) return;
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
          cachedScriptDisplaysRef.current.set(update.scriptPath, {
            display,
            diagnostics: updateDiagnostics,
            status: nextStatus
          });
          if (updateIsViewed) {
            previewAuthorizationRef.current.freeze();
            setInspectionDisplay(display);
            setStatus(nextStatus);
          }
          return;
        }
        const candidateDisplay = createInstallableVnDevtoolsInspectionDisplay(
          prepared.inspection,
          prepared.expectedRevision
        );
        if (updateIsViewed) {
          previewAuthorizationRef.current.authorize();
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
              message: "The fixed point no longer has a unique source match; the last-known-good entry remains installed.",
              updateId: update.updateId
            };
            if (updateIsViewed) setStatus(nextStatus);
            return;
          }
          const candidate = candidateFromVnDebugInspection(updateCandidate, prepared.inspection);
          const candidateIdentity = entryIdentity(candidate);
          expectedHostEntryIdentitiesRef.current.add(candidateIdentity);
          const adopted = await hostMutationQueueRef.current.enqueue({
            kind: "adopt",
            entry: candidate
          }, task.signal);
          if (!adopted) expectedHostEntryIdentitiesRef.current.delete(candidateIdentity);
          if (!task.isCurrent()) return;
          if (!adopted) {
            const nextStatus: VnDevtoolsStatus = {
              phase: "blocked",
              message: "The host rejected the source mapping update; the last-known-good entry remains installed.",
              updateId: update.updateId
            };
            if (updateIsViewed) setStatus(nextStatus);
            return;
          }
          initializedEntriesRef.current.set(candidate.source.scriptPath, candidateIdentity);
          cachedScriptDisplaysRef.current.set(update.scriptPath, {
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
          if (updateIsViewed) {
            setStatus({ phase: "ready", message: "Source mapping updated; runtime presentation was not remounted.", updateId: update.updateId });
            setHasUpdateBadge(false);
            setUpdatedScriptPaths((current) => {
              const next = new Set(current);
              next.delete(update.scriptPath);
              return next;
            });
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
        if (prepared.kind === "adopt-for-next-start") {
          const candidate = candidateFromVnDebugInspection(updateCandidate, prepared.inspection);
          const candidateIdentity = entryIdentity(candidate);
          expectedHostEntryIdentitiesRef.current.add(candidateIdentity);
          const adopted = await hostMutationQueueRef.current.enqueue({
            kind: "adopt",
            entry: candidate
          }, task.signal);
          if (!adopted) expectedHostEntryIdentitiesRef.current.delete(candidateIdentity);
          if (!task.isCurrent()) return;
          if (!adopted) {
            const nextStatus: VnDevtoolsStatus = {
              phase: "blocked",
              message: "The host rejected the source update; the previous entry remains installed.",
              updateId: update.updateId
            };
            if (updateIsViewed) setStatus(nextStatus);
            return;
          }
          initializedEntriesRef.current.set(candidate.source.scriptPath, candidateIdentity);
          const nextStatus: VnDevtoolsStatus = {
            phase: "ready",
            message: updateIsViewed
              ? "New revision adopted for the next New Game."
              : "Updated script installed in the catalog for future navigation; the current session was unchanged.",
            updateId: update.updateId
          };
          cachedScriptDisplaysRef.current.set(update.scriptPath, {
            display: candidateDisplay,
            diagnostics: updateDiagnostics,
            status: nextStatus
          });
          if (updateIsViewed) {
            setStatus(nextStatus);
            setHasUpdateBadge(false);
            setUpdatedScriptPaths((current) => {
              const next = new Set(current);
              next.delete(update.scriptPath);
              return next;
            });
          }
          return;
        }
        if (updateIsViewed) setStatus({
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
        if (updateIsViewed) setStatus(nextStatus);
      });
  }, [catalog, collapsed, entryDefinition, handleMaterializationResult, runtime.shell.storyRuntime.state.currentScriptPath, vnActive]);
  const handleSourceUpdateRef = useRef(handleSourceUpdate);
  handleSourceUpdateRef.current = handleSourceUpdate;

  useEffect(() => {
    if (!updateSource) return;
    return updateSource.subscribe((update) => handleSourceUpdateRef.current(update));
  }, [updateSource]);

  useEffect(() => () => latestTasksRef.current.cancel(), []);

  const diagnostics = useMemo(
    () => createDiagnostics(inspection, runtime.diagnostics.runtimeDiagnostics, bridgeDiagnostics),
    [bridgeDiagnostics, inspection, runtime.diagnostics.runtimeDiagnostics]
  );
  const lineModel = useMemo(
    () => createLineModel(
      inspection,
      canMaterializeVnDevtoolsInspection(inspectionDisplay),
      Boolean(
        inspection
        && inspection.source.scriptPath === runtime.shell.storyRuntime.state.currentScriptPath
        && vnDebugEntryIdentity(inspection) === vnDebugEntryIdentity(entry)
      ),
      runtime.shell.storyRuntime.active,
      runtime.shell.storyRuntime.state.instructionPointer,
      pinnedTarget,
      diagnostics
    ),
    [diagnostics, entry, inspection, inspectionDisplay?.access, pinnedTarget, runtime.shell.storyRuntime.active, runtime.shell.storyRuntime.state.currentScriptPath, runtime.shell.storyRuntime.state.instructionPointer]
  );
  const decision = useMemo(() => pendingDecision ? toDockDecision(pendingDecision.result) : undefined, [pendingDecision]);
  const summaries = useMemo(() => createSummaries(runtime, lastCheckpoint), [lastCheckpoint, runtime]);
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
    if (!previewAuthorizationRef.current.isAuthorized() || !inspection || !canMaterializeVnDevtoolsInspection(inspectionDisplay)) {
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
  }, [inspection, inspectionDisplay, lineModel.anchorByLineId, runMaterialization, updateLayout]);

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
    void materializeVnDebugTarget({
      entry: context.inspection.entry,
      catalog: candidateFromVnDebugInspection(entry, context.inspection).catalog,
      inspection: context.inspection,
      target: context.target,
      decisions: next,
      ...(context.expectedRevision ? { expectedRevision: context.expectedRevision } : {}),
      signal: task.signal
    }).then(async (result) => {
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
        : cachedScriptDisplaysRef.current.get(source.scriptPath)?.display.inspection.revision
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
    diagnostics,
    summaries,
    ...(decision ? { decision } : {}),
    hasUpdateBadge,
    actions: {
      selectScript(scriptPath) {
        if (!catalog.some((source) => source.scriptPath === scriptPath)) return;
        persistedTargetRestoreCompletedRef.current = true;
        latestTasksRef.current.cancel();
        const cached = cachedScriptDisplaysRef.current.get(scriptPath);
        if (cached) {
          const selectedCandidate = createVnDevtoolsScriptCandidate(entryDefinition, catalog, scriptPath);
          if (selectedCandidate) {
            initializedEntriesRef.current.set(scriptPath, entryIdentity(selectedCandidate));
          }
          previewAuthorizationRef.current.authorize(cached.display.access === "installable");
          setInspectionDisplay(cached.display);
          setBridgeDiagnostics(cached.diagnostics);
          setStatus(cached.status);
        } else {
          initializedEntriesRef.current.delete(scriptPath);
          previewAuthorizationRef.current.freeze();
          setInspectionDisplay(undefined);
          setBridgeDiagnostics([]);
          setStatus({ phase: "inspecting", message: "Inspecting selected Nani source.", cancellable: true });
        }
        setViewedScriptPath(scriptPath);
        setUpdatedScriptPaths((current) => {
          const next = new Set(current);
          next.delete(scriptPath);
          return next;
        });
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
        const anchor = lineModel.currentAnchor;
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
        previewAuthorizationRef.current.authorize(reauthorizeInstalledSource);
        if (reauthorizeInstalledSource && inspection) {
          setInspectionDisplay(createInstallableVnDevtoolsInspectionDisplay(inspection));
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
  inspection: VnDebugEntryInspection | undefined,
  previewAuthorized: boolean,
  mapsInstalledEntry: boolean,
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
    mapsInstalledEntry,
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
    const anchor = sourceLine.anchors.find((candidate) => candidate.kind === "command") ?? sourceLine.anchors[0];
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
        mapsInstalledEntry
        && pinnedTarget
        && sourceLine.anchors.some((candidate) => anchorsEqual(candidate, pinnedTarget))
      ),
      ...(lineDiagnostics?.length ? { diagnostics: lineDiagnostics } : {})
    } satisfies VnDevtoolsSourceLine;
  });
  return { lines, anchorByLineId, ...(currentAnchor ? { currentAnchor } : {}) };
}

function mapPreviewability(previewability: VnDebugEntryInspection["sourceLines"][number]["previewability"]): VnDevtoolsLinePreviewability {
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
  inspection: VnDebugEntryInspection | undefined,
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
  lastCheckpoint: SaveableVnState | undefined
): VnDevtoolsRuntimeSummaries {
  const story = runtime.shell.storyRuntime.state;
  const pixi = runtime.presentation.pixiStageRuntime.snapshot;
  const checkpoint = runtime.lifecycle.createVnSaveCheckpoint({ allowInactive: true });
  const stableCheckpoint = checkpoint.ok ? checkpoint.value : lastCheckpoint;
  return {
    story: [
      { label: "pointer", value: story.instructionPointer },
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

function entryIdentity(value: VnDevtoolsScriptCandidate | VnDebugEntryInspection): string {
  return vnDebugEntryIdentity(value);
}
