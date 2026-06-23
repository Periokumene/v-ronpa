import type { RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";
import type { PortraitSlot } from "./portraits";

export interface PresenterTracePortrait {
  characterId: string;
  portraitId?: string;
  slot: PortraitSlot;
}

export interface PresenterTracePerform {
  id: string;
  command: RuntimeCommand;
  durationMs?: number;
  blocksUserNext: boolean;
}

export interface PresenterTrace {
  backgroundId?: string;
  portraits: PresenterTracePortrait[];
  commands: RuntimeCommand[];
  activePerforms: PresenterTracePerform[];
}

export interface PresenterTraceRecorder {
  apply(command: RuntimeCommand): PresenterTracePerform | undefined;
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

      if (command.commandId === "back") {
        const appearance = stringParam(command, "appearance");
        if (appearance) trace.backgroundId = appearance;
      }

      if (command.commandId === "char") {
        const characterId = stringParam(command, "target");
        if (!characterId) return undefined;
        const slot = legacySlotForPos(command);
        trace.portraits = trace.portraits.filter((portrait) => portrait.slot !== slot);
        const portrait: PresenterTracePortrait = {
          characterId,
          slot
        };
        const portraitId = stringParam(command, "appearance");
        if (portraitId) portrait.portraitId = portraitId;
        trace.portraits.push(portrait);
      }

      if (command.commandId === "shake" || command.commandId === "flash" || command.commandId === "focus") {
        const perform: PresenterTracePerform = {
          id: `${command.commandId}:${trace.commands.length}`,
          command,
          blocksUserNext: false
        };
        const duration = numberParam(command, "durationMs") ?? numberParam(command, "duration");
        if (duration !== undefined) perform.durationMs = duration;
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

function legacySlotForPos(command: RuntimeCommand): PortraitSlot {
  const pos = vectorParam(command, "pos");
  const x = pos?.[0] ?? 0.5;
  if (x < 0.38) return "left";
  if (x > 0.62) return "right";
  return "center";
}

function stringParam(command: RuntimeCommand, key: string): string | undefined {
  const value = scalarValue(command.params[key]);
  return value === undefined ? undefined : String(value);
}

function numberParam(command: RuntimeCommand, key: string): number | undefined {
  const value = scalarValue(command.params[key]);
  return typeof value === "number" ? value : undefined;
}

function vectorParam(command: RuntimeCommand, key: string): number[] | undefined {
  const value = command.params[key];
  if (Array.isArray(value)) return value.map(scalarValue).filter((item): item is number => typeof item === "number");
  return undefined;
}

function scalarValue(value: RuntimeValue | undefined): string | number | boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => String(scalarValue(item))).join(",");
  return undefined;
}
