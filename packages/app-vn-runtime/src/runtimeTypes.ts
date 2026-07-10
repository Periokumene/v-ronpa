import type {
  GameUiAction,
  InputLockState,
  PixiStageSnapshot,
  RichTextDocument,
  RuntimeCommand,
  SaveableVnState,
  StoryRuntimeSnapshot
} from "@v-ronpa/contracts";
import type { MediaRuntimeState, UiRuntimeState, DialogRevealEvent, DialogRevealState } from "@v-ronpa/app-vn-dispatch";
import type { VnSessionState } from "@v-ronpa/app-vn-session";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import type { VnRuntimeDiagnostic } from "./runtimeDiagnostics";
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

export interface VnInteractionFacts {
  hasActiveStory: boolean;
  storyHasChoices: boolean;
  storyEnded: boolean;
  isAtStableStop: boolean;
  inputLock: InputLockState;
}

export interface VnPixiStageRuntime {
  snapshot: PixiStageSnapshot;
  hints: PixiStageRenderHint[];
  hintSequence: number;
  animate: boolean;
  presentationTasks: PresentationTaskObservation[];
}

export interface PresentationTaskObservation {
  kind: string;
  target: string;
  revision: number;
  status: "running" | "completed" | "cancelled" | "settled";
  durationMs: number;
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

/** Canonical capability consumed by React VN shells. */
export interface VnRuntimeShellPort {
  advanceStory(source?: StoryPlayAdvanceSource): void;
  attachMovieElement(element: HTMLVideoElement | null): void;
  chooseStory(index: number): void;
  completeMoviePlayback(): void;
  dialogRevealRuntime: VnDialogRevealRuntime;
  dismissRuntimeToast(toastId: string): void;
  interactionFacts: VnInteractionFacts;
  storyPlayActiveActions: Partial<Record<GameUiAction, boolean>>;
  storyRuntime: VnStoryRuntime;
  submitStoryInput(value: string | number | boolean): void;
  uiRuntime: VnUiRuntime;
}

/** Canonical renderer-facing presentation capability. */
export interface VnPresentationPort {
  pixiStageRuntime: VnPixiStageRuntime;
  storySession: number;
  updatePixiPresentationTasks(tasks: PresentationTaskObservation[]): void;
}

/** Canonical lifecycle capability for app composition and save/load. */
export interface VnLifecyclePort {
  createVnSaveCheckpoint(options?: { allowInactive?: boolean }): VnSaveCheckpointResult;
  resetRuntime(options?: { stopMedia?: boolean }): void;
  restoreVnState(input: RestoreVnRuntimeStateInput): VnRestoreResult;
  startStory(options?: StartVnStoryOptions): void;
}

/** Canonical diagnostic capability. */
export interface VnDiagnosticsPort {
  observeAssetDiagnostic(diagnostic: {
    code?: string;
    severity?: "info" | "warning" | "error";
    message: string;
    assetId?: string;
    kind?: string;
  }): void;
  runtimeDiagnostics: VnRuntimeDiagnostic[];
}

/** Explicit debug-only capability; product shells must not depend on it. */
export interface VnRuntimeDebugPort {
  lastRuntimeCommandCount: number;
  mediaRuntime: VnMediaRuntime;
  storyPlay: StoryPlayState;
  storyPlaySchedule: StoryPlaySchedule;
  storySessionState: VnSessionState;
  stopStoryAutomation(reason: StoryPlayStopReason): void;
  toggleStoryAuto(): void;
  toggleStorySkip(): void;
}

export interface UseVnRuntimeResult {
  shell: VnRuntimeShellPort;
  presentation: VnPresentationPort;
  lifecycle: VnLifecyclePort;
  diagnostics: VnDiagnosticsPort;
  debug: VnRuntimeDebugPort;
}

export interface VnRuntimeEntry {
  id: string;
  scriptRevision: string;
  scriptPath: string;
  sourceText: string;
  startLabel?: string;
  profile?: "vn2d" | "vn3d";
}

export type VnSaveCheckpointRejectionCode =
  | "inactive-entry"
  | "input-wait"
  | "movie-wait"
  | "pause-wait"
  | "ui-wait"
  | "pixi-wait";

export type VnSaveCheckpointResult =
  | { ok: true; value: SaveableVnState }
  | { ok: false; code: VnSaveCheckpointRejectionCode; message: string };

export type VnRestoreResult =
  | { ok: true }
  | { ok: false; code: "game-mismatch" | "entry-mismatch" | "script-revision-mismatch"; message: string };

export interface StartVnStoryOptions {
  source?: Extract<StoryPlayAdvanceSource, "start">;
}

export interface RestoreVnRuntimeStateInput {
  gameId: string;
  state: SaveableVnState;
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
