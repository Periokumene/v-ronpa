import {
  VnMediaCheckpointSchema,
  type RuntimeCommand,
  type RuntimeValue,
  type VnMediaBgmTrack,
  type VnMediaCheckpoint,
  type VnMediaSfxLoop
} from "@v-ronpa/contracts";

export const DEFAULT_BGM_VOLUME = 0.7;
export const DEFAULT_SFX_VOLUME = 1;

export type MediaRuntimeBgmTrack = VnMediaBgmTrack;
export type MediaRuntimeSfxLoop = VnMediaSfxLoop;
export type MediaRuntimeState = VnMediaCheckpoint;

export type MediaRuntimeEffect =
  | { type: "play-bgm"; key: string; group: string; assetId: string; volume: number; fadeInMs?: number }
  | { type: "set-bgm-volume"; key: string; group: string; volume: number; durationMs?: number }
  | { type: "stop-bgm"; key: string; group: string; fadeMs?: number }
  | { type: "play-sfx"; assetId: string; loop: boolean; fast: boolean; volume: number; key?: string; group?: string; fadeInMs?: number }
  | { type: "set-sfx-volume"; key: string; group?: string; volume: number; durationMs?: number }
  | { type: "stop-sfx"; key: string; group?: string; fadeMs?: number }
  | { type: "play-dialogue-bleep"; key: string; assetId: string; volume?: number }
  | { type: "stop-dialogue-bleep"; key: string }
  | { type: "stop-voice" }
  | { type: "play-voice"; key: string; textId: string; assetId: string; volume?: number }
  | { type: "play-movie"; assetId: string; block: boolean; durationMs?: number };

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

export function createVnMediaCheckpoint(state: MediaRuntimeState): VnMediaCheckpoint {
  return VnMediaCheckpointSchema.parse(state);
}

export function createVnMediaRestoreEffects(state: MediaRuntimeState): MediaRuntimeEffect[] {
  const bgmEffects: MediaRuntimeEffect[] = Object.keys(state.bgmByGroup)
    .sort()
    .map((group) => {
      const track = state.bgmByGroup[group]!;
      return {
        type: "play-bgm",
        key: group,
        group,
        assetId: track.assetId,
        volume: track.volume
      };
    });
  const sfxEffects: MediaRuntimeEffect[] = Object.keys(state.loopingSfxByKey)
    .sort()
    .map((key) => {
      const loop = state.loopingSfxByKey[key]!;
      return {
        type: "play-sfx",
        key,
        assetId: loop.assetId,
        loop: true,
        fast: false,
        volume: loop.volume,
        ...(loop.group ? { group: loop.group } : {})
      };
    });
  return [...bgmEffects, ...sfxEffects];
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
  const assetId = stringParam(command, "bgmPath");
  const fadeMs = numberParam(command, "fadeMs");
  const volume = numberParam(command, "volume");
  const durationMs = numberParam(command, "durationMs");
  const explicitGroup = stringParam(command, "group");
  const group = explicitGroup ?? "bgm";
  const previous = state.bgmByGroup[group];

  if (!assetId) {
    if (!explicitGroup) {
      return volume === undefined
        ? missingSource(state, command, "bgmPath")
        : missingTarget(state, command, "requires group or bgmPath to modify BGM volume");
    }
    if (volume === undefined) return missingSource(state, command, "bgmPath");
    if (!previous) return missingActiveBgmGroup(state, command, group);
    return {
      state: {
        ...state,
        bgmByGroup: { ...state.bgmByGroup, [group]: { ...previous, volume } }
      },
      effects: [setBgmVolumeEffect(group, volume, durationMs)],
      diagnostics: []
    };
  }

  if (previous?.assetId === assetId) {
    if (volume === undefined) return { state, effects: [], diagnostics: [] };
    return {
      state: {
        ...state,
        bgmByGroup: { ...state.bgmByGroup, [group]: { ...previous, volume } }
      },
      effects: [setBgmVolumeEffect(group, volume, durationMs)],
      diagnostics: []
    };
  }

  const nextTrack: MediaRuntimeBgmTrack = { assetId, volume: volume ?? DEFAULT_BGM_VOLUME };
  const playEffect: MediaRuntimeEffect = {
    type: "play-bgm",
    key: group,
    group,
    assetId,
    volume: nextTrack.volume,
    ...(fadeMs !== undefined ? { fadeInMs: fadeMs } : {})
  };
  return {
    state: {
      ...state,
      bgmByGroup: { ...state.bgmByGroup, [group]: nextTrack }
    },
    effects: [
      ...(previous ? [{ type: "stop-bgm" as const, key: group, group, ...(fadeMs !== undefined ? { fadeMs } : {}) }] : []),
      playEffect
    ],
    diagnostics: []
  };
}

function reduceStopBgmCommand(state: MediaRuntimeState, command: RuntimeCommand): MediaRuntimeResult {
  const group = stringParam(command, "group") ?? "bgm";
  const previous = state.bgmByGroup[group];
  if (!previous) return missingActiveBgmGroup(state, command, group);
  const { [group]: _removed, ...bgmByGroup } = state.bgmByGroup;
  void _removed;
  const fadeMs = numberParam(command, "fadeMs");
  return {
    state: { ...state, bgmByGroup },
    effects: [{ type: "stop-bgm", key: group, group, ...(fadeMs !== undefined ? { fadeMs } : {}) }],
    diagnostics: []
  };
}

