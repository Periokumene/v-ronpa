import type { ComponentType } from "react";
import type {
  GameInteractionContext,
  GameMode,
  GameOverlayKind,
  GameUiAction,
  InteractionCapabilitySnapshot,
  NaviSubstate,
  RichTextDocument,
  SaveSlotSummary,
  SettingsPatch,
  SettingsSnapshot,
  StoryBacklogEntry,
  StoryChoiceOption
} from "@v-ronpa/contracts";
import {
  selectUiSurfacePresentation,
  type RuntimeInputPrompt,
  type RuntimeToast,
  type UiRuntimeState,
  type UiSurfacePresentation
} from "@v-ronpa/app-vn-dispatch";
import { selectCurrentStoryLine } from "@v-ronpa/story-engine";
import type { StoryRuntimeState } from "@v-ronpa/story-engine";
import type { StoryPlayAdvanceSource } from "@v-ronpa/story-play";

export interface GameFlowShellAdapter {
  activeOverlay: GameOverlayKind | undefined;
  capabilities: InteractionCapabilitySnapshot;
  mode: GameMode;
  closeTopOverlay(): void;
  send(event: { type: string; [key: string]: unknown }): void;
}

export interface VnShellRuntimeAdapter {
  advanceStory(source?: StoryPlayAdvanceSource): void;
  attachMovieElement(element: HTMLVideoElement | null): void;
  chooseStory(index: number): void;
  completeMoviePlayback(): void;
  dialogRevealRuntime: {
    visibleRichText?: RichTextDocument | undefined;
    visibleText?: string | undefined;
  };
  dismissRuntimeToast(toastId: string): void;
  interactionContext: GameInteractionContext;
  navi?: {
    substate?: NaviSubstate | undefined;
  };
  storyPlayActiveActions: Partial<Record<GameUiAction, boolean>>;
  storyRuntime: {
    active: boolean;
    state: StoryRuntimeState;
  };
  submitStoryInput(value: string | number | boolean): void;
  uiRuntime: {
    state: UiRuntimeState;
  };
}

export interface VnDialogDisplaySettings {
  textSize: "small" | "medium" | "large";
  textboxOpacity: number;
  textSpeed: number;
}

export interface SurfaceSlotProps<TModel, TActions = Record<string, never>> {
  model: TModel;
  actions: TActions;
}

export type SurfaceSlotComponent<TModel, TActions = Record<string, never>> = ComponentType<
  SurfaceSlotProps<TModel, TActions>
>;

export type VnDialogState = "line" | "choices" | "ended";

export interface VnDialogViewModel {
  visible: boolean;
  presentation: UiSurfacePresentation;
  speakerId?: string | undefined;
  speakerLabel?: string | undefined;
  text: string;
  richText?: RichTextDocument | undefined;
  state: VnDialogState;
  display?: VnDialogDisplaySettings | undefined;
}

export interface VnChoicesViewModel {
  visible: boolean;
  choices: StoryChoiceOption[];
}

export interface VnChoicesActions {
  choose(index: number, choice: StoryChoiceOption): void;
}

export interface VnCommandBarCommandViewModel {
  action: GameUiAction;
  label: string;
  enabled: boolean;
  active: boolean;
  testId: string;
  toggle: boolean;
}

export interface VnCommandBarViewModel {
  visible: boolean;
  presentation: UiSurfacePresentation;
  commands: VnCommandBarCommandViewModel[];
  capabilities: InteractionCapabilitySnapshot;
  activeActions: Partial<Record<GameUiAction, boolean>>;
}

export interface VnCommandBarActions {
  dispatch(action: GameUiAction): void;
}

export interface TitleViewModel {
  visible: boolean;
  title: string;
  capabilities: InteractionCapabilitySnapshot;
}

export interface TitleActions {
  dispatch(action: GameUiAction): void;
}

export interface RuntimeToastLayerViewModel {
  visible: boolean;
  presentation: UiSurfacePresentation;
  toasts: RuntimeToast[];
}

export interface RuntimeToastActions {
  dismiss(toastId: string): void;
}

export interface RuntimeInputPromptViewModel {
  visible: boolean;
  prompt: RuntimeInputPrompt;
}

export interface RuntimeInputPromptActions {
  submit(value: string | number | boolean): void;
}

export interface BacklogOverlayViewModel {
  visible: boolean;
  entries: StoryBacklogEntry[];
}

export interface BacklogOverlayActions {
  close(): void;
}

export interface SaveLoadOverlayViewModel {
  visible: boolean;
  mode: "save" | "load";
  slotIds: string[];
  slots: SaveSlotSummary[];
  canSave: boolean;
  pendingLoadSlot: SaveSlotSummary | undefined;
}

