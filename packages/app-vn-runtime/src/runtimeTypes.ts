import type {
  AssetId,
  GameUiAction,
  InputLockState,
  PixiPresentationTaskKind,
  PixiStageSnapshot,
  RichTextDocument,
  RuntimeCommand,
  SaveableVnState,
  StoryRuntimeSnapshot,
  VnEntryDef,
  VnRuntimeScriptCatalog
} from "@v-ronpa/contracts";
import type { MediaRuntimeState, UiRuntimeState, StoryTextRevealEvent, StoryTextRevealState } from "@v-ronpa/app-vn-dispatch";
import type { PixiStageRenderHint } from "@v-ronpa/pixi-stage-model";
import type { NaniSourceDiagnosticPolicy } from "@v-ronpa/nani-runtime-compiler";
import type { VnRuntimeDiagnostic } from "./runtimeDiagnostics";
import type {
  StoryPlayAdvanceSource,
  StoryPlayStopReason,
  StoryPlayTimingPolicy
} from "@v-ronpa/story-play";

export interface VnStoryRuntime {
  state: StoryRuntimeSnapshot;
  active: boolean;
  executedScriptPaths: readonly string[];
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
  kind: PixiPresentationTaskKind;
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

export interface VnStoryTextRevealRuntime {
  state?: StoryTextRevealState;
  visibleText?: string;
  visibleRichText?: RichTextDocument | undefined;
  events: StoryTextRevealEvent[];
  eventSequence: number;
}

/** Canonical capability consumed by React VN shells. */
export interface VnRuntimeShellPort {
  advanceStory(source?: StoryPlayAdvanceSource): void;
  attachMovieElement(element: HTMLVideoElement | null): void;
  chooseStory(index: number): void;
  completeMoviePlayback(): void;
  storyTextRevealRuntime: VnStoryTextRevealRuntime;
  dismissRuntimeToast(toastId: string): void;
  interactionFacts: VnInteractionFacts;
  storyPlayActiveActions: Partial<Record<GameUiAction, boolean>>;
  storyRuntime: VnStoryRuntime;
  stopStoryAutomation(reason: StoryPlayStopReason): void;
  submitStoryInput(value: string | number | boolean): void;
  toggleStoryAuto(): void;
  toggleStorySkip(): void;
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
  resetRuntime(): void;
  restoreVnState(input: RestoreVnRuntimeStateInput): Promise<VnRestoreResult>;
  startStory(options?: StartVnStoryOptions): Promise<VnStartResult>;
}

/** Canonical diagnostic capability. */
export interface VnDiagnosticsPort {
  observeAssetDiagnostic(diagnostic: {
    code?: string;
    severity?: "info" | "warning" | "error";
    message: string;
    assetId?: string;
    capability?: string;
  }): void;
  runtimeDiagnostics: VnRuntimeDiagnostic[];
}

/** Read-only runtime observations exposed only through the explicit debug entry. */
export interface VnRuntimeDebugSnapshot {
  readonly storyRuntime: DeepReadonly<VnStoryRuntime>;
  readonly pixiStageRuntime: DeepReadonly<VnPixiStageRuntime>;
  readonly uiRuntime: DeepReadonly<VnUiRuntime>;
  readonly runtimeDiagnostics: readonly DeepReadonly<VnRuntimeDiagnostic>[];
}

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export interface UseVnRuntimeResult {
  shell: VnRuntimeShellPort;
  presentation: VnPresentationPort;
  lifecycle: VnLifecyclePort;
  diagnostics: VnDiagnosticsPort;
}

/** Explicit debug hook result; never exposed by the product runtime entry. */
export interface UseVnRuntimeWithDebugResult extends UseVnRuntimeResult {
  debug: VnRuntimeDebugSnapshot;
}

export type VnSaveCheckpointRejectionCode =
  | "inactive-entry"
  | "input-wait"
  | "movie-wait"
  | "pause-wait"
  | "ui-wait"
  | "pixi-wait"
  | "script-transition";

export type VnSaveCheckpointResult =
  | { ok: true; value: SaveableVnState }
  | { ok: false; code: VnSaveCheckpointRejectionCode; message: string };

export type VnRestoreResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "game-mismatch"
        | "entry-mismatch"
        | "script-missing"
        | "script-revision-mismatch"
        | "instruction-pointer-invalid"
        | "presentation-prepare-failed"
        | "operation-cancelled";
      message: string;
    };

export type VnStartResult =
  | { ok: true }
  | {
      ok: false;
      code: "catalog-invalid" | "script-navigation-failed" | "presentation-prepare-failed" | "operation-cancelled";
      message: string;
    };

export interface VnScriptPresentationPreparationInput {
  scriptPath: string;
  pixiStage?: PixiStageSnapshot;
  signal: AbortSignal;
}

export type VnScriptPresentationPreparationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type PrepareVnScriptPresentation = (
  input: VnScriptPresentationPreparationInput
) => Promise<VnScriptPresentationPreparationResult>;

export interface VnRuntimeDefinition {
  readonly entry: VnEntryDef;
  readonly catalog: VnRuntimeScriptCatalog;
  readonly sourceDiagnosticPolicy: NaniSourceDiagnosticPolicy;
  readonly voiceIndex?: Readonly<Record<string, Readonly<Record<string, AssetId>>>>;
}

export interface StartVnStoryOptions {
  source?: Extract<StoryPlayAdvanceSource, "start">;
}

export interface RestoreVnRuntimeStateInput {
  gameId: string;
  state: SaveableVnState;
}

export interface VnRuntimeStoryTextRevealSettings {
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
