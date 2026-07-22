import {
  createSaveableStorySnapshot,
  type PixiStageSnapshot,
  type StoryRuntimeSnapshot,
  type VnMediaCheckpoint,
  type VnUiCheckpoint
} from "@v-ronpa/contracts";
import type { VnRestoreResult, VnSaveCheckpointResult } from "./runtimeTypes";

export function collectVnSaveCheckpoint({
  active,
  allowInactive = false,
  entryId,
  script,
  transitionActive = false,
  pixiStage,
  story,
  media,
  ui
}: {
  active: boolean;
  allowInactive?: boolean;
  entryId: string;
  script: { scriptPath: string; scriptRevision: string };
  transitionActive?: boolean;
  pixiStage: PixiStageSnapshot;
  story: StoryRuntimeSnapshot;
  media: VnMediaCheckpoint;
  ui: VnUiCheckpoint;
}): VnSaveCheckpointResult {
  if (transitionActive) {
    return { ok: false, code: "script-transition", message: "VN checkpoints cannot be created during script navigation." };
  }
  if ((!allowInactive && !active) || story.ended) {
    return { ok: false, code: "inactive-entry", message: "VN checkpoints require an active story entry." };
  }
  if (story.runtimeWait) {
    const code =
      story.runtimeWait.kind === "input"
        ? "input-wait"
        : story.runtimeWait.kind === "movie"
          ? "movie-wait"
          : "pause-wait";
    return { ok: false, code, message: `VN checkpoints cannot be created during a ${story.runtimeWait.kind} wait.` };
  }
  if (story.presentationWait) {
    const code = story.presentationWait.channel === "ui" ? "ui-wait" : "pixi-wait";
    return { ok: false, code, message: `VN checkpoints cannot be created during a ${story.presentationWait.channel} wait.` };
  }
  return {
    ok: true,
    value: {
      entryId,
      script,
      story: createSaveableStorySnapshot(story),
      pixiStage,
      media,
      ui
    }
  };
}

export function validateVnRestoreIdentity({
  expectedEntryId,
  expectedGameId,
  expectedScript,
  savedEntryId,
  savedGameId,
  savedScript
}: {
  expectedEntryId: string;
  expectedGameId: string;
  expectedScript?: { scriptPath: string; scriptRevision: string };
  savedEntryId: string;
  savedGameId: string;
  savedScript: { scriptPath: string; scriptRevision: string };
}): Extract<VnRestoreResult, { ok: false }> | undefined {
  if (savedGameId !== expectedGameId) {
    return { ok: false, code: "game-mismatch", message: `Save game '${savedGameId}' does not match '${expectedGameId}'.` };
  }
  if (savedEntryId !== expectedEntryId) {
    return { ok: false, code: "entry-mismatch", message: `Save entry '${savedEntryId}' does not match '${expectedEntryId}'.` };
  }
  if (!expectedScript) {
    return {
      ok: false,
      code: "script-missing",
      message: `Save script '${savedScript.scriptPath}' is not registered.`
    };
  }
  if (savedScript.scriptRevision !== expectedScript.scriptRevision) {
    return {
      ok: false,
      code: "script-revision-mismatch",
      message: `Save script revision '${savedScript.scriptRevision}' does not match '${expectedScript.scriptRevision}'.`
    };
  }
  return undefined;
}
