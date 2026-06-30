import { describe, expect, it } from "vitest";
import { createDefaultSettingsSnapshot, type GameOverlayKind, type SaveSlotSummary, type StoryChoiceOption } from "@v-ronpa/contracts";
import {
  defaultGameInteractionShellSurfaces,
  resolveGameInteractionShellSurfaces,
  shouldRenderVnAdvanceHitPlane,
  type VnAdvanceHitPlaneInput
} from "./GameInteractionShell";
import {
  createCommandBarCommands,
  createGameInteractionShellViewModels,
  type GameFlowShellAdapter,
  type SurfaceSlotProps,
  type VnDialogViewModel,
  type VnShellRuntimeAdapter
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
    expect(models.commandBar?.commands.map((command) => command.testId)).toContain("vn-command-auto");
    expect(models.commandBar?.commands.find((command) => command.action === "toggle-auto")).toMatchObject({
      active: true,
      enabled: true,
      toggle: true
    });
    expect(models.toastLayer).toMatchObject({ visible: true, toasts: [{ id: "toast:1", text: "Saved" }] });
    expect(models.inputPrompt).toMatchObject({ visible: true, prompt: { variableName: "answer" } });

    const titleModels = createGameInteractionShellViewModels({ flow: createFlow({ mode: "title" }), runtime });
    expect(titleModels.title).toMatchObject({ visible: true, title: "V-Ronpa" });
    expect(titleModels.dialog).toBeUndefined();
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
        flow: createFlow({ mode: "vn", activeOverlay: "vn-backlog" }),
        runtime
      }).backlog
    ).toMatchObject({ visible: true, entries: [{ text: "Earlier line" }] });
    expect(
      createGameInteractionShellViewModels({
        flow: createFlow({ mode: "vn", activeOverlay: "pause-menu" }),
        runtime
      }).pauseMenu
    ).toMatchObject({ visible: true, capabilities: { canSave: true } });
    expect(
      createGameInteractionShellViewModels({
        flow: createFlow({ mode: "vn", activeOverlay: "vn-load" }),
        overlayModels: {
          saveLoad: { mode: "load", canSave: false, pendingLoadSlot: slot, slotIds: ["slot:1"], slots: [slot] }
        },
        runtime
      }).saveLoad
    ).toEqual({ visible: true, mode: "load", canSave: false, pendingLoadSlot: slot, slotIds: ["slot:1"], slots: [slot] });
    expect(
      createGameInteractionShellViewModels({
        flow: createFlow({ mode: "title", activeOverlay: "title-settings" }),
        overlayModels: { settings },
        runtime
      }).settings
    ).toEqual({ visible: true, settings });
  });

  it("resolves partial custom surfaces with default fallback per slot", () => {
    const CustomDialog = (_props: SurfaceSlotProps<VnDialogViewModel>) => null;
    const resolved = resolveGameInteractionShellSurfaces({ Dialog: CustomDialog });

    expect(resolved.Dialog).toBe(CustomDialog);
    expect(resolved.Choices).toBe(defaultGameInteractionShellSurfaces.Choices);
    expect(resolved.SaveLoadOverlay).toBe(defaultGameInteractionShellSurfaces.SaveLoadOverlay);
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
});

function createFlow({
  activeOverlay,
  mode
}: {
  activeOverlay?: GameOverlayKind;
  mode: GameFlowShellAdapter["mode"];
}): Pick<GameFlowShellAdapter, "activeOverlay" | "capabilities" | "mode"> {
  return {
    activeOverlay,
    mode,
    capabilities: {
      canStartNewGame: mode === "title",
      canSave: true,
      canLoad: true,
      canOpenSettings: true,
      canOpenBacklog: true,
      canOpenPauseMenu: true,
      canAuto: true,
      canSkip: true,
      canReturnTitle: mode !== "title"
    }
  };
}

function createRuntime({
  backlogText,
  inputPrompt,
  pendingChoices = [],
  toasts = [],
  visibleText
}: {
  backlogText?: string;
  inputPrompt?: VnShellRuntimeAdapter["uiRuntime"]["state"]["inputPrompt"];
  pendingChoices?: StoryChoiceOption[];
  toasts?: VnShellRuntimeAdapter["uiRuntime"]["state"]["toasts"];
  visibleText?: string;
}): VnShellRuntimeAdapter {
  return {
    advanceStory: () => undefined,
    attachMovieElement: () => undefined,
    chooseStory: () => undefined,
    completeMoviePlayback: () => undefined,
    dialogRevealRuntime: { ...(visibleText ? { visibleText } : {}) },
    dismissRuntimeToast: () => undefined,
    interactionContext: {
      mode: "vn",
      overlayStack: [],
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
        text: { printerId: "main", visible: true, current: { speaker: "Mira", text: "Partial line" } },
        ended: false
      }
    },
    submitStoryInput: () => undefined,
    uiRuntime: {
      state: {
        visible: { dialog: true, commandBar: true, toastLayer: true },
        toasts,
        ...(inputPrompt ? { inputPrompt } : {})
      }
    }
  };
}
