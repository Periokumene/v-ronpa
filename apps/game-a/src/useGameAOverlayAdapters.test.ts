import { describe, expect, it, vi } from "vitest";
import { useGameAOverlayAdapters } from "./useGameAOverlayAdapters";

describe("game-a overlay adapters", () => {
  it("delegates new-game startup to the readiness-gated launch transaction", () => {
    const started = createAdapters({ startNewGame: () => true });
    started.dispatchUiAction("new-game");
    expect(started.beginNewGame).toHaveBeenCalledOnce();

    const blocked = createAdapters({ startNewGame: () => false });
    blocked.dispatchUiAction("new-game");
    expect(blocked.beginNewGame).toHaveBeenCalledOnce();
    expect(blocked.flowSend).not.toHaveBeenCalled();
  });

  it("opens the default pause section and switches sibling sections without overlays", () => {
    const adapters = createAdapters({ mode: "vn", startNewGame: () => true });
    adapters.dispatchUiAction("open-pause");
    expect(adapters.openPauseSection).toHaveBeenCalledWith("backlog");
    expect(adapters.openOverlay).not.toHaveBeenCalled();

    adapters.dispatchUiAction("open-save");
    expect(adapters.openPauseSection).toHaveBeenCalledWith("save");
    adapters.dispatchUiAction("open-load");
    expect(adapters.openPauseSection).toHaveBeenCalledWith("load");
  });

  it("keeps title load/settings as true overlays", () => {
    const adapters = createAdapters({ mode: "title", startNewGame: () => true });
    adapters.dispatchUiAction("open-load");
    adapters.dispatchUiAction("open-settings");
    expect(adapters.openOverlay).toHaveBeenNthCalledWith(1, "title-load");
    expect(adapters.openOverlay).toHaveBeenNthCalledWith(2, "title-settings");
    expect(adapters.openPauseSection).not.toHaveBeenCalled();
  });

  it("resets the VN runtime before returning title", () => {
    const adapters = createAdapters({ mode: "paused", pauseSection: "load", startNewGame: () => true });
    adapters.dispatchUiAction("return-title");
    expect(adapters.resetRuntime).toHaveBeenCalledOnce();
    expect(adapters.flowSend).toHaveBeenCalledWith({ type: "RETURN_TITLE" });
  });

  it("routes product automation actions through the shell port", () => {
    const adapters = createAdapters({ mode: "vn", startNewGame: () => true });
    adapters.dispatchUiAction("toggle-auto");
    adapters.dispatchUiAction("toggle-skip");
    adapters.dispatchUiAction("open-pause");

    expect(adapters.toggleStoryAuto).toHaveBeenCalledOnce();
    expect(adapters.toggleStorySkip).toHaveBeenCalledOnce();
    expect(adapters.stopStoryAutomation).toHaveBeenCalledWith("overlay");
  });

  it("routes quick save/load without opening pause pages", async () => {
    const adapters = createAdapters({
      mode: "vn",
      quickLoadResult: true,
      quickSlot: { id: "slot:game-a:quick", label: "Quick Save", savedAt: "2026-07-08T00:00:00.000Z", mode: "vn" },
      startNewGame: () => true
    });
    adapters.dispatchUiAction("quick-save");
    adapters.dispatchUiAction("quick-load");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(adapters.quickSaveSlot).toHaveBeenCalledOnce();
    expect(adapters.quickLoadSlot).toHaveBeenCalledOnce();
    expect(adapters.flowSend).toHaveBeenCalledWith({ type: "ENTER_VN" });
    expect(adapters.openPauseSection).not.toHaveBeenCalled();
  });

  it("does not bypass quick-save/load availability", () => {
    const title = createAdapters({ mode: "title", startNewGame: () => true });
    title.dispatchUiAction("quick-save");
    title.dispatchUiAction("quick-load");
    expect(title.quickSaveSlot).not.toHaveBeenCalled();
    expect(title.quickLoadSlot).not.toHaveBeenCalled();
  });

  it("does not restore or enter VN when the stage readiness barrier is unavailable", async () => {
    const adapters = createAdapters({
      mode: "vn",
      presentationReady: false,
      quickLoadResult: true,
      quickSlot: { id: "slot:game-a:quick", label: "Quick Save", savedAt: "2026-07-08T00:00:00.000Z", mode: "vn" },
      startNewGame: () => true
    });

    adapters.dispatchUiAction("quick-load");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(adapters.ensureVnPresentationReady).toHaveBeenCalledOnce();
    expect(adapters.quickLoadSlot).not.toHaveBeenCalled();
    expect(adapters.flowSend).not.toHaveBeenCalled();
  });
});

function createAdapters({
  mode = "title",
  pauseSection,
  presentationReady = true,
  quickLoadResult = false,
  quickSlot,
  startNewGame
}: {
  mode?: "title" | "vn" | "paused";
  pauseSection?: "backlog" | "save" | "load" | "settings";
  presentationReady?: boolean;
  quickLoadResult?: boolean;
  quickSlot?: { id: string; label: string; savedAt: string; mode: "vn" };
  startNewGame: () => boolean;
}) {
  const flowSend = vi.fn();
  const openOverlay = vi.fn();
  const openPauseSection = vi.fn();
  const quickLoadSlot = vi.fn(async () => quickLoadResult);
  const quickSaveSlot = vi.fn(async () => undefined);
  const resetRuntime = vi.fn();
  const stopStoryAutomation = vi.fn();
  const toggleStoryAuto = vi.fn();
  const toggleStorySkip = vi.fn();
  const beginNewGame = vi.fn(async () => startNewGame());
  const ensureVnPresentationReady = vi.fn(async () => presentationReady);
  const adapters = useGameAOverlayAdapters({
    flow: {
      activeOverlay: undefined,
      pauseSection,
      mode,
      capabilities: {
        canLoad: true,
        canSave: mode !== "title",
        canOpenBacklog: mode !== "title",
        canOpenSettings: true
      },
      send: flowSend,
      openOverlay,
      openPauseSection,
      closeOverlay: vi.fn(),
      resumeFromPause: vi.fn()
    },
    beginNewGame,
    ensureVnPresentationReady,
    runtime: {
      startNewGame,
      lifecycle: { resetRuntime },
      shell: { stopStoryAutomation, toggleStoryAuto, toggleStorySkip }
    },
    save: {
      cancelLoadSlot: vi.fn(),
      confirmLoadSlot: vi.fn(),
      pendingLoadSlot: undefined,
      quickLoadSlot,
      quickSaveSlot,
      quickSlot,
      activeOperation: undefined,
      busy: false,
      lastError: undefined,
      loadPreviews: vi.fn(),
      requestLoadSlot: vi.fn(),
      saveSlot: vi.fn(),
      slotIds: [],
      slotPreviewsById: {},
      slots: []
    },
    settings: { settings: {}, patchSettings: vi.fn(), resetSettings: vi.fn() }
  } as unknown as Parameters<typeof useGameAOverlayAdapters>[0]);

  return {
    ...adapters,
    beginNewGame,
    ensureVnPresentationReady,
    flowSend,
    openOverlay,
    openPauseSection,
    quickLoadSlot,
    quickSaveSlot,
    resetRuntime,
    stopStoryAutomation,
    toggleStoryAuto,
    toggleStorySkip
  };
}
