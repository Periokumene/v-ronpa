import { PIXI_MAIN_BACKGROUND_ID, type PixiStageSnapshot } from "@v-ronpa/contracts";

export function resolvePixiActorTarget(target: string | undefined, stage: PixiStageSnapshot): string[] {
  if (!target || target === PIXI_MAIN_BACKGROUND_ID) {
    return stage.backgroundsById[PIXI_MAIN_BACKGROUND_ID] ? [PIXI_MAIN_BACKGROUND_ID] : [];
  }
  if (target === "*") {
    return [
      ...Object.values(stage.backgroundsById).filter((actor) => actor.visible).map((actor) => actor.id),
      ...Object.values(stage.charactersById).filter((actor) => actor.visible).map((actor) => actor.id)
    ];
  }
  if (target === "stage" || target === "camera") return ["stage"];
  return stage.backgroundsById[target] || stage.charactersById[target] ? [target] : [];
}
