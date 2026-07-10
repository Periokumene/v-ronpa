import { describe, expect, it, vi } from "vitest";
import { useGameAOverlayAdapters } from "./useGameAOverlayAdapters";

describe("game-a overlay adapters", () => {
  it("enters VN only when starting a new game succeeds", () => {
    const started = createAdapters({ startNewGame: () => true });

    started.dispatchUiAction("new-game");

    expect(started.flowSend).toHaveBeenCalledWith({ type: "START_NEW_GAME", mode: "vn" });
  });

  it("keeps the title flow when a debug start label prevents new-game startup", () => {
    const blocked = createAdapters({ startNewGame: () => false });

    blocked.dispatchUiAction("new-game");

    expect(blocked.flowSend).not.toHaveBeenCalled();
  });

  it("opens the canonical pause menu", () => {
    const adapters = createAdapters({ mode: "vn", startNewGame: () => true });

    adapters.dispatchUiAction("open-pause-menu");

    expect(adapters.stopStoryAutomation).toHaveBeenCalledWith("overlay");
    expect(adapters.openOverlay).toHaveBeenCalledWith("pause-menu");
    expect(adapters.closeAllOverlays).not.toHaveBeenCalled();
  });

  it("pushes a shared pause section through the flow overlay stack", () => {
    const adapters = createAdapters({
      activeOverlay: "vn-backlog",
      mode: "vn",
      startNewGame: () => true
    });

    adapters.dispatchUiAction("open-save");

    expect(adapters.openOverlay).toHaveBeenCalledWith("vn-save");
  });

  it("keeps section routing canonical when invoked", () => {
    const adapters = createAdapters({
      activeOverlay: "vn-load",
      mode: "vn",
      pendingLoadSlot: {
        id: "slot:game-a:1",
        label: "Game A 1",
        savedAt: "2026-07-08T00:00:00.000Z",
        mode: "vn"
      },
      startNewGame: () => true
    });

    adapters.dispatchUiAction("open-settings");

    expect(adapters.openOverlay).toHaveBeenCalledWith("vn-settings");
  });

  it("resets the VN runtime before routing return-title through flow", () => {
    const adapters = createAdapters({
      activeOverlay: "vn-load",
      mode: "vn",
      pendingLoadSlot: {
        id: "slot:game-a:1",
        label: "Game A 1",
        savedAt: "2026-07-08T00:00:00.000Z",
        mode: "vn"
      },
      startNewGame: () => true
    });

    adapters.dispatchUiAction("return-title");

    expect(adapters.resetRuntime).toHaveBeenCalledOnce();
    expect(adapters.flowSend).toHaveBeenCalledWith({ type: "RETURN_TITLE" });
    expect(adapters.resetRuntime.mock.invocationCallOrder[0]).toBeLessThan(adapters.flowSend.mock.invocationCallOrder[0]!);
  });

  it("uses the shared overlay action for backlog navigation", () => {
    const adapters = createAdapters({
      activeOverlay: "vn-settings",
      mode: "vn",
      startNewGame: () => true
    });

    adapters.dispatchUiAction("open-backlog");

    expect(adapters.openOverlay).toHaveBeenCalledWith("vn-backlog");
  });

  it("keeps return-title routed through the app flow", () => {
    const adapters = createAdapters({ mode: "vn", startNewGame: () => true });

    adapters.dispatchUiAction("return-title");

    expect(adapters.resetRuntime).toHaveBeenCalledOnce();
    expect(adapters.flowSend).toHaveBeenCalledWith({ type: "RETURN_TITLE" });
  });

  it("routes quick save and quick load without opening save/load overlays", async () => {
    const adapters = createAdapters({
      mode: "vn",
      quickLoadResult: true,
      quickSlot: {
        id: "slot:game-a:quick",
        label: "Quick Save",
        savedAt: "2026-07-08T00:00:00.000Z",
        mode: "vn"
      },
      startNewGame: () => true
    });

    expect(adapters.createCommandAvailability()).toEqual({
      "open-save": true,
      "quick-save": true,
      "open-load": true,
      "quick-load": true
    });

    adapters.dispatchUiAction("quick-save");
    adapters.dispatchUiAction("quick-load");
    await Promise.resolve();
    await Promise.resolve();

    expect(adapters.quickSaveSlot).toHaveBeenCalledOnce();
    expect(adapters.quickLoadSlot).toHaveBeenCalledOnce();
    expect(adapters.flowSend).toHaveBeenCalledWith({ type: "ENTER_VN" });
    expect(adapters.closeAllOverlays).toHaveBeenCalledOnce();
    expect(adapters.openOverlay).not.toHaveBeenCalled();
  });

  it("keeps quick load disabled and no-ops when the quick slot is empty", () => {
    const adapters = createAdapters({ mode: "vn", quickLoadResult: false, startNewGame: () => true });

    expect(adapters.createCommandAvailability()).toEqual({
      "open-save": true,
      "quick-save": true,
      "open-load": true,
      "quick-load": false
    });

    adapters.dispatchUiAction("quick-load");

    expect(adapters.quickLoadSlot).not.toHaveBeenCalled();
    expect(adapters.flowSend).not.toHaveBeenCalledWith({ type: "ENTER_VN" });
    expect(adapters.closeAllOverlays).not.toHaveBeenCalled();
  });

  it("keeps the current flow and overlays when an available quick load is rejected", async () => {
    const adapters = createAdapters({
      mode: "vn",
      quickLoadResult: false,
      quickSlot: {
        id: "slot:game-a:quick",
        label: "Quick Save",
        savedAt: "2026-07-08T00:00:00.000Z",
        mode: "vn"
      },
      startNewGame: () => true
    });

    adapters.dispatchUiAction("quick-load");
    await Promise.resolve();
    await Promise.resolve();

    expect(adapters.quickLoadSlot).toHaveBeenCalledOnce();
    expect(adapters.flowSend).not.toHaveBeenCalledWith({ type: "ENTER_VN" });
    expect(adapters.closeAllOverlays).not.toHaveBeenCalled();
  });

  it("does not let quick save bypass the flow canSave capability", () => {
    const adapters = createAdapters({ mode: "title", startNewGame: () => true });

    adapters.dispatchUiAction("quick-save");

    expect(adapters.quickSaveSlot).not.toHaveBeenCalled();
  });
});

