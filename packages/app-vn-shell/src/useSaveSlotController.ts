import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveData, SaveSlotSummary } from "@v-ronpa/contracts";
import {
  selectManualSaveSlotSummaries,
  selectQuickSaveSlotSummary,
  type SaveOperationError,
  type SavePort,
  type SaveSlotPolicy,
  type SaveSlotPreview
} from "@v-ronpa/media-save";
import type { SaveLoadActiveOperation, SaveLoadErrorViewModel, SaveSlotPreviewViewModel } from "./GameInteractionViewModels";

export interface SaveSlotControllerOptions {
  port: SavePort;
  policy: SaveSlotPolicy;
  collectSaveData: () => SaveData;
  restoreSaveData: (save: SaveData) => void;
  capturePreview?: (() => Promise<SaveSlotPreview | undefined> | SaveSlotPreview | undefined) | undefined;
  canSave?: (() => boolean) | undefined;
}

export interface SaveSlotController {
  activeOperation: SaveLoadActiveOperation | undefined;
  busy: boolean;
  cancelLoadSlot(): void;
  confirmLoadSlot(): Promise<boolean>;
  lastError: SaveLoadErrorViewModel | undefined;
  loadPreviews(slotIds: string[]): void;
  pendingLoadSlot: SaveSlotSummary | undefined;
  quickLoadSlot(): Promise<boolean>;
  quickSaveSlot(): Promise<boolean>;
  quickSlot: SaveSlotSummary | undefined;
  refreshSummaries(): Promise<boolean | undefined>;
  requestLoadSlot(slotId: string): Promise<boolean>;
  saveSlot(slotId: string): Promise<boolean>;
  slotIds: string[];
  slotPreviewsById: Record<string, SaveSlotPreviewViewModel>;
  slots: SaveSlotSummary[];
}

