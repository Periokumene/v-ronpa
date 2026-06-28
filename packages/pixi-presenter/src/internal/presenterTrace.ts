import type { RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";

export interface PresenterTraceCharacter {
  characterId: string;
  appearanceExpression: string;
}

export interface PresenterTracePerform {
  id: string;
  command: RuntimeCommand;
  durationMs?: number;
  blocksUserNext: boolean;
}

export interface PresenterTrace {
  backgroundId?: string;
  characters: PresenterTraceCharacter[];
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
    characters: [],
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
        trace.characters = trace.characters.filter((character) => character.characterId !== characterId);
        trace.characters.push({
          characterId,
          appearanceExpression: stringParam(command, "appearanceExpression") ?? ""
        });
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
        characters: [...trace.characters],
        commands: [...trace.commands],
        activePerforms: [...trace.activePerforms]
      };
      if (trace.backgroundId) current.backgroundId = trace.backgroundId;
      return current;
    },
    clear() {
      delete trace.backgroundId;
      trace.characters = [];
      trace.commands = [];
      trace.activePerforms = [];
    }
  };
}

function stringParam(command: RuntimeCommand, key: string): string | undefined {
  const value = scalarValue(command.params[key]);
  return value === undefined ? undefined : String(value);
}

function numberParam(command: RuntimeCommand, key: string): number | undefined {
  const value = scalarValue(command.params[key]);
  return typeof value === "number" ? value : undefined;
}

function scalarValue(value: RuntimeValue | undefined): string | number | boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => String(scalarValue(item))).join(",");
  return undefined;
}
