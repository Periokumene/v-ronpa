import type { PresentationCommand } from "@v-ronpa/contracts";
import type { PortraitSlot } from "./portraits";

export interface PresenterTracePortrait {
  characterId: string;
  portraitId?: string;
  slot: PortraitSlot;
}

export interface PresenterTracePerform {
  id: string;
  command: PresentationCommand;
  durationMs?: number;
  blocksUserNext: boolean;
}

export interface PresenterTrace {
  backgroundId?: string;
  portraits: PresenterTracePortrait[];
  commands: PresentationCommand[];
  activePerforms: PresenterTracePerform[];
}

export interface PresenterTraceRecorder {
  apply(command: PresentationCommand): PresenterTracePerform | undefined;
  getTrace(): PresenterTrace;
  clear(): void;
}

export function createPresenterTraceRecorder(): PresenterTraceRecorder {
  const trace: PresenterTrace = {
    portraits: [],
    commands: [],
    activePerforms: []
  };

  return {
    apply(command) {
      trace.commands.push(command);

      if (command.type === "set-background") {
        trace.backgroundId = command.backgroundId;
      }

      if (command.type === "char-enter") {
        trace.portraits = trace.portraits.filter((portrait) => portrait.slot !== command.slot);
        const portrait: PresenterTracePortrait = {
          characterId: command.characterId,
          slot: command.slot
        };
        if (command.portraitId) portrait.portraitId = command.portraitId;
        trace.portraits.push(portrait);
      }

      if (
        command.type === "shake" ||
        command.type === "flash" ||
        command.type === "focus" ||
        command.type === "camera-focus"
      ) {
        const perform: PresenterTracePerform = {
          id: `${command.type}:${trace.commands.length}`,
          command,
          blocksUserNext: false
        };
        if ("durationMs" in command) perform.durationMs = command.durationMs;
        trace.activePerforms.push(perform);
        return perform;
      }

      return undefined;
    },
    getTrace() {
      const current: PresenterTrace = {
        portraits: [...trace.portraits],
        commands: [...trace.commands],
        activePerforms: [...trace.activePerforms]
      };
      if (trace.backgroundId) current.backgroundId = trace.backgroundId;
      return current;
    },
    clear() {
      delete trace.backgroundId;
      trace.portraits = [];
      trace.commands = [];
      trace.activePerforms = [];
    }
  };
}
