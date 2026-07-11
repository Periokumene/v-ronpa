import { describe, expect, it, vi } from "vitest";
import {
  createVnSaveLoadOverlayModel,
  resolveVnShellNavigation
} from "@v-ronpa/app-vn-shell";
import { useOverlayPageAdapters } from "./useOverlayPageAdapters";

describe("harness overlay page adapters", () => {
  it("uses the shared title-overlay and pause-section routing", () => {
    expect(resolveVnShellNavigation("open-load", "title")).toEqual({ kind: "overlay", overlay: "title-load" });
    expect(resolveVnShellNavigation("open-save", "navi")).toEqual({ kind: "pause", section: "save" });
    expect(resolveVnShellNavigation("open-pause", "navi")).toEqual({ kind: "pause", section: undefined });
  });

  it("builds app-owned save/load models for pause and title pages", () => {
    const slot = { id: "slot:1", label: "Slot 1", savedAt: "2026-06-20T00:00:00.000Z", mode: "navi" as const };
    expect(createVnSaveLoadOverlayModel({ canSave: true, page: "save", pendingLoadSlot: undefined, slotIds: [slot.id], slots: [slot] }))
      .toMatchObject({ mode: "save", canSave: true });
    expect(createVnSaveLoadOverlayModel({ canSave: true, page: "title-load", pendingLoadSlot: slot, slotIds: [slot.id], slots: [slot] }))
      .toMatchObject({ mode: "load", canSave: false, pendingLoadSlot: slot });
  });

  it("opens the first available pause section and switches without overlays", () => {
    const adapters = createAdapters();
    adapters.dispatchUiAction("open-pause");
    adapters.dispatchUiAction("open-save");
    adapters.dispatchUiAction("open-load");
    expect(adapters.openPauseSection.mock.calls).toEqual([["backlog"], ["save"], ["load"]]);
    expect(adapters.openOverlay).not.toHaveBeenCalled();
  });

  it("routes quick save/load and clears flow by entering Navi on success", async () => {
    const adapters = createAdapters({ quickLoadResult: true, withQuickSlot: true });
    adapters.dispatchUiAction("quick-save");
    adapters.dispatchUiAction("quick-load");
    await Promise.resolve();
    await Promise.resolve();
    expect(adapters.quickSaveSlot).toHaveBeenCalledOnce();
    expect(adapters.quickLoadSlot).toHaveBeenCalledOnce();
    expect(adapters.flowSend).toHaveBeenCalledWith({ type: "ENTER_NAVI" });
  });

  it("does not quick-load without a slot and resets before returning title", async () => {
    const adapters = createAdapters();
    adapters.dispatchUiAction("quick-load");
    expect(adapters.quickLoadSlot).not.toHaveBeenCalled();

    adapters.dispatchUiAction("return-title");
    expect(adapters.resetShowcase).toHaveBeenCalledOnce();
    expect(adapters.flowSend).toHaveBeenCalledWith({ type: "RETURN_TITLE" });
  });
});

function createAdapters({ quickLoadResult = false, withQuickSlot = false } = {}) {
  const flowSend = vi.fn();
  const openOverlay = vi.fn();
  const openPauseSection = vi.fn();
  const quickLoadSlot = vi.fn(async () => quickLoadResult);
  const quickSaveSlot = vi.fn(async () => undefined);
  const resetShowcase = vi.fn();
  const adapters = useOverlayPageAdapters({
    flow: {
      activeOverlay: undefined,
      pauseSection: undefined,
      capabilities: { canSave: true, canLoad: true, canOpenBacklog: true, canOpenSettings: true },
      mode: "navi",
      send: flowSend,
      openOverlay,
      openPauseSection,
      closeOverlay: vi.fn(),
      resumeFromPause: vi.fn(),
      dispatchAction: vi.fn()
    },
    runtime: {
      resetShowcase,
      stopStoryAutomation: vi.fn(),
      toggleStoryAuto: vi.fn(),
      toggleStorySkip: vi.fn()
    },
    save: {
      activeOperation: undefined,
      busy: false,
      cancelLoadSlot: vi.fn(),
      confirmLoadSlot: vi.fn(),
      lastError: undefined,
      loadPreviews: vi.fn(),
      pendingLoadSlot: undefined,
      quickLoadSlot,
      quickSaveSlot,
      quickSlot: withQuickSlot ? { id: "slot:quick", label: "Quick", savedAt: "2026-06-20T00:00:00.000Z", mode: "navi" } : undefined,
      requestLoadSlot: vi.fn(),
      saveSlot: vi.fn(),
      slotIds: [],
      slotPreviewsById: {},
      slots: []
    },
    settings: { settings: {}, patchSettings: vi.fn(), resetSettings: vi.fn() }
  } as unknown as Parameters<typeof useOverlayPageAdapters>[0]);
  return { ...adapters, flowSend, openOverlay, openPauseSection, quickLoadSlot, quickSaveSlot, resetShowcase };
}