export interface SaveLoadOverlayActions {
  save(slotId: string): void;
  requestLoad(slotId: string): void;
  confirmLoad(): void;
  cancelLoad(): void;
  close(): void;
}

export interface SettingsOverlayViewModel {
  visible: boolean;
  settings: SettingsSnapshot;
}

export interface SettingsOverlayActions {
  patchSettings(patch: SettingsPatch): void;
  resetSettings(): void;
  close(): void;
}

export interface PauseMenuOverlayViewModel {
  visible: boolean;
  capabilities: InteractionCapabilitySnapshot;
}

export interface PauseMenuOverlayActions {
  dispatch(action: GameUiAction): void;
  close(): void;
}

export interface GameInteractionOverlayActions {
  backlog?: BacklogOverlayActions | undefined;
  saveLoad?: SaveLoadOverlayActions | undefined;
  settings?: SettingsOverlayActions | undefined;
  pauseMenu?: PauseMenuOverlayActions | undefined;
}

export interface GameInteractionShellViewModels {
  dialog?: VnDialogViewModel | undefined;
  choices?: VnChoicesViewModel | undefined;
  commandBar?: VnCommandBarViewModel | undefined;
  title?: TitleViewModel | undefined;
  toastLayer?: RuntimeToastLayerViewModel | undefined;
  inputPrompt?: RuntimeInputPromptViewModel | undefined;
  backlog?: BacklogOverlayViewModel | undefined;
  saveLoad?: SaveLoadOverlayViewModel | undefined;
  settings?: SettingsOverlayViewModel | undefined;
  pauseMenu?: PauseMenuOverlayViewModel | undefined;
}

export interface GameInteractionOverlayViewModelInputs {
  saveLoad?: Omit<SaveLoadOverlayViewModel, "visible"> | undefined;
  settings?: SettingsSnapshot | undefined;
}

export interface GameInteractionShellSurfaces {
  Dialog: SurfaceSlotComponent<VnDialogViewModel>;
  Choices: SurfaceSlotComponent<VnChoicesViewModel, VnChoicesActions>;
  CommandBar: SurfaceSlotComponent<VnCommandBarViewModel, VnCommandBarActions>;
  Title: SurfaceSlotComponent<TitleViewModel, TitleActions>;
  ToastLayer: SurfaceSlotComponent<RuntimeToastLayerViewModel, RuntimeToastActions>;
  InputPrompt: SurfaceSlotComponent<RuntimeInputPromptViewModel, RuntimeInputPromptActions>;
  BacklogOverlay: SurfaceSlotComponent<BacklogOverlayViewModel, BacklogOverlayActions>;
  SaveLoadOverlay: SurfaceSlotComponent<SaveLoadOverlayViewModel, SaveLoadOverlayActions>;
  SettingsOverlay: SurfaceSlotComponent<SettingsOverlayViewModel, SettingsOverlayActions>;
  PauseMenuOverlay: SurfaceSlotComponent<PauseMenuOverlayViewModel, PauseMenuOverlayActions>;
}

export interface CreateGameInteractionShellViewModelsInput {
  dialogDisplay?: VnDialogDisplaySettings | undefined;
  flow: Pick<GameFlowShellAdapter, "activeOverlay" | "capabilities" | "mode">;
  formatStorySpeaker?: ((speaker: string) => string) | undefined;
  overlayModels?: GameInteractionOverlayViewModelInputs | undefined;
  runtime: VnShellRuntimeAdapter;
  title?: string | undefined;
}

const COMMAND_BAR_COMMANDS: Array<{ action: GameUiAction; label: string; testId: string }> = [
  { action: "open-backlog", label: "LOG", testId: "vn-command-backlog" },
  { action: "toggle-skip", label: "SKIP", testId: "vn-command-skip" },
  { action: "toggle-auto", label: "AUTO", testId: "vn-command-auto" },
  { action: "open-save", label: "SAVE", testId: "vn-command-save" },
  { action: "open-load", label: "LOAD", testId: "vn-command-load" },
  { action: "open-settings", label: "SETTING", testId: "vn-command-settings" }
];

