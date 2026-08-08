import {
  PixiActorFilterSnapshotSchema,
  PixiScreenFiltersSnapshotSchema,
  type PixiActorSnapshot,
  type PixiStageSnapshot,
  type RuntimeCommand,
  type RuntimeValue
} from "@v-ronpa/contracts";
import {
  booleanParam,
  changedSnapshot,
  durationMsParam,
  numberParam,
  sceneVector2Param,
  stringParam,
  timingTransition,
  unsupportedPixiParams,
  withWaitTasks,
  waitTask,
  type PixiRuntimeCommandReduction,
  type PixiStageRenderHint
} from "./reduction";

type ScreenKey = "vignette" | "staticFilter" | "waterVeil" | "pulse";

export function reduceImpact(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const hint: Extract<PixiStageRenderHint, { type: "impact" }> = {
    type: "impact", power: numberParam(command, "power", 1), origin: sceneVector2Param(command, "origin", [0.5, 0.5])!,
    direction: numberParam(command, "direction", 0), smear: numberParam(command, "smear", 0.6),
    chroma: numberParam(command, "chroma", 0.25), durationMs: durationMsParam(command, 220),
    ...hintTiming(command)
  };
  return transient(snapshot, command, hint, "impact");
}

export function reduceAfterimage(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const offset = sceneVector2Param(command, "offset", [-0.015, 0])!;
  const target = stringParam(command, "target") ?? "stage";
  if (target !== "stage" && target !== "camera" && !snapshot.charactersById[target] && !snapshot.backgroundsById[target] && !snapshot.innerBackgroundsById[target]) {
    return unsupportedPixiParams(snapshot, command, `afterimage target '${target}' is not active`);
  }
  const hint: Extract<PixiStageRenderHint, { type: "afterimage" }> = {
    type: "afterimage", target, power: numberParam(command, "power", 0.7),
    count: numberParam(command, "count", 4), offset, decay: numberParam(command, "decay", 0.7),
    tint: stringParam(command, "tint") ?? "#9fc2c7", edge: numberParam(command, "edge", 0.55),
    durationMs: durationMsParam(command, 650), ...hintTiming(command)
  };
  return transient(snapshot, command, hint, "afterimage", hint.target);
}

export function reduceShutter(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const shape = stringParam(command, "shape") ?? "eyelid";
  if (!(["eyelid", "iris", "slice"] as string[]).includes(shape)) return unsupportedPixiParams(snapshot, command, `unknown shutter shape '${shape}'`);
  const hint: Extract<PixiStageRenderHint, { type: "shutter" }> = {
    type: "shutter", power: numberParam(command, "power", 1), shape: shape as "eyelid" | "iris" | "slice",
    color: stringParam(command, "color") ?? "#020304", hold: numberParam(command, "hold", 0.08),
    skew: numberParam(command, "skew", 0.18), durationMs: durationMsParam(command, 480), ...hintTiming(command)
  };
  return transient(snapshot, command, hint, "shutter");
}

export function reduceFlicker(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const hint: Extract<PixiStageRenderHint, { type: "flicker" }> = {
    type: "flicker", power: numberParam(command, "power", 1), bursts: numberParam(command, "bursts", 4),
    irregularity: numberParam(command, "irregularity", 0.65), invert: numberParam(command, "invert", 0.75),
    white: numberParam(command, "white", 0.7), tear: numberParam(command, "tear", 0.65),
    chroma: numberParam(command, "chroma", 0.35), seed: numberParam(command, "seed", 1),
    durationMs: durationMsParam(command, 450), ...hintTiming(command)
  };
  return transient(snapshot, command, hint, "flicker");
}

export function reduceVignette(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  return reduceScreen(snapshot, command, "vignette", {
    power: numberParam(command, "power", 0.5), radius: numberParam(command, "radius", 0.62),
    softness: numberParam(command, "softness", 0.3), color: stringParam(command, "color") ?? "#160a10",
    breathe: numberParam(command, "breathe", 0.06), grain: numberParam(command, "grain", 0.03),
    transition: timingTransition(command)
  });
}

