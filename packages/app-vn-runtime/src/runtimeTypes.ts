import type {
  GameInteractionContext,
  GameUiAction,
  PixiStageSnapshot,
  RichTextDocument,
  RuntimeCommand,
  StoryRuntimeSnapshot
} from "@v-ronpa/contracts";
import type { MediaRuntimeState, UiRuntimeState, DialogRevealEvent, DialogRevealState } from "@v-ronpa/app-vn-dispatch";
import type { VnSessionState } from "@v-ronpa/app-vn-session";
import type { PixiPresentationTaskSnapshot, PixiStageRenderHint } from "@v-ronpa/pixi-presenter";
import type {
  StoryPlayAdvanceSource,
  StoryPlaySchedule,
  StoryPlayState,
  StoryPlayStopReason,
  StoryPlayTimingPolicy
} from "@v-ronpa/story-play";

export interface VnStoryRuntime {
  state: StoryRuntimeSnapshot;
  active: boolean;
}

export interface VnPixiStageRuntime {
  snapshot: PixiStageSnapshot;
  hints: PixiStageRenderHint[];
  hintSequence: number;
  animate: boolean;
  presentationTasks: PixiPresentationTaskSnapshot[];
}

export interface VnMediaRuntime {
  state: MediaRuntimeState;
}

export interface VnUiRuntime {
  state: UiRuntimeState;
}

export interface VnDialogRevealRuntime {
  state?: DialogRevealState;
  visibleText?: string;
  visibleRichText?: RichTextDocument | undefined;
  events: DialogRevealEvent[];
  eventSequence: number;
}

export interface VnRuntimeShellAdapter {
  advanceStory(source?: StoryPlayAdvanceSource): void;
  attachMovieElement(element: HTMLVideoElement | null): void;
  chooseStory(index: number): void;
  completeMoviePlayback(): void;
  dialogRevealRuntime: VnDialogRevealRuntime;
  dismissRuntimeToast(toastId: string): void;
  interactionContext: GameInteractionContext;
  storyPlayActiveActions: Partial<Record<GameUiAction, boolean>>;
  storyRuntime: VnStoryRuntime;
  submitStoryInput(value: string | number | boolean): void;
  uiRuntime: VnUiRuntime;
}

export interface VnRuntimeStateAdapter extends VnRuntimeShellAdapter {
  lastRuntimeCommandCount: number;
  mediaRuntime: VnMediaRuntime;
  pixiStageRuntime: VnPixiStageRuntime;
  storyPlay: StoryPlayState;
  storyPlaySchedule: StoryPlaySchedule;
  storySession: number;
  storySessionState: VnSessionState;
  stopStoryAutomation(reason: StoryPlayStopReason): void;
  toggleStoryAuto(): void;
  toggleStorySkip(): void;
  updatePixiPresentationTasks(tasks: PixiPresentationTaskSnapshot[]): void;
}

export interface VnRuntimeEntry {
  id?: string;
  scriptPath: string;
  sourceText: string;
  startLabel?: string;
  profile?: "vn2d" | "vn3d";
}

export interface VnRuntimeDialogRevealSettings {
  textSpeed: number;
}

export interface VnRuntimeVoiceSettings {
  locale: string;
  volume: number;
}

export interface VnRuntimeDialogueBleepSettings {
  volume: number;
}

export interface VnRuntimeStoryPlayTimingOptions {
  storyPlayTiming?: Partial<StoryPlayTimingPolicy>;
}

export interface VnRuntimeCommandCommitInput {
  active: boolean;
  forcePixiCommit?: boolean;
  previousPixiStage: PixiStageSnapshot;
  runtimeCommands: RuntimeCommand[];
  source: StoryPlayAdvanceSource;
}
