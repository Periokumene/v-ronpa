import type {
  PixiActorSnapshot,
  PixiStageSnapshot,
  PixiWeatherKind,
  RuntimeCommand,
  RuntimeValue,
  StoryPresentationWaitTask
} from "@v-ronpa/contracts";

export type PixiStageRenderHint =
  | { type: "flash"; color: string; durationMs: number; wait?: boolean }
  | { type: "character-tone-remove"; durationMs: number; scopeScriptPath: string; wait?: boolean }
  | { type: "screen-filter-remove"; kind: "bokeh" | "glitch" | "vignette" | "staticFilter" | "waterVeil" | "pulse"; durationMs: number; easing?: string; wait?: boolean }
  | { type: "weather-remove"; kind: PixiWeatherKind; durationMs: number; easing?: string; wait?: boolean }
  | {
      type: "shake";
      target: string;
      intensity: number;
      durationMs: number;
      count?: number;
      loop?: boolean;
      deltaTimeMs?: number;
      deltaPower?: number;
      hor?: boolean;
      ver?: boolean;
      wait?: boolean;
    }
  | {
      type: "glitch";
      power: number;
      durationMs: number;
      blockJump?: number;
      burstJump?: number;
      pixelScatter?: number;
      colorNoise?: number;
      speed?: number;
      seed?: number;
      wait?: boolean;
    }
  | {
      type: "impact"; power: number; origin: [number, number]; direction: number; smear: number;
      chroma: number; durationMs: number; easing?: string; wait?: boolean;
    }
  | {
      type: "afterimage"; target: string; power: number; count: number; offset: [number, number];
      decay: number; tint: string; edge: number; durationMs: number; easing?: string; wait?: boolean;
    }
  | {
      type: "shutter"; power: number; shape: "eyelid" | "iris" | "slice"; color: string;
      hold: number; skew: number; durationMs: number; easing?: string; wait?: boolean;
    }
  | {
      type: "flicker"; power: number; bursts: number; irregularity: number; invert: number; white: number;
      tear: number; chroma: number; seed: number; durationMs: number; easing?: string; wait?: boolean;
    }
  | { type: "trial-keyword"; keywordId: string; text: string; evidenceId?: string; speakerId?: string }
  | {
      type: "trial-subtitle";
      subtitleId: string;
      text: string;
      style: "dialog" | "barrage" | "keyword";
      speakerId?: string;
      keywordId?: string;
      evidenceId?: string;
    };

export type PixiRuntimeCommandDiagnosticCode =
  | "unresolved-runtime-expression"
  | "unsupported-pixi-command"
  | "unsupported-pixi-params"
  | "normalized-pixi-params";

export interface PixiRuntimeCommandDiagnostic {
  code: PixiRuntimeCommandDiagnosticCode;
  message: string;
  commandId: string;
}

export interface PixiRuntimeCommandReduction {
  snapshot: PixiStageSnapshot;
  hints: PixiStageRenderHint[];
  waitTasks: StoryPresentationWaitTask[];
  diagnostics: PixiRuntimeCommandDiagnostic[];
}

export function changedSnapshot(snapshot: PixiStageSnapshot): PixiRuntimeCommandReduction {
  return { snapshot: { ...snapshot, revision: snapshot.revision + 1 }, hints: [], waitTasks: [], diagnostics: [] };
}

export function emptyReduction(snapshot: PixiStageSnapshot): PixiRuntimeCommandReduction {
  return { snapshot, hints: [], waitTasks: [], diagnostics: [] };
}

export function withWaitTasks(
  command: RuntimeCommand,
  reduction: PixiRuntimeCommandReduction,
  kind: StoryPresentationWaitTask["kind"],
  targets: string[]
): PixiRuntimeCommandReduction {
  if (!booleanParam(command, "wait", false) || durationMsParam(command, 0) <= 0) return reduction;
  return {
    ...reduction,
    waitTasks: targets.map((target) => ({ kind, target, revision: reduction.snapshot.revision }))
  };
}

export function waitTask(
  command: RuntimeCommand,
  kind: StoryPresentationWaitTask["kind"],
  target: string,
  revision: number
): StoryPresentationWaitTask[] {
  if (!booleanParam(command, "wait", false) || durationMsParam(command, 0) <= 0) return [];
  return [{ kind, target, revision }];
}

export function timingTransition(command: RuntimeCommand): PixiActorSnapshot["transition"] {
  return {
    name: stringParam(command, "transition"),
    durationMs: durationMsParam(command, 0),
    easing: stringParam(command, "easing"),
    lazy: booleanParam(command, "lazy", false),
    wait: booleanParam(command, "wait", false)
  };
}

export function unsupportedPixiParams(
  snapshot: PixiStageSnapshot,
  command: RuntimeCommand,
  reason: string
): PixiRuntimeCommandReduction {
  return {
    snapshot,
    hints: [],
    waitTasks: [],
    diagnostics: [{
      code: "unsupported-pixi-params",
      commandId: command.commandId,
      message: `@${command.canonicalName} is routed to Pixi but cannot be consumed: ${reason}.`
    }]
  };
}

export function stringParam(command: RuntimeCommand, key: string): string | undefined {
  const value = scalarValue(command.params[key]);
  return value === undefined ? undefined : String(value);
}

export function numberParam(command: RuntimeCommand, key: string): number | undefined;
export function numberParam(command: RuntimeCommand, key: string, fallback: number): number;
export function numberParam(command: RuntimeCommand, key: string, fallback?: number): number | undefined {
  const value = scalarValue(command.params[key]);
  return typeof value === "number" ? value : fallback;
}

export function booleanParam(command: RuntimeCommand, key: string): boolean | undefined;
export function booleanParam(command: RuntimeCommand, key: string, fallback: boolean): boolean;
export function booleanParam(command: RuntimeCommand, key: string, fallback?: boolean): boolean | undefined {
  const value = scalarValue(command.params[key]);
  return typeof value === "boolean" ? value : fallback;
}

export function durationMsParam(command: RuntimeCommand, fallback: number): number {
  return numberParam(command, "durationMs", numberParam(command, "duration", fallback)) ?? fallback;
}

export function sceneVector2Param(
  command: RuntimeCommand,
  key: string,
  fallback?: [number, number]
): [number, number] | undefined {
  const list = numericList(command.params[key]);
  if (list.length === 0) return fallback;
  const x = list[0] !== undefined ? list[0] / 100 : fallback?.[0];
  const y = list[1] !== undefined ? list[1] / 100 : fallback?.[1];
  if (x === undefined || y === undefined) return undefined;
  return [x, y];
}

export function vector3Param(command: RuntimeCommand, key: string): [number, number, number] | undefined {
  const list = numericList(command.params[key]);
  if (list.length === 2) return [list[0]!, list[1]!, 0];
  return list.length >= 3 ? [list[0]!, list[1]!, list[2]!] : undefined;
}

function numericList(value: RuntimeValue | undefined): number[] {
  if (Array.isArray(value)) return value.map(scalarValue).filter((item): item is number => typeof item === "number");
  if (typeof value === "number") return [value];
  if (typeof value === "string" && value.includes(",")) {
    return value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item));
  }
  return [];
}

function scalarValue(value: RuntimeValue | undefined): string | number | boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => String(scalarValue(item))).join(",");
  return undefined;
}
