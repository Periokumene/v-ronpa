import type { RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";

export interface MediaRuntimeBgmTrack {
  key: string;
  group: string;
  sourceRef: string;
}

export interface MediaRuntimeSfxLoop {
  key: string;
  group?: string;
  sourceRef: string;
}

export interface MediaRuntimeState {
  bgmByGroup: Record<string, MediaRuntimeBgmTrack>;
  loopingSfxByKey: Record<string, MediaRuntimeSfxLoop>;
}

export type MediaRuntimeEffect =
  | { type: "play-bgm"; key: string; group: string; sourceRef: string; volume?: number; fadeMs?: number }
  | { type: "stop-bgm"; key: string; group: string; fadeMs?: number }
  | { type: "play-sfx"; sourceRef: string; loop: boolean; fast: boolean; key?: string; group?: string; volume?: number }
  | { type: "stop-sfx"; key: string; group?: string; fadeMs?: number }
  | { type: "play-dialogue-bleep"; key: string; sourceRef: string; volume?: number }
  | { type: "stop-dialogue-bleep"; key: string }
  | { type: "stop-voice" }
  | { type: "play-voice"; key: string; textId: string; sourceRef: string; volume?: number }
  | { type: "play-movie"; sourceRef: string; block: boolean; durationMs?: number };

export interface MediaRuntimeDiagnostic {
  code: "media-handle-missing" | "unsupported-media-command";
  severity: "info" | "warning" | "error";
  message: string;
  commandId: string;
}

export interface MediaRuntimeResult {
  state: MediaRuntimeState;
  effects: MediaRuntimeEffect[];
  diagnostics: MediaRuntimeDiagnostic[];
}

export function createInitialMediaRuntimeState(): MediaRuntimeState {
  return { bgmByGroup: {}, loopingSfxByKey: {} };
}

export function reduceMediaRuntimeCommand(state: MediaRuntimeState, command: RuntimeCommand): MediaRuntimeResult {
  switch (command.commandId) {
    case "bgm":
      return reduceBgmCommand(state, command);
    case "stopbgm":
      return reduceStopBgmCommand(state, command);
    case "sfx":
      return reduceSfxCommand(state, command, false);
    case "sfxfast":
      return reduceSfxCommand(state, command, true);
    case "stopsfx":
      return reduceStopSfxCommand(state, command);
    case "movie":
      return reduceMovieCommand(state, command);
    default:
      return {
        state,
        effects: [],
        diagnostics: [
          {
            code: "unsupported-media-command",
            commandId: command.commandId,
            severity: "warning",
            message: `@${command.canonicalName} is not handled by mediaRuntime.`
          }
        ]
      };
  }
}

export function reduceMediaRuntimeCommands(state: MediaRuntimeState, commands: RuntimeCommand[]): MediaRuntimeResult {
  return commands.reduce<MediaRuntimeResult>(
    (current, command) => {
      const next = reduceMediaRuntimeCommand(current.state, command);
      return {
        state: next.state,
        effects: [...current.effects, ...next.effects],
        diagnostics: [...current.diagnostics, ...next.diagnostics]
      };
    },
    { state, effects: [], diagnostics: [] }
  );
}

function reduceBgmCommand(state: MediaRuntimeState, command: RuntimeCommand): MediaRuntimeResult {
  const sourceRef = stringParam(command, "bgmPath");
  const group = stringParam(command, "group") ?? "bgm";
  if (!sourceRef) return missingSource(state, command, "bgmPath");

  const previous = state.bgmByGroup[group];
  const fadeMs = numberParam(command, "fadeMs");
  const volume = numberParam(command, "volume");
  const nextTrack: MediaRuntimeBgmTrack = { key: group, group, sourceRef };
  const playEffect: MediaRuntimeEffect = {
    type: "play-bgm",
    key: nextTrack.key,
    group,
    sourceRef,
    ...(volume !== undefined ? { volume } : {}),
    ...(fadeMs !== undefined ? { fadeMs } : {})
  };
  return {
    state: {
      ...state,
      bgmByGroup: { ...state.bgmByGroup, [group]: nextTrack }
    },
    effects: [
      ...(previous ? [{ type: "stop-bgm" as const, key: previous.key, group, ...(fadeMs !== undefined ? { fadeMs } : {}) }] : []),
      playEffect
    ],
    diagnostics: []
  };
}

function reduceStopBgmCommand(state: MediaRuntimeState, command: RuntimeCommand): MediaRuntimeResult {
  const group = stringParam(command, "group") ?? "bgm";
  const previous = state.bgmByGroup[group];
  if (!previous) {
    return {
      state,
      effects: [],
      diagnostics: [
        {
          code: "media-handle-missing",
          commandId: command.commandId,
          severity: "info",
          message: `@${command.canonicalName} did not find active BGM group ${group}.`
        }
      ]
    };
  }
  const { [group]: _removed, ...bgmByGroup } = state.bgmByGroup;
  void _removed;
  const fadeMs = numberParam(command, "fadeMs");
  return {
    state: { ...state, bgmByGroup },
    effects: [{ type: "stop-bgm", key: previous.key, group, ...(fadeMs !== undefined ? { fadeMs } : {}) }],
    diagnostics: []
  };
}

function reduceSfxCommand(state: MediaRuntimeState, command: RuntimeCommand, fast: boolean): MediaRuntimeResult {
  const sourceRef = stringParam(command, "sfxPath");
  if (!sourceRef) return missingSource(state, command, "sfxPath");
  const group = stringParam(command, "group");
  const loop = !fast && booleanParam(command, "loop") === true;
  const key = loop ? group ?? sourceRef : undefined;
  const previous = key ? state.loopingSfxByKey[key] : undefined;
  const nextLoop: MediaRuntimeSfxLoop | undefined = loop && key ? { key, sourceRef, ...(group ? { group } : {}) } : undefined;
  const nextLoopingSfxByKey =
    nextLoop && key ? { ...state.loopingSfxByKey, [key]: nextLoop } : state.loopingSfxByKey;
  const volume = numberParam(command, "volume");
  const playEffect: MediaRuntimeEffect = {
    type: "play-sfx",
    sourceRef,
    loop,
    fast,
    ...(key ? { key } : {}),
    ...(group ? { group } : {}),
    ...(volume !== undefined ? { volume } : {})
  };
  return {
    state: {
      ...state,
      loopingSfxByKey: nextLoopingSfxByKey
    },
    effects: [
      ...(previous ? [{ type: "stop-sfx" as const, key: previous.key, ...(previous.group ? { group: previous.group } : {}) }] : []),
      playEffect
    ],
    diagnostics: []
  };
}

function reduceStopSfxCommand(state: MediaRuntimeState, command: RuntimeCommand): MediaRuntimeResult {
  const sourceRef = stringParam(command, "sfxPath");
  const group = stringParam(command, "group");
  const key = group ?? sourceRef;
  if (!key) {
    return {
      state,
      effects: [],
      diagnostics: [
        {
          code: "media-handle-missing",
          commandId: command.commandId,
          severity: "info",
          message: `@${command.canonicalName} requires group or sfxPath to stop a looping SFX.`
        }
      ]
    };
  }
  const previous = state.loopingSfxByKey[key];
  if (!previous) {
    return {
      state,
      effects: [],
      diagnostics: [
        {
          code: "media-handle-missing",
          commandId: command.commandId,
          severity: "info",
          message: `@${command.canonicalName} did not find active looping SFX ${key}.`
        }
      ]
    };
  }
  const { [key]: _removed, ...loopingSfxByKey } = state.loopingSfxByKey;
  void _removed;
  const fadeMs = numberParam(command, "fadeMs");
  return {
    state: { ...state, loopingSfxByKey },
    effects: [{ type: "stop-sfx", key, ...(previous.group ? { group: previous.group } : {}), ...(fadeMs !== undefined ? { fadeMs } : {}) }],
    diagnostics: []
  };
}

function reduceMovieCommand(state: MediaRuntimeState, command: RuntimeCommand): MediaRuntimeResult {
  const sourceRef = stringParam(command, "moviePath");
  if (!sourceRef) return missingSource(state, command, "moviePath");
  return {
    state,
    effects: [movieEffect(sourceRef, booleanParam(command, "block") === true, numberParam(command, "durationMs"))],
    diagnostics: []
  };
}

function movieEffect(sourceRef: string, block: boolean, durationMs: number | undefined): MediaRuntimeEffect {
  return {
    type: "play-movie",
    sourceRef,
    block,
    ...(durationMs !== undefined ? { durationMs } : {})
  };
}

function missingSource(state: MediaRuntimeState, command: RuntimeCommand, param: string): MediaRuntimeResult {
  return {
    state,
    effects: [],
    diagnostics: [
      {
        code: "unsupported-media-command",
        commandId: command.commandId,
        severity: "warning",
        message: `@${command.canonicalName} requires ${param}.`
      }
    ]
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

function booleanParam(command: RuntimeCommand, key: string): boolean | undefined {
  const value = scalarValue(command.params[key]);
  return typeof value === "boolean" ? value : undefined;
}

function scalarValue(value: RuntimeValue | undefined): string | number | boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const items = value.map(scalarValue);
    return items.some((item) => item === undefined) ? undefined : items.map(String).join(",");
  }
  return undefined;
}
