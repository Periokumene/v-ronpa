import type { ComponentType, ReactNode } from "react";
import type {
  GameMode,
  GameOverlayKind,
  GamePauseSection,
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
import type { VnRuntimeShellPort } from "@v-ronpa/app-vn-runtime";
import {
  resolveVnDialogAppearance,
  type VnDialogAppearance as SharedVnDialogAppearance
} from "@v-ronpa/ui-kit";
import {
  selectUiSurfacePresentation,
  type RuntimeInputPrompt,
  type RuntimePinpContent,
  type RuntimeToast,
  type UiRuntimeState,
  type UiSurfacePresentation
} from "@v-ronpa/app-vn-dispatch";
import { selectCurrentStoryLine } from "@v-ronpa/story-engine";

export interface GameFlowShellAdapter {
  activeOverlay: GameOverlayKind | undefined;
  pauseSection: GamePauseSection | undefined;
  capabilities: InteractionCapabilitySnapshot;
  mode: GameMode;
  closeOverlay(): void;
  openPauseSection(section: GamePauseSection): void;
  resumeFromPause(): void;
  send(event: { type: string; [key: string]: unknown }): void;
}

export interface VnStoryTextDisplaySettings {
  textSize: "small" | "medium" | "large";
  textSpeed: number;
}

export type VnDialogAppearance = SharedVnDialogAppearance;

export interface SurfaceSlotProps<TModel, TActions = Record<string, never>> {
  model: TModel;
  actions: TActions;
}

export type SurfaceSlotComponent<TModel, TActions = Record<string, never>> = ComponentType<
  SurfaceSlotProps<TModel, TActions>
>;

export interface PauseSurfaceViewModel {
  activeSection: GamePauseSection;
  capabilities: InteractionCapabilitySnapshot;
  navigationLocked: boolean;
}

export interface PauseSurfaceActions {
  close(): void;
  dispatch(action: GameUiAction): void;
}

export type PauseSurfaceSlotComponent = ComponentType<
  SurfaceSlotProps<PauseSurfaceViewModel, PauseSurfaceActions> & { children?: ReactNode }
>;

export type VnDialogState = "line" | "choices" | "ended";

export interface VnDialogViewModel {
  visible: boolean;
  presentation: UiSurfacePresentation;
  appearance: VnDialogAppearance;
  speakerId?: string | undefined;
  speakerLabel?: string | undefined;
  text: string;
  richText?: RichTextDocument | undefined;
  state: VnDialogState;
  display?: VnStoryTextDisplaySettings | undefined;
}

export interface VnCueViewModel {
  visible: boolean;
  presentation: UiSurfacePresentation;
  authorId?: string | undefined;
  text: string;
  richText?: RichTextDocument | undefined;
  display?: VnStoryTextDisplaySettings | undefined;
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

export type GameCommandAvailability = Partial<Record<GameUiAction, boolean>>;

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

export interface RuntimePinpViewModel extends RuntimePinpContent {
  visible: boolean;
  presentation: UiSurfacePresentation;
  revision: number;
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
  placement: "pause";
  entries: StoryBacklogEntry[];
}

export interface BacklogOverlayActions {
  close(): void;
}

export interface SaveLoadOverlayViewModel {
  visible: boolean;
  placement: "overlay" | "pause";
  mode: "save" | "load";
  slotIds: string[];
  slots: SaveSlotSummary[];
  slotPreviewsById: Record<string, SaveSlotPreviewViewModel>;
  canSave: boolean;
  pendingLoadSlot: SaveSlotSummary | undefined;
  busy: boolean;
  activeOperation: SaveLoadActiveOperation | undefined;
  lastError: SaveLoadErrorViewModel | undefined;
}

export type SaveLoadOperationKind =
  | "refresh"
  | "save"
  | "quick-save"
  | "request-load"
  | "confirm-load"
  | "quick-load"
  | "load-previews";

export interface SaveLoadActiveOperation {
  kind: SaveLoadOperationKind;
  slotId?: string;
}

export interface SaveLoadErrorViewModel {
  code?: string;
  message: string;
}

export interface SaveSlotPreviewViewModel {
  kind: "image";
  uri: string;
  mime: "image/webp";
  width: number;
  height: number;
}

export interface SaveLoadOverlayActions {
  save(slotId: string): void;
  requestLoad(slotId: string): void;
  confirmLoad(): void;
  cancelLoad(): void;
  loadPreviews?(slotIds: string[]): void;
  close(): void;
}

export interface SettingsOverlayViewModel {
  visible: boolean;
  placement: "overlay" | "pause";
  settings: SettingsSnapshot;
}

export interface SettingsOverlayActions {
  patchSettings(patch: SettingsPatch): void;
  resetSettings(): void;
  close(): void;
}

export interface GameInteractionOverlayActions {
  backlog?: BacklogOverlayActions | undefined;
  saveLoad?: SaveLoadOverlayActions | undefined;
  settings?: SettingsOverlayActions | undefined;
}

export interface GameInteractionShellViewModels {
  dialog?: VnDialogViewModel | undefined;
  cue?: VnCueViewModel | undefined;
  pinp?: RuntimePinpViewModel | undefined;
  choices?: VnChoicesViewModel | undefined;
  commandBar?: VnCommandBarViewModel | undefined;
  title?: TitleViewModel | undefined;
  toastLayer?: RuntimeToastLayerViewModel | undefined;
  inputPrompt?: RuntimeInputPromptViewModel | undefined;
  backlog?: BacklogOverlayViewModel | undefined;
  saveLoad?: SaveLoadOverlayViewModel | undefined;
  settings?: SettingsOverlayViewModel | undefined;
}

export type SaveLoadOverlayInputModel = Omit<
  SaveLoadOverlayViewModel,
  "visible" | "placement" | "slotPreviewsById" | "busy" | "activeOperation" | "lastError"
> &
  Partial<Pick<SaveLoadOverlayViewModel, "slotPreviewsById" | "busy" | "activeOperation" | "lastError">>;

export interface GameInteractionOverlayViewModelInputs {
  saveLoad?: SaveLoadOverlayInputModel | undefined;
  settings?: SettingsSnapshot | undefined;
}

export interface GameInteractionShellSurfaces {
  Dialog: SurfaceSlotComponent<VnDialogViewModel>;
  Cue: SurfaceSlotComponent<VnCueViewModel>;
  Pinp: SurfaceSlotComponent<RuntimePinpViewModel>;
  Choices: SurfaceSlotComponent<VnChoicesViewModel, VnChoicesActions>;
  CommandBar: SurfaceSlotComponent<VnCommandBarViewModel, VnCommandBarActions>;
  Title: SurfaceSlotComponent<TitleViewModel, TitleActions>;
  ToastLayer: SurfaceSlotComponent<RuntimeToastLayerViewModel, RuntimeToastActions>;
  InputPrompt: SurfaceSlotComponent<RuntimeInputPromptViewModel, RuntimeInputPromptActions>;
  PauseSurface: PauseSurfaceSlotComponent;
  BacklogOverlay: SurfaceSlotComponent<BacklogOverlayViewModel, BacklogOverlayActions>;
  SaveLoadOverlay: SurfaceSlotComponent<SaveLoadOverlayViewModel, SaveLoadOverlayActions>;
  SettingsOverlay: SurfaceSlotComponent<SettingsOverlayViewModel, SettingsOverlayActions>;
}

export interface CreateGameInteractionShellViewModelsInput {
  commandAvailability?: GameCommandAvailability | undefined;
  dialogAppearance?: Partial<VnDialogAppearance> | undefined;
  storyTextDisplay?: VnStoryTextDisplaySettings | undefined;
  flow: Pick<GameFlowShellAdapter, "activeOverlay" | "pauseSection" | "capabilities" | "mode">;
  formatStorySpeaker?: ((speaker: string) => string) | undefined;
  overlayModels?: GameInteractionOverlayViewModelInputs | undefined;
  host?: { naviSubstate?: NaviSubstate | undefined } | undefined;
  runtime: VnRuntimeShellPort;
  title?: string | undefined;
}

const COMMAND_BAR_COMMANDS: Array<{ action: GameUiAction; label: string; testId: string }> = [
  { action: "open-backlog", label: "LOG", testId: "vn-command-backlog" },
  { action: "toggle-skip", label: "SKIP", testId: "vn-command-skip" },
  { action: "toggle-auto", label: "AUTO", testId: "vn-command-auto" },
  { action: "open-save", label: "SAVE", testId: "vn-command-save" },
  { action: "quick-save", label: "Q.SAVE", testId: "vn-command-quick-save" },
  { action: "open-load", label: "LOAD", testId: "vn-command-load" },
  { action: "quick-load", label: "Q.LOAD", testId: "vn-command-quick-load" },
  { action: "open-settings", label: "SETTING", testId: "vn-command-settings" }
];

export function createGameInteractionShellViewModels({
  commandAvailability,
  dialogAppearance,
  storyTextDisplay,
  flow,
  formatStorySpeaker,
  overlayModels,
  host,
  runtime,
  title = "V-Ronpa"
}: CreateGameInteractionShellViewModelsInput): GameInteractionShellViewModels {
  const dialogPresentation = selectUiSurfacePresentation(runtime.uiRuntime.state, "dialog");
  const cuePresentation = selectUiSurfacePresentation(runtime.uiRuntime.state, "cue");
  const pinpPresentation = selectUiSurfacePresentation(runtime.uiRuntime.state, "pinp");
  const commandBarPresentation = selectUiSurfacePresentation(runtime.uiRuntime.state, "commandBar");
  const toastLayerPresentation = selectUiSurfacePresentation(runtime.uiRuntime.state, "toastLayer");
  const showPlayableUi = flow.mode !== "title" && flow.mode !== "paused";
  const currentLine = runtime.storyRuntime.active
    ? selectCurrentStoryLine(runtime.storyRuntime.state)
    : undefined;
  const showCue = runtime.storyRuntime.active && showPlayableUi && cuePresentation.mounted && currentLine?.channel === "cue";
  const showPinp = runtime.storyRuntime.active &&
    showPlayableUi &&
    pinpPresentation.mounted &&
    Boolean(runtime.uiRuntime.state.pinp);
  const showDialog = runtime.storyRuntime.active &&
    showPlayableUi &&
    dialogPresentation.mounted &&
    !(currentLine?.channel === "cue" && cuePresentation.mounted);
  const dialogLine = currentLine?.channel === "dialog" ? currentLine : undefined;
  const storyHasChoices = runtime.storyRuntime.state.pendingChoices.length > 0;
  const dialogState: VnDialogState = runtime.storyRuntime.state.ended ? "ended" : storyHasChoices ? "choices" : "line";
  const showChoices =
    runtime.storyRuntime.active &&
    (flow.mode === "vn" || (flow.mode === "navi" && host?.naviSubstate === "vn2d-overlay")) &&
    !runtime.storyRuntime.state.ended &&
    storyHasChoices;
  const showCommandBar =
    runtime.storyRuntime.active && showPlayableUi && commandBarPresentation.mounted;

  return {
    ...(showDialog
      ? {
          dialog: {
            visible: true,
            presentation: dialogPresentation,
            appearance: resolveVnDialogAppearance(dialogAppearance),
            ...(dialogLine?.speaker ? { speakerId: dialogLine.speaker } : {}),
            ...(dialogLine?.speaker
              ? { speakerLabel: formatStorySpeaker ? formatStorySpeaker(dialogLine.speaker) : dialogLine.speaker }
              : {}),
            text: dialogLine ? runtime.storyTextRevealRuntime.visibleText ?? dialogLine.text : "",
            ...(dialogLine && (runtime.storyTextRevealRuntime.visibleRichText ?? dialogLine.richText)
              ? { richText: runtime.storyTextRevealRuntime.visibleRichText ?? dialogLine.richText }
              : {}),
            state: dialogState,
            ...(storyTextDisplay ? { display: storyTextDisplay } : {})
          }
        }
      : {}),
    ...(showCue
      ? {
          cue: {
            visible: true,
            presentation: cuePresentation,
            ...(currentLine.speaker ? { authorId: currentLine.speaker } : {}),
            text: runtime.storyTextRevealRuntime.visibleText ?? currentLine.text,
            ...(runtime.storyTextRevealRuntime.visibleRichText ?? currentLine.richText
              ? { richText: runtime.storyTextRevealRuntime.visibleRichText ?? currentLine.richText }
              : {}),
            ...(storyTextDisplay ? { display: storyTextDisplay } : {})
          }
        }
      : {}),
    ...(showPinp && runtime.uiRuntime.state.pinp
      ? {
          pinp: {
            visible: true,
            presentation: pinpPresentation,
            revision: runtime.uiRuntime.state.pinpSequence,
            ...runtime.uiRuntime.state.pinp
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
            commands: createCommandBarCommands(flow.capabilities, runtime.storyPlayActiveActions, commandAvailability),
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
    ...(flow.pauseSection === "backlog"
      ? { backlog: { visible: true, placement: "pause", entries: runtime.storyRuntime.state.backlog } }
      : {}),
    ...((flow.pauseSection === "save" || flow.pauseSection === "load" || flow.activeOverlay === "title-load") &&
    overlayModels?.saveLoad
      ? {
          saveLoad: {
            ...overlayModels.saveLoad,
            placement: flow.activeOverlay === "title-load" ? "overlay" : "pause",
            slotPreviewsById: overlayModels.saveLoad.slotPreviewsById ?? {},
            busy: overlayModels.saveLoad.busy ?? false,
            activeOperation: overlayModels.saveLoad.activeOperation,
            lastError: overlayModels.saveLoad.lastError,
            visible: true
          }
        }
      : {}),
    ...((flow.activeOverlay === "title-settings" || flow.pauseSection === "settings") && overlayModels?.settings
      ? { settings: { visible: true, placement: flow.activeOverlay === "title-settings" ? "overlay" : "pause", settings: overlayModels.settings } }
      : {})
  };
}

export function createCommandBarCommands(
  capabilities: InteractionCapabilitySnapshot,
  activeActions: Partial<Record<GameUiAction, boolean>> = {},
  commandAvailability: GameCommandAvailability = {}
): VnCommandBarCommandViewModel[] {
  return COMMAND_BAR_COMMANDS.map((command) => {
    const toggle = command.action === "toggle-auto" || command.action === "toggle-skip";
    const active = Boolean(activeActions[command.action]);
    const baseEnabled = isCommandEnabled(command.action, capabilities) || (toggle && active);
    return {
      ...command,
      enabled: baseEnabled && (commandAvailability[command.action] ?? true),
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
  if (action === "quick-save") return capabilities.canSave;
  if (action === "open-load") return capabilities.canLoad;
  if (action === "quick-load") return capabilities.canLoad;
  if (action === "open-settings") return capabilities.canOpenSettings;
  return false;
}
