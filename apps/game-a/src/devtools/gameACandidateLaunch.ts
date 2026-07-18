import { inspectVnDebugEntry } from "@v-ronpa/app-vn-runtime/debug";
import type { VnRuntimeEntry } from "@v-ronpa/app-vn-runtime";
import { deriveLayeredCharacterPreloadPlan } from "@v-ronpa/layered-character";
import type { GameAVnLaunchDefinition } from "../gameAScripts";

export type GameACandidateLaunchBlockedReason =
  | "aborted"
  | "invalid-source"
  | "revision-mismatch"
  | "inspection-failed";

export type GameACandidateLaunchPreparation =
  | {
      status: "ready";
      launchDefinition: GameAVnLaunchDefinition;
    }
  | {
      status: "blocked";
      reason: GameACandidateLaunchBlockedReason;
    };

/**
 * Verifies a DEV candidate and derives the app-owned presentation preload plan from the exact
 * compiled script that produced its revision. Callers must install only the returned definition,
 * so an invalid or superseded candidate cannot mutate the active entry or its prepared assets.
 */
export async function prepareGameACandidateLaunch(
  entry: VnRuntimeEntry,
  signal: AbortSignal
): Promise<GameACandidateLaunchPreparation> {
  if (signal.aborted) return { status: "blocked", reason: "aborted" };

  try {
    const inspection = await inspectVnDebugEntry(entry);
    if (signal.aborted) return { status: "blocked", reason: "aborted" };
    if (!inspection.declaredRevisionMatches) {
      return { status: "blocked", reason: "revision-mismatch" };
    }
    if (!inspection.canMaterialize) {
      return { status: "blocked", reason: "invalid-source" };
    }

    return {
      status: "ready",
      launchDefinition: {
        runtimeEntry: entry,
        characterPreloadPlan: deriveLayeredCharacterPreloadPlan(inspection.script)
      }
    };
  } catch {
    return signal.aborted
      ? { status: "blocked", reason: "aborted" }
      : { status: "blocked", reason: "inspection-failed" };
  }
}

/**
 * Keeps the Pixi preparation identity stable when a candidate references the
 * exact same layered-character textures. The runtime entry still changes so
 * source locations and anchors can refresh, but the presenter has no reason to
 * destroy and upload an equivalent plan again.
 */
export function stabilizeGameACandidateLaunch(
  active: GameAVnLaunchDefinition,
  candidate: GameAVnLaunchDefinition
): GameAVnLaunchDefinition {
  if (!layeredCharacterPreloadPlansEqual(active.characterPreloadPlan, candidate.characterPreloadPlan)) {
    return candidate;
  }
  return {
    ...candidate,
    characterPreloadPlan: active.characterPreloadPlan
  };
}

function layeredCharacterPreloadPlansEqual(
  left: GameAVnLaunchDefinition["characterPreloadPlan"],
  right: GameAVnLaunchDefinition["characterPreloadPlan"]
): boolean {
  return left.length === right.length && left.every((entry, index) => {
    const candidate = right[index];
    return candidate?.characterId === entry.characterId
      && candidate.appearanceExpressions.length === entry.appearanceExpressions.length
      && entry.appearanceExpressions.every(
        (expression, expressionIndex) => candidate.appearanceExpressions[expressionIndex] === expression
      );
  });
}