function createAdapters({
  activeOverlay,
  mode = "title",
  pendingLoadSlot,
  quickLoadResult = false,
  quickSlot,
  startNewGame
}: {
  activeOverlay?: "pause-menu" | "vn-backlog" | "vn-save" | "vn-load" | "vn-settings";
  mode?: "title" | "vn";
  pendingLoadSlot?: {
    id: string;
    label: string;
    savedAt: string;
    mode: "vn";
  };
  quickLoadResult?: boolean;
  quickSlot?: {
    id: string;
    label: string;
    savedAt: string;
    mode: "vn";
  };
  startNewGame: () => boolean;
}) {
  const flowSend = vi.fn();
  const openOverlay = vi.fn();
  const closeAllOverlays = vi.fn();
  const quickLoadSlot = vi.fn(async () => quickLoadResult);
  const quickSaveSlot = vi.fn(async () => undefined);
  const stopStoryAutomation = vi.fn();
  const resetRuntime = vi.fn();
  const adapters = useGameAOverlayAdapters({
    flow: {
      activeOverlay,
      mode,
      capabilities: { canLoad: true, canSave: mode === "vn" },
      send: flowSend,
      openOverlay,
      closeTopOverlay: vi.fn(),
      closeAllOverlays
    },
    runtime: {
      startNewGame,
      lifecycle: {
        resetRuntime
      },
      debug: {
        toggleStoryAuto: vi.fn(),
        toggleStorySkip: vi.fn(),
        stopStoryAutomation
      }
    },
    save: {
      cancelLoadSlot: vi.fn(),
      confirmLoadSlot: vi.fn(),
      pendingLoadSlot,
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
    settings: {
      settings: {},
      patchSettings: vi.fn(),
      resetSettings: vi.fn()
    }
  } as unknown as Parameters<typeof useGameAOverlayAdapters>[0]);

  return { ...adapters, closeAllOverlays, flowSend, openOverlay, quickLoadSlot, quickSaveSlot, resetRuntime, stopStoryAutomation };
}
