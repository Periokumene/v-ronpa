import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { createInitialUiRuntimeState, type UiRuntimeState } from "@v-ronpa/app-vn-dispatch";
import type { VnRuntimeShellPort } from "@v-ronpa/app-vn-runtime";
import { createDefaultSettingsSnapshot, type GameOverlayKind, type GamePauseSection, type SaveSlotSummary, type StoryChoiceOption } from "@v-ronpa/contracts";
import {
  createGameInteractionOverlayActions,
  defaultGameInteractionShellSurfaces,
  renderGameInteractionOverlaySurface,
  renderGameInteractionPauseSurface,
  resolveGameInteractionShellSurfaces,
  shouldRenderVnAdvanceHitPlane,
  type VnAdvanceHitPlaneInput
} from "./GameInteractionShell";
import {
  createCommandBarCommands,
  createGameInteractionShellViewModels,
  type BacklogOverlayActions,
  type BacklogOverlayViewModel,
  type GameFlowShellAdapter,
  type GameInteractionShellSurfaces,
  type SaveLoadOverlayActions,
  type SaveLoadOverlayViewModel,
  type SurfaceSlotProps,
  type VnDialogViewModel
} from "./GameInteractionViewModels";

describe("GameInteractionShell VN advance hit plane", () => {
  const baseInput: VnAdvanceHitPlaneInput = {
    flowMode: "navi",
    hasActiveOverlay: false,
    hasInputPrompt: false,
    hasMovieOverlay: false,
    naviSubstate: "vn2d-overlay",
    storyActive: true,
    storyEnded: false,
    storyHasChoices: false
  };

  it("renders for primary VN mode or active Navi VN2D lines without blockers", () => {
    expect(shouldRenderVnAdvanceHitPlane(baseInput)).toBe(true);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, flowMode: "vn", naviSubstate: undefined })).toBe(true);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, flowMode: "trial" })).toBe(false);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, naviSubstate: "walk" })).toBe(false);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, storyActive: false })).toBe(false);
  });

  it("does not depend on dialog visibility so hidden-ui story lines can still advance", () => {
    expect(shouldRenderVnAdvanceHitPlane(baseInput)).toBe(true);
  });

  it("does not render while VN choices or runtime overlays own interaction", () => {
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, storyHasChoices: true })).toBe(false);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, storyEnded: true })).toBe(false);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, hasActiveOverlay: true })).toBe(false);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, hasInputPrompt: true })).toBe(false);
    expect(shouldRenderVnAdvanceHitPlane({ ...baseInput, hasMovieOverlay: true })).toBe(false);
  });
});