export function reduceStaticFilter(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const palette = stringParam(command, "palette") ?? "cold";
  if (!(["cold", "sepia", "green", "mono"] as string[]).includes(palette)) return unsupportedPixiParams(snapshot, command, `unknown static palette '${palette}'`);
  return reduceScreen(snapshot, command, "staticFilter", {
    power: numberParam(command, "power", 0.6), density: numberParam(command, "density", 0.7),
    scanline: numberParam(command, "scanline", 0.65), jitter: numberParam(command, "jitter", 0.45),
    warp: numberParam(command, "warp", 0.35), grainSize: numberParam(command, "grainSize", 1),
    speed: numberParam(command, "speed", 1), vignette: numberParam(command, "vignette", 0.35),
    palette: palette as "cold" | "sepia" | "green" | "mono", seed: numberParam(command, "seed", 1),
    transition: timingTransition(command)
  });
}

export function reduceWaterVeil(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  return reduceScreen(snapshot, command, "waterVeil", {
    power: numberParam(command, "power", 0.5), level: numberParam(command, "level", 0.18),
    ripple: numberParam(command, "ripple", 0.35), drift: numberParam(command, "drift", -0.1),
    blur: numberParam(command, "blur", 0.12), tint: stringParam(command, "tint") ?? "#6c8390",
    droplets: numberParam(command, "droplets", 0.5), seed: numberParam(command, "seed", 1),
    transition: timingTransition(command)
  });
}

export function reducePulse(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  return reduceScreen(snapshot, command, "pulse", {
    power: numberParam(command, "power", 0.6), rate: numberParam(command, "rate", 92),
    origin: sceneVector2Param(command, "origin", [0.5, 0.52])!, echoes: numberParam(command, "echoes", 3),
    expansion: numberParam(command, "expansion", 0.035), edge: numberParam(command, "edge", 0.65),
    distortion: numberParam(command, "distortion", 0.35), chroma: numberParam(command, "chroma", 0.18),
    decay: numberParam(command, "decay", 0.72), color: stringParam(command, "color") ?? "#b8d6d8",
    transition: timingTransition(command)
  });
}

export function reduceSignalMask(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const target = stringParam(command, "target") ?? "alice";
  const actor = snapshot.charactersById[target];
  if (!actor) return unsupportedPixiParams(snapshot, command, `signalMask target '${target}' is not an active character`);
  const power = numberParam(command, "power", 0.7);
  if (!validUnit(power)) return unsupportedPixiParams(snapshot, command, "power must be in 0..1");
  if (!validEffectEasing(stringParam(command, "easing"))) return unsupportedPixiParams(snapshot, command, "easing is unsupported");
  const region = stringParam(command, "region") ?? "head";
  if (region !== "head" && region !== "full") return unsupportedPixiParams(snapshot, command, `unknown signalMask region '${region}'`);
  const filters: PixiActorSnapshot["filters"] = { ...actor.filters };
  if (power <= 0) delete filters.signalMask;
  else filters.signalMask = {
    region, power, bands: numberParam(command, "bands", 0.8), noise: numberParam(command, "noise", 0.45),
    chroma: numberParam(command, "chroma", 0.25), speed: numberParam(command, "speed", 0.6),
    threshold: numberParam(command, "threshold", 0.5), seed: numberParam(command, "seed", 1),
    transition: timingTransition(command)
  };
  if (!PixiActorFilterSnapshotSchema.safeParse(filters).success ||
    !validEffectEasing(filters.signalMask?.transition.easing)) {
    return unsupportedPixiParams(snapshot, command, "signalMask parameters do not satisfy the terminal actor-filter contract");
  }
  const nextActor = { ...actor, filters, transition: timingTransition(command) };
  const reduction = changedSnapshot({ ...snapshot, charactersById: { ...snapshot.charactersById, [target]: nextActor } });
  return withWaitTasks(command, reduction, "actor-transition", [target]);
}