export function createGameInteractionShellViewModels({
  dialogDisplay,
  flow,
  formatStorySpeaker,
  overlayModels,
  runtime,
  title = "V-Ronpa"
}: CreateGameInteractionShellViewModelsInput): GameInteractionShellViewModels {
  const dialogPresentation = selectUiSurfacePresentation(runtime.uiRuntime.state, "dialog");
  const commandBarPresentation = selectUiSurfacePresentation(runtime.uiRuntime.state, "commandBar");
  const toastLayerPresentation = selectUiSurfacePresentation(runtime.uiRuntime.state, "toastLayer");
  const showDialog = runtime.storyRuntime.active && flow.mode !== "title" && dialogPresentation.mounted;
  const currentLine =
    showDialog ? selectCurrentStoryLine(runtime.storyRuntime.state) : undefined;
  const storyHasChoices = runtime.storyRuntime.state.pendingChoices.length > 0;
  const dialogState: VnDialogState = runtime.storyRuntime.state.ended ? "ended" : storyHasChoices ? "choices" : "line";
  const showChoices =
    runtime.storyRuntime.active &&
    (flow.mode === "vn" || (flow.mode === "navi" && runtime.navi?.substate === "vn2d-overlay")) &&
    !runtime.storyRuntime.state.ended &&
    storyHasChoices;
  const showCommandBar =
    runtime.storyRuntime.active && flow.mode !== "title" && commandBarPresentation.mounted;

  return {
    ...(showDialog
      ? {
          dialog: {
            visible: true,
            presentation: dialogPresentation,
            ...(currentLine?.speaker ? { speakerId: currentLine.speaker } : {}),
            ...(currentLine?.speaker
              ? { speakerLabel: formatStorySpeaker ? formatStorySpeaker(currentLine.speaker) : currentLine.speaker }
              : {}),
            text: runtime.dialogRevealRuntime.visibleText ?? currentLine?.text ?? "",
            ...(runtime.dialogRevealRuntime.visibleRichText ?? currentLine?.richText
              ? { richText: runtime.dialogRevealRuntime.visibleRichText ?? currentLine?.richText }
              : {}),
            state: dialogState,
            ...(dialogDisplay ? { display: dialogDisplay } : {})
          }
        }
      : {}),
    ...(showChoices
      ? {
          choices: {
            visible: true,
            choices: runtime.storyRuntime.state.pendingChoices
          }
        }
      : {}),
    ...(showCommandBar
      ? {
          commandBar: {
            visible: true,
            presentation: commandBarPresentation,
            commands: createCommandBarCommands(flow.capabilities, runtime.storyPlayActiveActions),
            capabilities: flow.capabilities,
            activeActions: runtime.storyPlayActiveActions
          }
        }
      : {}),
    ...(flow.mode === "title" ? { title: { visible: true, title, capabilities: flow.capabilities } } : {}),
    ...(toastLayerPresentation.mounted
      ? { toastLayer: { visible: true, presentation: toastLayerPresentation, toasts: runtime.uiRuntime.state.toasts } }
      : {}),
    ...(runtime.uiRuntime.state.inputPrompt
      ? { inputPrompt: { visible: true, prompt: runtime.uiRuntime.state.inputPrompt } }
      : {}),
    ...(flow.activeOverlay === "vn-backlog"
      ? { backlog: { visible: true, entries: runtime.storyRuntime.state.backlog } }
      : {}),
    ...((flow.activeOverlay === "vn-save" || flow.activeOverlay === "vn-load" || flow.activeOverlay === "title-load") &&
    overlayModels?.saveLoad
      ? { saveLoad: { ...overlayModels.saveLoad, visible: true } }
      : {}),
    ...((flow.activeOverlay === "title-settings" || flow.activeOverlay === "vn-settings") && overlayModels?.settings
      ? { settings: { visible: true, settings: overlayModels.settings } }
      : {}),
    ...(flow.activeOverlay === "pause-menu"
      ? { pauseMenu: { visible: true, capabilities: flow.capabilities } }
      : {})
  };
}

export function createCommandBarCommands(
  capabilities: InteractionCapabilitySnapshot,
  activeActions: Partial<Record<GameUiAction, boolean>> = {}
): VnCommandBarCommandViewModel[] {
  return COMMAND_BAR_COMMANDS.map((command) => {
    const toggle = command.action === "toggle-auto" || command.action === "toggle-skip";
    const active = Boolean(activeActions[command.action]);
    return {
      ...command,
      enabled: isCommandEnabled(command.action, capabilities) || (toggle && active),
      active,
      toggle
    };
  });
}

function isCommandEnabled(action: GameUiAction, capabilities: InteractionCapabilitySnapshot): boolean {
  if (action === "open-backlog") return capabilities.canOpenBacklog;
  if (action === "toggle-skip") return capabilities.canSkip;
  if (action === "toggle-auto") return capabilities.canAuto;
  if (action === "open-save") return capabilities.canSave;
  if (action === "open-load") return capabilities.canLoad;
  if (action === "open-settings") return capabilities.canOpenSettings;
  return false;
}