describe("GameInteractionShell view models", () => {
  it("derives dialog, choices, command bar, title, toast, and input prompt models from shell state", () => {
    const choice: StoryChoiceOption = { text: "Inspect", id: "choice:inspect", enabled: true };
    const flow = createFlow({ mode: "vn" });
    const runtime = createRuntime({
      pendingChoices: [choice],
      visibleText: "Par",
      inputPrompt: { variableName: "answer", valueType: "string", summary: "Answer" },
      toasts: [{ id: "toast:1", text: "Saved" }]
    });

    const models = createGameInteractionShellViewModels({
      dialogDisplay: { textSize: "large", textboxOpacity: 0.5, textSpeed: 0.75 },
      flow,
      formatStorySpeaker: (speaker) => `Speaker ${speaker}`,
      runtime
    });

    expect(models.dialog).toMatchObject({
      visible: true,
      speakerId: "Mira",
      speakerLabel: "Speaker Mira",
      text: "Par",
      state: "choices",
      display: { textSize: "large", textboxOpacity: 0.5, textSpeed: 0.75 }
    });
    expect(models.choices).toMatchObject({ visible: true, choices: [choice] });
    expect(models.commandBar?.commands.map((command) => command.testId)).toEqual([
      "vn-command-backlog",
      "vn-command-skip",
      "vn-command-auto",
      "vn-command-save",
      "vn-command-quick-save",
      "vn-command-load",
      "vn-command-quick-load",
      "vn-command-settings"
    ]);
    expect(models.commandBar?.commands.find((command) => command.action === "toggle-auto")).toMatchObject({
      active: true,
      enabled: true,
      toggle: true
    });
    expect(models.toastLayer).toMatchObject({ visible: true, toasts: [{ id: "toast:1", text: "Saved" }] });
    expect(models.inputPrompt).toMatchObject({ visible: true, prompt: { variableName: "answer" } });
    expect(models.dialog?.presentation).toMatchObject({ targetVisible: true, mounted: true, opacity: 1, phase: "shown" });
    expect(models.commandBar?.presentation).toMatchObject({ targetVisible: true, mounted: true, opacity: 1, phase: "shown" });
    expect(models.toastLayer?.presentation).toMatchObject({ targetVisible: true, mounted: true, opacity: 1, phase: "shown" });

    const titleModels = createGameInteractionShellViewModels({ flow: createFlow({ mode: "title" }), runtime });
    expect(titleModels.title).toMatchObject({ visible: true, title: "V-Ronpa" });
    expect(titleModels.dialog).toBeUndefined();
  });

  it("keeps fading-out UI mounted and omits terminal hidden UI from view models", () => {
    const fading = createRuntime({
      uiRuntimeState: uiRuntimeStateWithSurfaces({
        dialog: {
          targetVisible: false,
          mounted: true,
          opacity: 0.4,
          phase: "hiding",
          transition: { startedAtMs: 1000, durationMs: 200, fromOpacity: 1, toOpacity: 0, targetVisible: false }
        },
        commandBar: { targetVisible: false, mounted: false, opacity: 0, phase: "hidden" }
      })
    });

    const models = createGameInteractionShellViewModels({ flow: createFlow({ mode: "vn" }), runtime: fading });

    expect(models.dialog).toMatchObject({
      visible: true,
      presentation: { targetVisible: false, mounted: true, opacity: 0.4, phase: "hiding" }
    });
    expect(models.commandBar).toBeUndefined();
  });

  it("omits playable dialog, choices, and command surfaces while paused without changing runtime state", () => {
    const runtime = createRuntime({ pendingChoices: [{ id: "choice:inspect", text: "Inspect", enabled: true }] });

    const pausedModels = createGameInteractionShellViewModels({
      flow: createFlow({ mode: "paused", pauseSection: "backlog" }),
      runtime
    });

    expect(pausedModels.dialog).toBeUndefined();
    expect(pausedModels.choices).toBeUndefined();
    expect(pausedModels.commandBar).toBeUndefined();
    expect(pausedModels.backlog).toMatchObject({ visible: true, placement: "pause" });

    const resumedModels = createGameInteractionShellViewModels({ flow: createFlow({ mode: "vn" }), runtime });
    expect(resumedModels.dialog).toMatchObject({ visible: true, state: "choices" });
    expect(resumedModels.choices).toMatchObject({ visible: true });
    expect(resumedModels.commandBar).toMatchObject({ visible: true });
  });

  it("mounts dialog presentation before the first story line so showUI fade can render", () => {
    const showingBeforeLine = createRuntime({
      hasCurrentLine: false,
      uiRuntimeState: uiRuntimeStateWithSurfaces({
        dialog: {
          targetVisible: true,
          mounted: true,
          opacity: 0.35,
          phase: "showing",
          transition: { startedAtMs: 1000, durationMs: 500, fromOpacity: 0, toOpacity: 1, targetVisible: true }
        }
      })
    });

    const models = createGameInteractionShellViewModels({ flow: createFlow({ mode: "vn" }), runtime: showingBeforeLine });

    expect(models.dialog).toMatchObject({
      visible: true,
      text: "",
      state: "line",
      presentation: { targetVisible: true, mounted: true, opacity: 0.35, phase: "showing" }
    });
    expect(models.dialog?.speakerId).toBeUndefined();
  });

  it("derives first-pass overlay models while keeping save and settings data injectable", () => {
    const slot: SaveSlotSummary = {
      id: "slot:1",
      label: "Slot 1",
      savedAt: "2026-01-01T00:00:00.000Z",
      mode: "vn",
      text: "Saved line"
    };
    const settings = createDefaultSettingsSnapshot();
    const runtime = createRuntime({ backlogText: "Earlier line" });

    expect(
      createGameInteractionShellViewModels({
        flow: createFlow({ mode: "paused", pauseSection: "backlog" }),
        runtime
      }).backlog
    ).toMatchObject({ visible: true, entries: [{ text: "Earlier line" }] });
    expect(
      createGameInteractionShellViewModels({
        flow: createFlow({ mode: "paused", pauseSection: "load" }),
        overlayModels: {
          saveLoad: { mode: "load", canSave: false, pendingLoadSlot: slot, slotIds: ["slot:1"], slots: [slot] }
        },
        runtime
      }).saveLoad
    ).toEqual({
      visible: true,
      placement: "pause",
      mode: "load",
      canSave: false,
      pendingLoadSlot: slot,
      slotIds: ["slot:1"],
      slots: [slot],
      slotPreviewsById: {},
      busy: false,
      activeOperation: undefined,
      lastError: undefined
    });
    expect(
      createGameInteractionShellViewModels({
        flow: createFlow({ mode: "title", activeOverlay: "title-settings" }),
        overlayModels: { settings },
        runtime
      }).settings
    ).toEqual({ visible: true, placement: "overlay", settings });
  });

  it("resolves partial custom surfaces with default fallback per slot", () => {
    const CustomDialog = (_props: SurfaceSlotProps<VnDialogViewModel>) => null;
    const resolved = resolveGameInteractionShellSurfaces({ Dialog: CustomDialog });

    expect(resolved.Dialog).toBe(CustomDialog);
    expect(resolved.Choices).toBe(defaultGameInteractionShellSurfaces.Choices);
    expect(resolved.SaveLoadOverlay).toBe(defaultGameInteractionShellSurfaces.SaveLoadOverlay);
  });

  it("selects overlay surface slots inside the shell and binds default plus app actions", () => {
    const surfaces = createNoopSurfaces();
    const close = vi.fn();
    const save = vi.fn();
    const requestLoad = vi.fn();
    const confirmLoad = vi.fn();
    const cancelLoad = vi.fn();
    const saveLoadModel: SaveLoadOverlayViewModel = {
      visible: true,
      placement: "overlay",
      mode: "load",
      canSave: false,
      pendingLoadSlot: undefined,
      slotIds: ["slot:1"],
      slots: [],
      slotPreviewsById: {},
      busy: false,
      activeOperation: undefined,
      lastError: undefined
    };
    const actions = createGameInteractionOverlayActions({
      close,
      overlayActions: {
        saveLoad: {
          cancelLoad,
          close,
          confirmLoad,
          loadPreviews: vi.fn(),
          requestLoad,
          save
        }
      }
    });

    const saveLoadElement = renderGameInteractionOverlaySurface({
      actions,
      models: { saveLoad: saveLoadModel },
      overlay: "title-load",
      surfaces
    }) as ReactElement<SurfaceSlotProps<SaveLoadOverlayViewModel, SaveLoadOverlayActions>>;
    expect(saveLoadElement.type).toBe(surfaces.SaveLoadOverlay);
    expect(saveLoadElement.props.model).toBe(saveLoadModel);
    saveLoadElement.props.actions.confirmLoad();
    expect(confirmLoad).toHaveBeenCalledOnce();

    const backlogModel: BacklogOverlayViewModel = { visible: true, placement: "pause", entries: [] };
    const backlogElement = renderGameInteractionPauseSurface({
      actions,
      models: { backlog: backlogModel },
      section: "backlog",
      surfaces
    }) as ReactElement<SurfaceSlotProps<BacklogOverlayViewModel, BacklogOverlayActions>>;
    expect(backlogElement.type).toBe(surfaces.BacklogOverlay);
    backlogElement.props.actions.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps active command toggles enabled so they can be turned off", () => {
    const capabilities = createFlow({ mode: "vn" }).capabilities;
    const commands = createCommandBarCommands(
      { ...capabilities, canAuto: false, canSkip: false },
      { "toggle-auto": true, "toggle-skip": true }
    );

    expect(commands.find((command) => command.action === "toggle-auto")).toMatchObject({
      active: true,
      enabled: true
    });
    expect(commands.find((command) => command.action === "toggle-skip")).toMatchObject({
      active: true,
      enabled: true
    });
  });

  it("narrows command availability without bypassing base capabilities", () => {
    const capabilities = createFlow({ mode: "vn" }).capabilities;
    const commands = createCommandBarCommands(
      { ...capabilities, canLoad: true, canSave: false },
      {},
      { "quick-load": false, "quick-save": true }
    );

    expect(commands.find((command) => command.action === "open-load")).toMatchObject({ enabled: true });
    expect(commands.find((command) => command.action === "quick-load")).toMatchObject({ enabled: false });
    expect(commands.find((command) => command.action === "open-save")).toMatchObject({ enabled: false });
    expect(commands.find((command) => command.action === "quick-save")).toMatchObject({ enabled: false });
  });
});