function reduceScreen<K extends ScreenKey>(
  snapshot: PixiStageSnapshot,
  command: RuntimeCommand,
  key: K,
  value: NonNullable<PixiStageSnapshot["screenFilters"][K]>
): PixiRuntimeCommandReduction {
  if (!PixiScreenFiltersSnapshotSchema.safeParse({ [key]: value }).success ||
    !validEffectEasing(value.transition.easing) ||
    (key === "pulse" && ("origin" in value && !validOrigin(value.origin) || !validCommandVector2(command.params.origin, true)))) {
    return unsupportedPixiParams(snapshot, command, `${key} parameters do not satisfy the terminal screen-filter contract`);
  }
  const power = numberParam(command, "power", 0);
  if (!validUnit(power)) return unsupportedPixiParams(snapshot, command, "power must be in 0..1");
  if (power <= 0) {
    const had = Boolean(snapshot.screenFilters[key]);
    const screenFilters = { ...snapshot.screenFilters };
    delete screenFilters[key];
    const reduction = changedSnapshot({ ...snapshot, screenFilters });
    if (!had) return reduction;
    const durationMs = durationMsParam(command, 0);
    return {
      ...withWaitTasks(command, reduction, "screen-filter-transition", [key]),
      hints: durationMs > 0 ? [{ type: "screen-filter-remove", kind: key, durationMs, ...hintTiming(command) }] : []
    };
  }
  return withWaitTasks(command, changedSnapshot({
    ...snapshot, screenFilters: { ...snapshot.screenFilters, [key]: value }
  }), "screen-filter-transition", [key]);
}

function transient(
  snapshot: PixiStageSnapshot,
  command: RuntimeCommand,
  hint: Extract<PixiStageRenderHint, { type: "impact" | "afterimage" | "shutter" | "flicker" }>,
  kind: "impact" | "afterimage" | "shutter" | "flicker",
  target = "screen"
): PixiRuntimeCommandReduction {
  const invalid = invalidTransientHint(hint, command);
  if (invalid) return unsupportedPixiParams(snapshot, command, invalid);
  return { snapshot, hints: [hint], waitTasks: waitTask(command, kind, target, snapshot.revision), diagnostics: [] };
}

function hintTiming(command: RuntimeCommand): { easing?: string; wait?: boolean } {
  const easing = stringParam(command, "easing");
  return { ...(easing ? { easing } : {}), wait: booleanParam(command, "wait", false) };
}

function validUnit(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }

const effectEasings = new Set([
  "linear", "easeIn", "easeOut", "easeInOut", "inCubic", "outCubic", "inOutCubic", "outExpo", "outQuint"
]);
const hexColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u;

function validEffectEasing(value: string | undefined): boolean {
  return value === undefined || effectEasings.has(value);
}

function invalidTransientHint(
  hint: Extract<PixiStageRenderHint, { type: "impact" | "afterimage" | "shutter" | "flicker" }>,
  command: RuntimeCommand
): string | undefined {
  if (!validUnit(hint.power) || !Number.isFinite(hint.durationMs) || hint.durationMs <= 0) {
    return "power must be in 0..1 and time must be finite and positive";
  }
  if (!validEffectEasing(hint.easing)) return "easing is unsupported";
  if (hint.type === "impact") {
    if (!validCommandVector2(command.params.origin, true) || !validOrigin(hint.origin) || !Number.isFinite(hint.direction) ||
      !validUnit(hint.smear) || !validUnit(hint.chroma)) {
      return "impact origin, direction, smear, or chroma is invalid";
    }
  } else if (hint.type === "afterimage") {
    if (!validCommandVector2(command.params.offset, false) || !Number.isInteger(hint.count) || hint.count < 1 || hint.count > 6 ||
      !hint.offset.every(Number.isFinite) || !validUnit(hint.decay) || !validUnit(hint.edge) || !hexColor.test(hint.tint)) {
      return "afterimage count, offset, decay, edge, or tint is invalid";
    }
  } else if (hint.type === "shutter") {
    if (!hexColor.test(hint.color) || !validUnit(hint.hold) || !validUnit(hint.skew)) {
      return "shutter color, hold, or skew is invalid";
    }
  } else if (!Number.isInteger(hint.bursts) || hint.bursts < 1 || hint.bursts > 32 ||
    !validUnit(hint.irregularity) || !validUnit(hint.invert) || !validUnit(hint.white) ||
    !validUnit(hint.tear) || !validUnit(hint.chroma) || !Number.isInteger(hint.seed)) {
    return "flicker burst count, operators, or seed is invalid";
  }
  return undefined;
}

function validOrigin(value: readonly number[]): boolean {
  return value.length === 2 && value.every((item) => Number.isFinite(item) && item >= 0 && item <= 1);
}

function validCommandVector2(value: RuntimeValue | undefined, percent: boolean): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length !== 2) return false;
  return value.every((item) => typeof item === "number" && Number.isFinite(item) && (!percent || (item >= 0 && item <= 100)));
}
