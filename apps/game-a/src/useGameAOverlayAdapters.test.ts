import { describe, expect, it, vi } from "vitest";
import { useGameAOverlayAdapters } from "./useGameAOverlayAdapters";

describe("game-a overlay adapters", () => {
  it("enters VN only when starting a new game succeeds", () => {
    const started = createAdapters({ startNewGame: () => true });

    started.dispatchUiAction("new-game");

    expect(started.flowSend).toHaveBeenCalledWith({ type: "ENTER_VN" });
  });

  it("keeps the title flow when a debug start label prevents new-game startup", () => {
    const blocked = createAdapters({ startNewGame: () => false });

    blocked.dispatchUiAction("new-game");

    expect(blocked.flowSend).not.toHaveBeenCalled();
  });
});

function createAdapters({ startNewGame }: { startNewGame: () => boolean }) {
  const flowSend = vi.fn();
  const adapters = useGameAOverlayAdapters({
    flow: {
      mode: "title",
      capabilities: { canSave: false },
      send: flowSend,
      openOverlay: vi.fn(),
      closeTopOverlay: vi.fn(),
      closeAllOverlays: vi.fn()
    },
    runtime: {
      startNewGame,
      toggleStoryAuto: vi.fn(),
      toggleStorySkip: vi.fn(),
      stopStoryAutomation: vi.fn()
    },
    save: {
      cancelLoadSlot: vi.fn(),
      confirmLoadSlot: vi.fn(),
      pendingLoadSlot: undefined,
      requestLoadSlot: vi.fn(),
      saveSlot: vi.fn(),
      slotIds: [],
      slots: []
    },
    settings: {
      settings: {},
      patchSettings: vi.fn(),
      resetSettings: vi.fn()
    }
  } as unknown as Parameters<typeof useGameAOverlayAdapters>[0]);

  return { ...adapters, flowSend };
}