function reduceSfxCommand(state: MediaRuntimeState, command: RuntimeCommand, fast: boolean): MediaRuntimeResult {
  const assetId = stringParam(command, "sfxPath");
  const group = stringParam(command, "group");
  const volume = numberParam(command, "volume");
  const durationMs = numberParam(command, "durationMs");
  const fadeMs = numberParam(command, "fadeMs");
  if (!assetId) {
    if (fast) return missingSource(state, command, "sfxPath");
    if (!group) {
      return volume === undefined
        ? missingSource(state, command, "sfxPath")
        : missingTarget(state, command, "requires group or sfxPath to modify looped SFX volume");
    }
    if (volume === undefined) return missingSource(state, command, "sfxPath");
    const previous = state.loopingSfxByKey[group];
    if (!previous) return missingActiveSfxLoop(state, command, group);
    return {
      state: {
        ...state,
        loopingSfxByKey: { ...state.loopingSfxByKey, [group]: { ...previous, volume } }
      },
      effects: [setSfxVolumeEffect(group, previous, volume, durationMs)],
      diagnostics: []
    };
  }

  const loop = !fast && booleanParam(command, "loop") === true;
  const key = loop ? group ?? assetId : undefined;
  const previous = key ? state.loopingSfxByKey[key] : undefined;
  if (previous?.assetId === assetId) {
    if (volume === undefined) return { state, effects: [], diagnostics: [] };
    return {
      state: {
        ...state,
        loopingSfxByKey: { ...state.loopingSfxByKey, [key!]: { ...previous, volume } }
      },
      effects: [setSfxVolumeEffect(key!, previous, volume, durationMs)],
      diagnostics: []
    };
  }
  const targetVolume = volume ?? DEFAULT_SFX_VOLUME;
  const nextLoop: MediaRuntimeSfxLoop | undefined = loop && key
    ? { assetId, volume: targetVolume, ...(group ? { group } : {}) }
    : undefined;
  const nextLoopingSfxByKey =
    nextLoop && key ? { ...state.loopingSfxByKey, [key]: nextLoop } : state.loopingSfxByKey;
  const playEffect: MediaRuntimeEffect = {
    type: "play-sfx",
    assetId,
    loop,
    fast,
    volume: targetVolume,
    ...(key ? { key } : {}),
    ...(group ? { group } : {}),
    ...(fadeMs !== undefined ? { fadeInMs: fadeMs } : {})
  };
  return {
    state: {
      ...state,
      loopingSfxByKey: nextLoopingSfxByKey
    },
    effects: [
      ...(previous && key ? [{ type: "stop-sfx" as const, key, ...(previous.group ? { group: previous.group } : {}), ...(fadeMs !== undefined ? { fadeMs } : {}) }] : []),
      playEffect
    ],
    diagnostics: []
  };
}

function reduceStopSfxCommand(state: MediaRuntimeState, command: RuntimeCommand): MediaRuntimeResult {
  const assetId = stringParam(command, "sfxPath");
  const group = stringParam(command, "group");
  const key = group ?? assetId;
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
  if (!previous) return missingActiveSfxLoop(state, command, key);
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
  const assetId = stringParam(command, "moviePath");
  if (!assetId) return missingSource(state, command, "moviePath");
  return {
    state,
    effects: [movieEffect(assetId, booleanParam(command, "block") === true, numberParam(command, "durationMs"))],
    diagnostics: []
  };
}

function movieEffect(assetId: string, block: boolean, durationMs: number | undefined): MediaRuntimeEffect {
  return {
    type: "play-movie",
    assetId,
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

function missingTarget(state: MediaRuntimeState, command: RuntimeCommand, detail: string): MediaRuntimeResult {
  return {
    state,
    effects: [],
    diagnostics: [
      {
        code: "media-handle-missing",
        commandId: command.commandId,
        severity: "info",
        message: `@${command.canonicalName} ${detail}.`
      }
    ]
  };
}

function missingActiveBgmGroup(state: MediaRuntimeState, command: RuntimeCommand, group: string): MediaRuntimeResult {
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

function missingActiveSfxLoop(state: MediaRuntimeState, command: RuntimeCommand, key: string): MediaRuntimeResult {
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

function setBgmVolumeEffect(group: string, volume: number, durationMs: number | undefined): MediaRuntimeEffect {
  return {
    type: "set-bgm-volume",
    key: group,
    group,
    volume,
    ...(durationMs !== undefined ? { durationMs } : {})
  };
}

function setSfxVolumeEffect(key: string, loop: MediaRuntimeSfxLoop, volume: number, durationMs: number | undefined): MediaRuntimeEffect {
  return {
    type: "set-sfx-volume",
    key,
    ...(loop.group ? { group: loop.group } : {}),
    volume,
    ...(durationMs !== undefined ? { durationMs } : {})
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
