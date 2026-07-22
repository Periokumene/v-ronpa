import { useCallback } from "react";
import type {
  PrepareVnScriptPresentation,
  VnScriptPresentationPreparationInput,
  VnScriptPresentationPreparationResult
} from "@v-ronpa/app-vn-runtime";
import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { PixiStageHandle, VnPixiCharacterPreparationPlan } from "./PixiLayer";
import { usePixiStageReadiness, type PixiStageReadiness } from "./usePixiStageReadiness";

export interface UsePixiVnScriptPreparationOptions {
  initialScriptPath: string;
  plansByScriptPath: Readonly<Record<string, VnPixiCharacterPreparationPlan>>;
}

export interface PixiVnScriptPreparation {
  initialCharacterPreloadPlan: VnPixiCharacterPreparationPlan;
  prepareScriptPresentation: PrepareVnScriptPresentation;
  stage: PixiStageReadiness;
}

export function usePixiVnScriptPreparation({
  initialScriptPath,
  plansByScriptPath
}: UsePixiVnScriptPreparationOptions): PixiVnScriptPreparation {
  const stage = usePixiStageReadiness();
  const prepareScriptPresentation = useCallback(
    (input: VnScriptPresentationPreparationInput) => preparePixiVnScriptPresentation({
      getHandle: () => stage.handle,
      plansByScriptPath,
      waitUntilReady: stage.waitUntilReady
    }, input),
    [plansByScriptPath, stage.handle, stage.waitUntilReady]
  );

  return {
    initialCharacterPreloadPlan: plansByScriptPath[initialScriptPath] ?? [],
    prepareScriptPresentation,
    stage
  };
}

interface PreparePixiVnScriptPresentationOptions {
  getHandle(): PixiStageHandle | undefined;
  plansByScriptPath: Readonly<Record<string, VnPixiCharacterPreparationPlan>>;
  waitUntilReady(): Promise<boolean>;
}

export async function preparePixiVnScriptPresentation(
  options: PreparePixiVnScriptPresentationOptions,
  input: VnScriptPresentationPreparationInput
): Promise<VnScriptPresentationPreparationResult> {
  if (!(await options.waitUntilReady()) || input.signal.aborted) {
    return { ok: false, code: "pixi-stage-unavailable", message: "The Pixi stage is not ready." };
  }
  const handle = options.getHandle();
  if (!handle) return { ok: false, code: "pixi-stage-unavailable", message: "The Pixi stage is not ready." };
  const basePlan = options.plansByScriptPath[input.scriptPath] ?? [];
  const result = await handle.prepareCharacters(mergeVisibleCharacterExpressions(basePlan, input.pixiStage));
  if (result.ok) return result;
  return {
    ok: false,
    code: "character-prepare-failed",
    message: `Failed to prepare ${result.failures.map(
      (failure) => `${failure.characterId}.${failure.expression || "default"}`
    ).join(", ")}.`
  };
}

export function mergeVisibleCharacterExpressions(
  basePlan: VnPixiCharacterPreparationPlan,
  savedPixiStage: PixiStageSnapshot | undefined
): VnPixiCharacterPreparationPlan {
  if (!savedPixiStage) return basePlan;
  const expressionsByCharacter = new Map<string, string[]>();
  for (const record of basePlan) {
    expressionsByCharacter.set(record.characterId, [...new Set(record.appearanceExpressions)]);
  }
  for (const character of Object.values(savedPixiStage.charactersById)) {
    const expressions = expressionsByCharacter.get(character.id) ?? [];
    if (!expressions.includes(character.appearanceExpression)) expressions.push(character.appearanceExpression);
    expressionsByCharacter.set(character.id, expressions);
  }
  return [...expressionsByCharacter].map(([characterId, appearanceExpressions]) => ({
    characterId,
    appearanceExpressions
  }));
}
