export type VnDevtoolsCandidatePlan =
  | { kind: "retain-last-known-good"; reason: "invalid-source" | "revision-mismatch" }
  | { kind: "refresh-source-mapping" }
  | { kind: "materialize-pinned-target" }
  | { kind: "adopt-for-next-start" }
  | { kind: "require-preview-target" };

export interface PlanVnDevtoolsCandidateInput {
  serverRevision: string | null;
  browserRevision: string;
  activeRevision: string;
  canMaterialize: boolean;
  hasPinnedTarget: boolean;
  vnActive: boolean;
}

export function shouldAdoptCanonicalInitialEntry(input: {
  canMaterialize: boolean;
  declaredRevisionMatches: boolean;
  hasPinnedTarget: boolean;
  vnActive: boolean;
}): boolean {
  return input.canMaterialize
    && !input.declaredRevisionMatches
    && !input.hasPinnedTarget
    && !input.vnActive;
}

export function planVnDevtoolsCandidate({
  activeRevision,
  browserRevision,
  canMaterialize,
  hasPinnedTarget,
  serverRevision,
  vnActive
}: PlanVnDevtoolsCandidateInput): VnDevtoolsCandidatePlan {
  if (!serverRevision || !canMaterialize) {
    return { kind: "retain-last-known-good", reason: "invalid-source" };
  }
  if (browserRevision !== serverRevision) {
    return { kind: "retain-last-known-good", reason: "revision-mismatch" };
  }
  if (serverRevision === activeRevision) return { kind: "refresh-source-mapping" };
  if (hasPinnedTarget) return { kind: "materialize-pinned-target" };
  if (!vnActive) return { kind: "adopt-for-next-start" };
  return { kind: "require-preview-target" };
}

export interface VnDevtoolsLatestTask {
  generation: number;
  signal: AbortSignal;
  isCurrent(): boolean;
}

export interface VnDevtoolsLatestTaskController {
  begin(): VnDevtoolsLatestTask;
  cancel(): void;
}

export interface VnDevtoolsSerialCommitQueue<T> {
  enqueue(value: T, signal: AbortSignal): Promise<boolean>;
}

export interface VnDevtoolsMonotonicUpdateGate {
  accept(updateId: number): boolean;
  current(): number;
}

/**
 * Owns the one in-flight inspection/materialization task. Beginning a newer
 * task aborts the previous signal and makes all of its eventual results stale.
 */
export function createVnDevtoolsLatestTaskController(): VnDevtoolsLatestTaskController {
  let generation = 0;
  let abortController: AbortController | undefined;
  return {
    begin() {
      generation += 1;
      abortController?.abort();
      abortController = new AbortController();
      const taskGeneration = generation;
      return {
        generation: taskGeneration,
        signal: abortController.signal,
        isCurrent: () => taskGeneration === generation && !abortController?.signal.aborted
      };
    },
    cancel() {
      generation += 1;
      abortController?.abort();
      abortController = undefined;
    }
  };
}

export function createVnDevtoolsMonotonicUpdateGate(initialUpdateId = 0): VnDevtoolsMonotonicUpdateGate {
  let latestUpdateId = initialUpdateId;
  return {
    accept(updateId) {
      if (!Number.isSafeInteger(updateId) || updateId <= latestUpdateId) return false;
      latestUpdateId = updateId;
      return true;
    },
    current: () => latestUpdateId
  };
}

/**
 * Serializes host commits. Entries whose task was superseded while waiting are
 * skipped, while a commit already accepted by the host is allowed to finish
 * atomically before the newest entry starts.
 */
export function createVnDevtoolsSerialCommitQueue<T>(
  install: (value: T, signal: AbortSignal) => Promise<boolean>
): VnDevtoolsSerialCommitQueue<T> {
  let tail: Promise<void> = Promise.resolve();
  return {
    enqueue(value, signal) {
      const result = tail.then(() => signal.aborted ? false : install(value, signal));
      tail = result.then(() => undefined, () => undefined);
      return result;
    }
  };
}
