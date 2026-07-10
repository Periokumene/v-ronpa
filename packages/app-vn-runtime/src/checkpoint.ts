import {
  createSaveableStorySnapshot,
  type PixiStageSnapshot,
  type StoryRuntimeSnapshot,
  type VnMediaCheckpoint,
  type VnUiCheckpoint
} from "@v-ronpa/contracts";
import type { VnRestoreResult, VnRuntimeEntry, VnSaveCheckpointResult } from "./runtimeTypes";

export function collectVnSaveCheckpoint({
  active,
  allowInactive = false,
  entry,
  pixiStage,
  story,
  media,
  ui
}: {
  active: boolean;
  allowInactive?: boolean;
  entry: Pick<VnRuntimeEntry, "id" | "scriptRevision">;
  pixiStage: PixiStageSnapshot;
  story: StoryRuntimeSnapshot;
  media: VnMediaCheckpoint;
  ui: VnUiCheckpoint;
}): VnSaveCheckpointResult {
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
      entryId: entry.id,
      scriptRevision: entry.scriptRevision,
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
  expectedScriptRevision,
  savedEntryId,
  savedGameId,
  savedScriptRevision
}: {
  expectedEntryId: string;
  expectedGameId: string;
  expectedScriptRevision: string;
  savedEntryId: string;
  savedGameId: string;
  savedScriptRevision: string;
}): Extract<VnRestoreResult, { ok: false }> | undefined {
  if (savedGameId !== expectedGameId) {
    return { ok: false, code: "game-mismatch", message: `Save game '${savedGameId}' does not match '${expectedGameId}'.` };
  }
  if (savedEntryId !== expectedEntryId) {
    return { ok: false, code: "entry-mismatch", message: `Save entry '${savedEntryId}' does not match '${expectedEntryId}'.` };
  }
  if (savedScriptRevision !== expectedScriptRevision) {
    return {
      ok: false,
      code: "script-revision-mismatch",
      message: `Save script revision '${savedScriptRevision}' does not match '${expectedScriptRevision}'.`
    };
  }
  return undefined;
}
