import { inspectVnDebugEntry } from "@v-ronpa/app-vn-runtime/debug";
import {
  validateVnDevtoolsCandidateCatalog,
  type VnDevtoolsScriptCandidate
} from "@v-ronpa/app-vn-devtools";
import { deriveLayeredCharacterPreloadPlan } from "@v-ronpa/layered-character";
import type { LayeredCharacterPreloadPlan } from "@v-ronpa/app-vn-shell";
import type { GameAStoryDefinition } from "../gameAScripts";

export type GameACandidateStoryBlockedReason =
  | "aborted"
  | "invalid-source"
  | "revision-mismatch"
  | "catalog-link-error"
  | "inspection-failed";

export type GameACandidateStoryPreparation =
  | { status: "ready"; storyDefinition: GameAStoryDefinition }
  | { status: "blocked"; reason: GameACandidateStoryBlockedReason };

/** Validates one catalog record and derives only that script's presentation plan. */
export async function prepareGameACandidateStory(
  active: GameAStoryDefinition,
  candidate: VnDevtoolsScriptCandidate,
  signal: AbortSignal
): Promise<GameACandidateStoryPreparation> {
  if (signal.aborted) return { status: "blocked", reason: "aborted" };
  try {
    const inspection = await inspectVnDebugEntry(candidate.entry, candidate.source);
    if (signal.aborted) return { status: "blocked", reason: "aborted" };
    if (!inspection.declaredRevisionMatches) return { status: "blocked", reason: "revision-mismatch" };
    if (!inspection.canMaterialize) return { status: "blocked", reason: "invalid-source" };
    const catalogValidation = await validateVnDevtoolsCandidateCatalog(candidate);
    if (signal.aborted) return { status: "blocked", reason: "aborted" };
    if (!catalogValidation.ok) return { status: "blocked", reason: catalogValidation.code };

    const nextPlan = deriveLayeredCharacterPreloadPlan(inspection.script);
    const previousPlan = active.characterPreloadPlanByScriptPath[candidate.source.scriptPath];
    const catalog = sameCatalog(active.catalog, candidate.catalog) ? active.catalog : candidate.catalog;
    return {
      status: "ready",
      storyDefinition: {
        entry: candidate.entry,
        catalog,
        characterPreloadPlanByScriptPath: {
          ...active.characterPreloadPlanByScriptPath,
          [candidate.source.scriptPath]: samePlan(previousPlan, nextPlan) ? previousPlan! : nextPlan
        }
      }
    };
  } catch {
    return signal.aborted
      ? { status: "blocked", reason: "aborted" }
      : { status: "blocked", reason: "inspection-failed" };
  }
}

function sameCatalog(
  left: GameAStoryDefinition["catalog"],
  right: GameAStoryDefinition["catalog"]
): boolean {
  return left.length === right.length && left.every((source, index) => {
    const candidate = right[index];
    return candidate?.scriptPath === source.scriptPath
      && candidate.sourceText === source.sourceText
      && candidate.scriptRevision === source.scriptRevision;
  });
}

function samePlan(
  left: LayeredCharacterPreloadPlan | undefined,
  right: LayeredCharacterPreloadPlan
): boolean {
  return Boolean(left && left.length === right.length && left.every((entry, index) => {
    const candidate = right[index];
    return candidate?.characterId === entry.characterId
      && candidate.appearanceExpressions.length === entry.appearanceExpressions.length
      && entry.appearanceExpressions.every(
        (expression, expressionIndex) => candidate.appearanceExpressions[expressionIndex] === expression
      );
  }));
}
