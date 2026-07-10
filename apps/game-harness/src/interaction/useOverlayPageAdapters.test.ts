import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { VnRuntimeShellPort } from "@v-ronpa/app-vn-runtime";
import {
  createGameInteractionOverlayActions,
  createGameInteractionShellViewModels,
  createVnSaveLoadOverlayModel,
  overlayKindForVnShellAction,
  renderGameInteractionOverlaySurface,
  type GameInteractionShellSurfaces,
  type SaveLoadOverlayViewModel
} from "@v-ronpa/app-vn-shell";
import { createDefaultSettingsSnapshot, type InteractionCapabilitySnapshot } from "@v-ronpa/contracts";
import { useOverlayPageAdapters } from "./useOverlayPageAdapters";

describe("overlay page adapter helpers", () => {
  it("maps shared UI actions to shell overlays without redefining overlay ids", () => {
    expect(overlayKindForVnShellAction("open-load", "title")).toBe("title-load");
    expect(overlayKindForVnShellAction("open-load", "navi")).toBe("vn-load");
    expect(overlayKindForVnShellAction("open-settings", "title")).toBe("title-settings");
    expect(overlayKindForVnShellAction("open-settings", "navi")).toBe("vn-settings");
    expect(overlayKindForVnShellAction("open-save", "navi")).toBe("vn-save");
    expect(overlayKindForVnShellAction("open-backlog", "navi")).toBe("vn-backlog");
    expect(overlayKindForVnShellAction("open-pause-menu", "navi")).toBe("pause-menu");
    expect(overlayKindForVnShellAction("toggle-auto", "navi")).toBeUndefined();
  });

  it("builds save/load view models from app adapter slots instead of ui-kit defaults", () => {
    const slotIds = ["project:save:alpha", "project:save:beta"];
    const slots = [
      {
        id: "project:save:alpha",
        label: "Alpha",
        savedAt: "2026-06-20T00:00:00.000Z",
        mode: "navi" as const,
        speaker: "Felix",
        text: "Custom slot id."
      }
    ];

    expect(
      createVnSaveLoadOverlayModel({
        canSave: true,
        overlay: "vn-save",
        pendingLoadSlot: undefined,
        slotIds,
        slots
      })
    ).toEqual({
      canSave: true,
      mode: "save",
      pendingLoadSlot: undefined,
      slotIds,
      slots,
      slotPreviewsById: {},
      busy: false,
      activeOperation: undefined,
      lastError: undefined
    });

    expect(
      createVnSaveLoadOverlayModel({
        canSave: true,
        overlay: "title-load",
        pendingLoadSlot: slots[0],
        slotIds,
        slots
      })
    ).toMatchObject({
      canSave: false,
      mode: "load",
      pendingLoadSlot: slots[0],
      slotIds
    });

    expect(
      createVnSaveLoadOverlayModel({
        canSave: true,
        overlay: "vn-backlog",
        pendingLoadSlot: undefined,
        slotIds,
        slots
      })
    ).toBeUndefined();
  });

  it("passes shell-derived overlay view models into the selected surface slot", () => {
    const slot = {
      id: "slot:1",
      label: "Slot 1",
      savedAt: "2026-06-20T00:00:00.000Z",
      mode: "navi" as const,
      text: "Saved"
    };
    const flow = {
      activeOverlay: "vn-load" as const,
      capabilities: createCapabilities(),
      mode: "navi" as const,
      closeAllOverlays: () => undefined,
      closeTopOverlay: () => undefined,
      context: {
        mode: "navi" as const,
        overlayStack: ["vn-load" as const],
        inputLock: "menu" as const,
        hasActiveStory: true,
        storyHasChoices: false,
        storyEnded: false,
        isAtStableStop: true
      },
      dispatchAction: () => undefined,
      openOverlay: () => undefined,
      overlayStack: ["vn-load" as const],
      send: () => undefined,
      updateContext: () => undefined
    };
    const runtime = createRuntime();
    const adapters = useOverlayPageAdapters({
      flow: flow as unknown as Parameters<typeof useOverlayPageAdapters>[0]["flow"],
      runtime: {
        ...runtime,
        resetShowcase: () => undefined,
        stopStoryAutomation: () => undefined,
        toggleStoryAuto: () => undefined,
        toggleStorySkip: () => undefined
      } as unknown as Parameters<typeof useOverlayPageAdapters>[0]["runtime"],
      save: {
        cancelLoadSlot: () => undefined,
        collectSaveData: () => ({}),
        confirmLoadSlot: async () => undefined,
        pendingLoadSlot: slot,
        quickLoadSlot: async () => false,
        quickSaveSlot: async () => undefined,
        quickSlot: undefined,
        refreshSlots: () => undefined,
        requestLoadSlot: () => undefined,
        saveSlot: () => undefined,
        slotIds: ["slot:1"],
        slots: [slot]
      } as unknown as Parameters<typeof useOverlayPageAdapters>[0]["save"],
      settings: {
        patchSettings: () => undefined,
        resetSettings: () => undefined,
        setSettings: () => undefined,
        settings: createDefaultSettingsSnapshot()
      } as unknown as Parameters<typeof useOverlayPageAdapters>[0]["settings"]
    });
    const models = createGameInteractionShellViewModels({
      flow,
      overlayModels: adapters.createOverlayViewModelInputs?.("vn-load"),
      runtime
    });
    const rendered = renderGameInteractionOverlaySurface({
      actions: createGameInteractionOverlayActions({
        closeTopOverlay: flow.closeTopOverlay,
        dispatchUiAction: adapters.dispatchUiAction,
        overlayActions: adapters.createOverlayActions?.("vn-load")
      }),
      models,
      overlay: "vn-load",
      surfaces: createNoopSurfaces()
    }) as ReactElement<{ model: SaveLoadOverlayViewModel }>;

    expect(models.saveLoad).toMatchObject({ visible: true, mode: "load", pendingLoadSlot: slot });
    expect(rendered.props.model).toBe(models.saveLoad);
  });

  it("routes quick save/load immediately and narrows Q.Load availability by quick slot presence", async () => {
    const flowSend = vi.fn();
    const closeAllOverlays = vi.fn();
    const quickLoadSlot = vi.fn(async () => true);
    const quickSaveSlot = vi.fn(async () => undefined);
    const quickSlot = {
      id: "slot:harness:quick",
      label: "Quick Save",
      savedAt: "2026-06-20T00:00:00.000Z",
      mode: "navi" as const
    };
    const adapters = useOverlayPageAdapters({
      flow: {
        activeOverlay: undefined,
        capabilities: createCapabilities(),
        closeAllOverlays,
        closeTopOverlay: () => undefined,
        dispatchAction: () => undefined,
        mode: "navi",
        openOverlay: () => undefined,
        send: flowSend
      },
      runtime: {
        resetShowcase: () => undefined,
        stopStoryAutomation: () => undefined,
        toggleStoryAuto: () => undefined,
        toggleStorySkip: () => undefined
      },
      save: {
        cancelLoadSlot: () => undefined,
        collectSaveData: () => ({}),
        confirmLoadSlot: async () => undefined,
        pendingLoadSlot: undefined,
        quickLoadSlot,
        quickSaveSlot,
        quickSlot,
        refreshSlots: () => undefined,
        requestLoadSlot: () => undefined,
        saveSlot: () => undefined,
        slotIds: [],
        slots: []
      },
      settings: {
        patchSettings: () => undefined,
        resetSettings: () => undefined,
        setSettings: () => undefined,
        settings: createDefaultSettingsSnapshot()
      }
    } as unknown as Parameters<typeof useOverlayPageAdapters>[0]);

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

    expect(quickSaveSlot).toHaveBeenCalledOnce();
    expect(quickLoadSlot).toHaveBeenCalledOnce();
    expect(flowSend).toHaveBeenCalledWith({ type: "ENTER_NAVI" });
    expect(closeAllOverlays).toHaveBeenCalledOnce();
  });

  it("does not let quick load bypass flow capabilities or empty quick slot state", async () => {
    const flowSend = vi.fn();
    const closeAllOverlays = vi.fn();
    const quickLoadSlot = vi.fn(async () => true);
    const adapters = useOverlayPageAdapters({
      flow: {
        activeOverlay: undefined,
        capabilities: { ...createCapabilities(), canLoad: false },
        closeAllOverlays,
        closeTopOverlay: () => undefined,
        dispatchAction: () => undefined,
        mode: "navi",
        openOverlay: () => undefined,
        send: flowSend
      },
      runtime: {
        resetShowcase: () => undefined,
        stopStoryAutomation: () => undefined,
        toggleStoryAuto: () => undefined,
        toggleStorySkip: () => undefined
      },
      save: {
        cancelLoadSlot: () => undefined,
        collectSaveData: () => ({}),
        confirmLoadSlot: async () => undefined,
        pendingLoadSlot: undefined,
        quickLoadSlot,
        quickSaveSlot: async () => undefined,
        quickSlot: {
          id: "slot:harness:quick",
          label: "Quick Save",
          savedAt: "2026-06-20T00:00:00.000Z",
          mode: "navi" as const
        },
        refreshSlots: () => undefined,
        requestLoadSlot: () => undefined,
        saveSlot: () => undefined,
        slotIds: [],
        slots: []
      },
      settings: {
        patchSettings: () => undefined,
        resetSettings: () => undefined,
        setSettings: () => undefined,
        settings: createDefaultSettingsSnapshot()
      }
    } as unknown as Parameters<typeof useOverlayPageAdapters>[0]);

    adapters.dispatchUiAction("quick-load");
    await Promise.resolve();

    expect(quickLoadSlot).not.toHaveBeenCalled();
    expect(flowSend).not.toHaveBeenCalledWith({ type: "ENTER_NAVI" });
    expect(closeAllOverlays).not.toHaveBeenCalled();
  });
});

