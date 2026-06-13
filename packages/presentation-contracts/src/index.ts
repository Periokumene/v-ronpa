import type { PresentationCommand } from "@v-ronpa/contracts";

export type LayerId = "background" | "portraits" | "effects" | "trial-overlay" | "dom";

export interface PortraitRef {
  characterId: string;
  portraitId?: string;
  slot: "left" | "center" | "right";
}

export interface EffectPresetDef {
  id: string;
  targetLayer: LayerId;
  durationMs: number;
  params?: Record<string, string | number | boolean>;
}

export interface PresentationPerform {
  id: string;
  command: PresentationCommand;
  durationMs?: number;
  blocksUserNext: boolean;
}

export interface PresentationSnapshot {
  backgroundId?: string;
  portraits: PortraitRef[];
  commands: PresentationCommand[];
  activeEffects: PresentationPerform[];
}

export interface PresenterPort {
  apply(command: PresentationCommand): Promise<PresentationPerform | undefined> | PresentationPerform | undefined;
  snapshot(): PresentationSnapshot;
  clear(): void;
}

export function createMemoryPresenter(): PresenterPort {
  const snapshot: PresentationSnapshot = {
    portraits: [],
    commands: [],
    activeEffects: []
  };

  return {
    apply(command) {
      snapshot.commands.push(command);

      if (command.type === "set-background") {
        snapshot.backgroundId = command.backgroundId;
      }

      if (command.type === "char-enter") {
        snapshot.portraits = snapshot.portraits.filter((portrait) => portrait.slot !== command.slot);
        const portrait: PortraitRef = {
          characterId: command.characterId,
          slot: command.slot
        };
        if (command.portraitId) portrait.portraitId = command.portraitId;
        snapshot.portraits.push(portrait);
      }

      if (
        command.type === "shake" ||
        command.type === "flash" ||
        command.type === "focus" ||
        command.type === "camera-focus"
      ) {
        const perform: PresentationPerform = {
          id: `${command.type}:${snapshot.commands.length}`,
          command,
          blocksUserNext: false
        };
        if ("durationMs" in command) perform.durationMs = command.durationMs;
        snapshot.activeEffects.push(perform);
        return perform;
      }

      return undefined;
    },
    snapshot() {
      const current: PresentationSnapshot = {
        portraits: [...snapshot.portraits],
        commands: [...snapshot.commands],
        activeEffects: [...snapshot.activeEffects]
      };
      if (snapshot.backgroundId) current.backgroundId = snapshot.backgroundId;
      return current;
    },
    clear() {
      delete snapshot.backgroundId;
      snapshot.portraits = [];
      snapshot.commands = [];
      snapshot.activeEffects = [];
    }
  };
}
