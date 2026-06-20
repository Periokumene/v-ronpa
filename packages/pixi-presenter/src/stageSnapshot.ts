import type { PixiStageSnapshot, PixiStageSlotId, PresentationCommand } from "@v-ronpa/contracts";

export type PixiStageRenderHint = Extract<
  PresentationCommand,
  { type: "flash" | "shake" | "trial-keyword" | "trial-subtitle" }
>;

export interface PixiStageCommandReduction {
  snapshot: PixiStageSnapshot;
  hints: PixiStageRenderHint[];
}

export const pixiStageSlots: PixiStageSlotId[] = ["left", "center", "right"];

export function createInitialPixiStageSnapshot(): PixiStageSnapshot {
  return {
    version: 1,
    revision: 0,
    slots: {}
  };
}

export function reducePixiStageCommand(
  snapshot: PixiStageSnapshot,
  command: PresentationCommand
): PixiStageCommandReduction {
  if (command.type === "set-background") {
    return {
      snapshot: {
        ...snapshot,
        revision: snapshot.revision + 1,
        background: { backgroundId: command.backgroundId }
      },
      hints: []
    };
  }

  if (command.type === "char-enter") {
    const portrait = {
      slot: command.slot,
      characterId: command.characterId,
      ...(command.portraitId ? { portraitId: command.portraitId } : {})
    };
    return {
      snapshot: {
        ...snapshot,
        revision: snapshot.revision + 1,
        slots: {
          ...snapshot.slots,
          [command.slot]: portrait
        }
      },
      hints: []
    };
  }

  if (
    command.type === "flash" ||
    command.type === "shake" ||
    command.type === "trial-keyword" ||
    command.type === "trial-subtitle"
  ) {
    return {
      snapshot,
      hints: [command]
    };
  }

  return {
    snapshot,
    hints: []
  };
}