export function useSaveSlotController({
  canSave = () => true,
  capturePreview,
  collectSaveData,
  policy,
  port,
  restoreSaveData
}: SaveSlotControllerOptions): SaveSlotController {
  const [slots, setSlots] = useState<SaveSlotSummary[]>([]);
  const [quickSlot, setQuickSlot] = useState<SaveSlotSummary | undefined>();
  const [pendingLoadSlot, setPendingLoadSlot] = useState<SaveSlotSummary | undefined>();
  const [slotPreviewsById, setSlotPreviewsById] = useState<Record<string, SaveSlotPreviewViewModel>>({});
  const [busy, setBusy] = useState(false);
  const [activeOperation, setActiveOperation] = useState<SaveLoadActiveOperation | undefined>();
  const [lastError, setLastError] = useState<SaveLoadErrorViewModel | undefined>();
  const previewUrlsRef = useRef<Record<string, string>>({});
  const lastPreviewSlotIdsRef = useRef<string[]>([]);
  const operationChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    return () => {
      for (const uri of Object.values(previewUrlsRef.current)) revokeObjectUrl(uri);
      previewUrlsRef.current = {};
    };
  }, []);

  const applyLoadedPreviews = useCallback((requestedSlotIds: string[], previews: Record<string, SaveSlotPreview>) => {
    setSlotPreviewsById((current) => {
      const next = { ...current };
      const requestedSlotIdSet = new Set(requestedSlotIds);
      for (const slotId of Object.keys(next)) {
        if (requestedSlotIdSet.has(slotId)) continue;
        const previousUri = previewUrlsRef.current[slotId];
        if (previousUri) revokeObjectUrl(previousUri);
        delete previewUrlsRef.current[slotId];
        delete next[slotId];
      }
      for (const slotId of requestedSlotIds) {
        if (previews[slotId]) continue;
        const previousUri = previewUrlsRef.current[slotId];
        if (previousUri) revokeObjectUrl(previousUri);
        delete previewUrlsRef.current[slotId];
        delete next[slotId];
      }
      for (const [slotId, preview] of Object.entries(previews)) {
        const previousUri = previewUrlsRef.current[slotId];
        if (previousUri) revokeObjectUrl(previousUri);
        const uri = createObjectUrl(preview.blob);
        previewUrlsRef.current[slotId] = uri;
        next[slotId] = {
          kind: "image",
          uri,
          mime: preview.metadata.mime,
          width: preview.metadata.width,
          height: preview.metadata.height
        };
      }
      return next;
    });
  }, []);

  const prunePreviewsToSummaries = useCallback((summaries: SaveSlotSummary[]) => {
    const validSlotIds = new Set(summaries.map((summary) => summary.id));
    setSlotPreviewsById((current) => {
      const next: Record<string, SaveSlotPreviewViewModel> = {};
      for (const [slotId, preview] of Object.entries(current)) {
        if (validSlotIds.has(slotId)) {
          next[slotId] = preview;
          continue;
        }
        const uri = previewUrlsRef.current[slotId];
        if (uri) revokeObjectUrl(uri);
        delete previewUrlsRef.current[slotId];
      }
      return next;
    });
  }, []);

  const refreshSummariesNow = useCallback(async () => {
    const result = await port.listSummaries();
    if (!result.ok) {
      setLastError(toSaveLoadError(result.error));
      return false;
    }
    setSlots(selectManualSaveSlotSummaries(policy, result.value));
    setQuickSlot(selectQuickSaveSlotSummary(policy, result.value));
    setPendingLoadSlot((current) => {
      if (!current) return undefined;
      return result.value.find((slot) => slot.id === current.id);
    });
    prunePreviewsToSummaries(result.value);
    return true;
  }, [policy, port, prunePreviewsToSummaries]);

  const loadPreviewsNow = useCallback(
    async (slotIds: string[]) => {
      if (slotIds.length === 0) {
        applyLoadedPreviews([], {});
        return true;
      }
      const result = await port.loadPreviews(slotIds);
      if (!result.ok) {
        setLastError(toSaveLoadError(result.error));
        return false;
      }
      applyLoadedPreviews(slotIds, result.value);
      return true;
    },
    [applyLoadedPreviews, port]
  );

  const runSerialized = useCallback(async <T,>(operation: SaveLoadActiveOperation, task: () => Promise<T>): Promise<T | undefined> => {
    const run = operationChainRef.current.then(async () => {
      setBusy(true);
      setActiveOperation(operation);
      setLastError(undefined);
      try {
        return await task();
      } catch (cause) {
        setLastError(toUnknownSaveLoadError(cause));
        return undefined;
      } finally {
        setActiveOperation(undefined);
        setBusy(false);
      }
    });
    operationChainRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }, []);

  const refreshSummaries = useCallback(
    () => runSerialized({ kind: "refresh" }, refreshSummariesNow),
    [refreshSummariesNow, runSerialized]
  );

  useEffect(() => {
    void refreshSummaries();
  }, [refreshSummaries]);

  const saveToSlot = useCallback(
    async (slotId: string, operation: SaveLoadActiveOperation["kind"]) => {
      if (!policy.allSlotIds.includes(slotId)) return false;
      if (!canSave()) return false;
      return (
        (await runSerialized({ kind: operation, slotId }, async () => {
          const data = collectSaveData();
          const preview = await captureSavePreview(capturePreview, setLastError);
          const result = await port.save({
            id: slotId,
            label: policy.labelForSlot(slotId),
            data,
            ...(preview ? { preview } : {})
          });
          if (!result.ok) {
            setLastError(toSaveLoadError(result.error));
            return false;
          }
          const refreshed = await refreshSummariesNow();
          if (refreshed) await loadPreviewsNow(lastPreviewSlotIdsRef.current);
          return true;
        })) ?? false
      );
    },
    [canSave, capturePreview, collectSaveData, loadPreviewsNow, policy, port, refreshSummariesNow, runSerialized]
  );

  const saveSlot = useCallback(
    (slotId: string) => {
      if (!policy.isManualSlot(slotId)) return Promise.resolve(false);
      return saveToSlot(slotId, "save");
    },
    [policy, saveToSlot]
  );

  const quickSaveSlot = useCallback(() => saveToSlot(policy.quickSlotId, "quick-save"), [policy.quickSlotId, saveToSlot]);

  const requestLoadSlot = useCallback(
    (slotId: string) => {
      if (!policy.allSlotIds.includes(slotId)) return Promise.resolve(false);
      return runSerialized({ kind: "request-load", slotId }, async () => {
        const result = await port.load(slotId);
        if (!result.ok) {
          setLastError(toSaveLoadError(result.error));
          return false;
        }
        if (!result.value) return false;
        setPendingLoadSlot(result.value.summary);
        return true;
      }).then((loaded) => loaded ?? false);
    },
    [policy, port, runSerialized]
  );

  const confirmLoadSlot = useCallback(() => {
    if (!pendingLoadSlot) return Promise.resolve(false);
    const slotId = pendingLoadSlot.id;
    return runSerialized({ kind: "confirm-load", slotId }, async () => {
      const result = await port.load(slotId);
      if (!result.ok) {
        setLastError(toSaveLoadError(result.error));
        return false;
      }
      if (!result.value) return false;
      restoreSaveData(result.value.data);
      setPendingLoadSlot(undefined);
      await refreshSummariesNow();
      return true;
    }).then((loaded) => loaded ?? false);
  }, [pendingLoadSlot, port, refreshSummariesNow, restoreSaveData, runSerialized]);

  const quickLoadSlot = useCallback(
    () =>
      runSerialized({ kind: "quick-load", slotId: policy.quickSlotId }, async () => {
        const result = await port.load(policy.quickSlotId);
        if (!result.ok) {
          setLastError(toSaveLoadError(result.error));
          return false;
        }
        if (!result.value) return false;
        restoreSaveData(result.value.data);
        setPendingLoadSlot(undefined);
        await refreshSummariesNow();
        return true;
      }).then((loaded) => loaded ?? false),
    [policy.quickSlotId, port, refreshSummariesNow, restoreSaveData, runSerialized]
  );

  const loadPreviews = useCallback(
    (slotIds: string[]) => {
      const filteredSlotIds = slotIds.filter((slotId) => policy.allSlotIds.includes(slotId));
      lastPreviewSlotIdsRef.current = filteredSlotIds;
      void runSerialized({ kind: "load-previews" }, () => loadPreviewsNow(filteredSlotIds));
    },
    [loadPreviewsNow, policy, runSerialized]
  );

  const cancelLoadSlot = useCallback(() => {
    if (busy) return;
    setPendingLoadSlot(undefined);
  }, [busy]);

  return {
    activeOperation,
    busy,
    cancelLoadSlot,
    confirmLoadSlot,
    lastError,
    loadPreviews,
    pendingLoadSlot,
    quickLoadSlot,
    quickSaveSlot,
    quickSlot,
    refreshSummaries,
    requestLoadSlot,
    saveSlot,
    slotIds: policy.manualSlotIds,
    slotPreviewsById,
    slots
  };
}

async function captureSavePreview(
  capturePreview: SaveSlotControllerOptions["capturePreview"],
  setLastError: (error: SaveLoadErrorViewModel | undefined) => void
): Promise<SaveSlotPreview | undefined> {
  if (!capturePreview) return undefined;
  try {
    return await capturePreview();
  } catch (cause) {
    setLastError({
      code: "capture-failed",
      message: cause instanceof Error ? cause.message : "Save thumbnail capture failed."
    });
    return undefined;
  }
}

function toSaveLoadError(error: SaveOperationError): SaveLoadErrorViewModel {
  return {
    code: error.code,
    message: error.message
  };
}

function toUnknownSaveLoadError(cause: unknown): SaveLoadErrorViewModel {
  return {
    code: "operation-failed",
    message: cause instanceof Error ? cause.message : "Save operation failed."
  };
}

function createObjectUrl(blob: Blob): string {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return "";
  return URL.createObjectURL(blob);
}

function revokeObjectUrl(uri: string): void {
  if (!uri || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  URL.revokeObjectURL(uri);
}