function createFlow({
  activeOverlay,
  pauseSection,
  mode
}: {
  activeOverlay?: GameOverlayKind;
  pauseSection?: GamePauseSection;
  mode: GameFlowShellAdapter["mode"];
}): Pick<GameFlowShellAdapter, "activeOverlay" | "pauseSection" | "capabilities" | "mode"> {
  return {
    activeOverlay,
    pauseSection,
    mode,
    capabilities: {
      canStartNewGame: mode === "title",
      canSave: true,
      canLoad: true,
      canOpenSettings: true,
      canOpenBacklog: true,
      canOpenPause: true,
      canAuto: true,
      canSkip: true,
      canReturnTitle: mode !== "title"
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
    PauseSurface: ({ children }) => children,
    SaveLoadOverlay: () => null,
    SettingsOverlay: () => null,
    Title: () => null,
    ToastLayer: () => null
  };
}

function createRuntime({
  backlogText,
  hasCurrentLine = true,
  inputPrompt,
  pendingChoices = [],
  toasts = [],
  uiRuntimeState,
  visibleText
}: {
  backlogText?: string;
  hasCurrentLine?: boolean;
  inputPrompt?: VnRuntimeShellPort["uiRuntime"]["state"]["inputPrompt"];
  pendingChoices?: StoryChoiceOption[];
  toasts?: VnRuntimeShellPort["uiRuntime"]["state"]["toasts"];
  uiRuntimeState?: UiRuntimeState;
  visibleText?: string;
}): VnRuntimeShellPort {
  const baseUiRuntimeState = uiRuntimeState ?? {
    ...createInitialUiRuntimeState(),
    toasts,
    ...(inputPrompt ? { inputPrompt } : {})
  };
  return {
    advanceStory: () => undefined,
    attachMovieElement: () => undefined,
    chooseStory: () => undefined,
    completeMoviePlayback: () => undefined,
    dialogRevealRuntime: { events: [], eventSequence: 0, ...(visibleText ? { visibleText } : {}) },
    dismissRuntimeToast: () => undefined,
    interactionFacts: {
      inputLock: "dialog",
      hasActiveStory: true,
      storyHasChoices: pendingChoices.length > 0,
      storyEnded: false,
      isAtStableStop: true
    },
    storyPlayActiveActions: { "toggle-auto": true },
    storyRuntime: {
      active: true,
      state: {
        currentScriptPath: "test.nani",
        instructionPointer: 1,
        variables: {},
        backlog: backlogText ? [{ speaker: "Mira", text: backlogText }] : [],
        pendingChoices,
        ...(hasCurrentLine
          ? { text: { printerId: "main", visible: true, current: { speaker: "Mira", text: "Partial line" } } }
          : {}),
        ended: false
      }
    },
    submitStoryInput: () => undefined,
    uiRuntime: {
      state: baseUiRuntimeState
    }
  };
}

function uiRuntimeStateWithSurfaces(surfaces: Partial<UiRuntimeState["surfaces"]>): UiRuntimeState {
  return {
    ...createInitialUiRuntimeState(),
    surfaces: { ...createInitialUiRuntimeState().surfaces, ...surfaces },
    toasts: []
  };
}