function createCapabilities(): InteractionCapabilitySnapshot {
  return {
    canStartNewGame: false,
    canSave: true,
    canLoad: true,
    canOpenSettings: true,
    canOpenBacklog: true,
    canOpenPauseMenu: true,
    canAuto: true,
    canSkip: true,
    canReturnTitle: true
  };
}

function createRuntime(): VnRuntimeShellPort {
  return {
    advanceStory: () => undefined,
    attachMovieElement: () => undefined,
    chooseStory: () => undefined,
    completeMoviePlayback: () => undefined,
    dialogRevealRuntime: { events: [], eventSequence: 0 },
    dismissRuntimeToast: () => undefined,
    interactionFacts: {
      inputLock: "menu",
      hasActiveStory: true,
      storyHasChoices: false,
      storyEnded: false,
      isAtStableStop: true
    },
    storyPlayActiveActions: {},
    storyRuntime: {
      active: true,
      state: {
        currentScriptPath: "test.nani",
        instructionPointer: 0,
        variables: {},
        backlog: [],
        pendingChoices: [],
        text: { printerId: "main", visible: true },
        ended: false
      }
    },
    submitStoryInput: () => undefined,
    uiRuntime: {
      state: {
        surfaces: {
          dialog: { targetVisible: false, mounted: false, opacity: 0, phase: "hidden" },
          commandBar: { targetVisible: false, mounted: false, opacity: 0, phase: "hidden" },
          toastLayer: { targetVisible: false, mounted: false, opacity: 0, phase: "hidden" }
        },
        toasts: []
      }
    }
  };
}

function createNoopSurfaces(): GameInteractionShellSurfaces {
  return {
    BacklogOverlay: () => null,
    Choices: () => null,
    CommandBar: () => null,
    Dialog: () => null,
    InputPrompt: () => null,
    PauseMenuOverlay: () => null,
    SaveLoadOverlay: () => null,
    SettingsOverlay: () => null,
    Title: () => null,
    ToastLayer: () => null
  };
}
