import {
  naniCommandCatalog,
  PIXI_INNER_BACKGROUND_ID,
  PIXI_MAIN_BACKGROUND_ID,
  type PixiActorSnapshot,
  type PixiStageSnapshot,
  type RuntimeCommand,
  type RuntimeValue,
  type StoryPresentationWaitTask
} from "@v-ronpa/contracts";
import { resolvePixiActorTarget } from "./actorTargets";
import { reduceBlur as reduceBlurEffect } from "./effects/blur";
import { reduceBokeh as reduceBokehEffect } from "./effects/bokeh";
import { reduceCharacterTone as reduceCharacterToneEffect } from "./effects/characterTone";
import { reduceFlash as reduceFlashEffect } from "./effects/flash";
import { reduceAfterimage } from "./effects/afterimage";
import { reduceFlicker } from "./effects/flicker";
import {
  reduceGlitchFilter as reduceGlitchFilterEffect,
  reduceTransientGlitch as reduceTransientGlitchEffect
} from "./effects/glitch";
import { reduceImpact } from "./effects/impact";
import { reducePulse } from "./effects/pulse";
import { reduceRain as reduceRainEffect } from "./effects/rain";
import type { PixiRuntimeCommandReduction, PixiStageRenderHint } from "./effects/reduction";
import { reduceShake as reduceShakeEffect } from "./effects/shake";
import { reduceShutter } from "./effects/shutter";
import { reduceSignalMask } from "./effects/signalMask";
import { reduceSnow as reduceSnowEffect } from "./effects/snow";
import { reduceStaticFilter } from "./effects/staticFilter";
import { reduceSun as reduceSunEffect } from "./effects/sun";
import { reduceVignette } from "./effects/vignette";
import { reduceWaterVeil } from "./effects/waterVeil";

export {
  DEFAULT_RAIN_COMMAND_PARAMS,
  RAIN_HUE_WRAP,
  RAIN_POWER_MAX,
  RAIN_POWER_MIN,
  RAIN_TINT_MAX,
  RAIN_TINT_MIN,
  RAIN_WIND_MAX,
  RAIN_WIND_MIN
} from "./rainCommandParams";
export type {
  PixiRuntimeCommandDiagnostic,
  PixiRuntimeCommandDiagnosticCode,
  PixiRuntimeCommandReduction,
  PixiStageRenderHint
} from "./effects/reduction";

export interface NormalizedActorTransform {
  pos?: [number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  tint?: string;
  visible?: boolean;
  transition: PixiActorSnapshot["transition"];
}

export const MAIN_BACKGROUND_ID = PIXI_MAIN_BACKGROUND_ID;
export const INNER_BACKGROUND_ID = PIXI_INNER_BACKGROUND_ID;

export function createInitialPixiStageSnapshot(): PixiStageSnapshot {
  return {
    version: 6,
    revision: 0,
    backgroundsById: {},
    innerBackgroundsById: {},
    charactersById: {},
    actorOrder: [],
    weather: {},
    screenFilters: {}
  };
}

type PixiCommandReducer = (
  snapshot: PixiStageSnapshot,
  command: RuntimeCommand
) => PixiRuntimeCommandReduction;

const pixiCommandReducerRegistry: Readonly<Record<string, PixiCommandReducer>> = Object.freeze({
  afterimage: reduceAfterimage,
  arrange: reduceArrange,
  back: reduceBack,
  blur: reduceBlurEffect,
  bokeh: reduceBokehEffect,
  char: reduceChar,
  chartone: reduceCharacterToneEffect,
  flash: reduceFlashEffect,
  flicker: reduceFlicker,
  glitch: reduceTransientGlitchEffect,
  glitchfilter: reduceGlitchFilterEffect,
  impact: reduceImpact,
  hidechars: reduceHideChars,
  inback: reduceInback,
  rain: reduceRainEffect,
  pulse: reducePulse,
  shake: reduceShakeEffect,
  shutter: reduceShutter,
  signalmask: reduceSignalMask,
  slide: reduceSlide,
  snow: reduceSnowEffect,
  staticfilter: reduceStaticFilter,
  sun: reduceSunEffect,
  vignette: reduceVignette,
  waterveil: reduceWaterVeil,
  trialkeyword: reduceTrialKeyword
});

function assertPixiCommandReducerRegistry(): void {
  const catalogIds = naniCommandCatalog
    .filter((definition) => definition.status === "implemented" && definition.execution === "pixi-presentation")
    .map((definition) => definition.id)
    .sort();
  const registeredIds = Object.keys(pixiCommandReducerRegistry).sort();
  const missing = catalogIds.filter((id) => !registeredIds.includes(id));
  const orphaned = registeredIds.filter((id) => !catalogIds.includes(id));
  if (missing.length === 0 && orphaned.length === 0) return;
  throw new Error([
    "Pixi command reducer registry invariant failed:",
    ...(missing.length > 0 ? [`- missing reducers: ${missing.join(", ")}`] : []),
    ...(orphaned.length > 0 ? [`- orphaned reducers: ${orphaned.join(", ")}`] : [])
  ].join("\n"));
}

assertPixiCommandReducerRegistry();

export function reducePixiRuntimeCommand(
  snapshot: PixiStageSnapshot,
  command: RuntimeCommand
): PixiRuntimeCommandReduction {
  if (hasUnresolvedExpression(command)) {
    return {
      snapshot,
      hints: [],
      waitTasks: [],
      diagnostics: [
        {
          code: "unresolved-runtime-expression",
          commandId: command.commandId,
          message: `@${command.canonicalName} contains unresolved expression params; Pixi requires resolved runtime values.`
        }
      ]
    };
  }

  const reducer = pixiCommandReducerRegistry[command.commandId];
  return reducer ? reducer(snapshot, command) : unsupportedPixiCommand(snapshot, command);
}

export function reconcilePixiStageScriptScope(
  reduction: PixiRuntimeCommandReduction,
  activeScriptPath: string
): PixiRuntimeCommandReduction {
  let snapshot = reduction.snapshot;
  if (
    snapshot.characterTone &&
    snapshot.characterTone.scopeScriptPath !== activeScriptPath
  ) {
    const { characterTone: _characterTone, ...withoutTone } = snapshot;
    snapshot = {
      ...withoutTone,
      revision: snapshot.revision + 1
    };
  }

  const hints = reduction.hints.filter(
    (hint) => hint.type !== "character-tone-remove" || hint.scopeScriptPath === activeScriptPath
  );
  const hasActiveToneTransition =
    snapshot.characterTone?.scopeScriptPath === activeScriptPath ||
    hints.some((hint) => hint.type === "character-tone-remove");
  const waitTasks = reduction.waitTasks.filter(
    (task) => task.kind !== "character-tone-transition" || hasActiveToneTransition
  );
  return {
    ...reduction,
    snapshot,
    hints,
    waitTasks
  };
}

export { resolvePixiActorTarget } from "./actorTargets";

export function normalizeActorTransformParams(command: RuntimeCommand): NormalizedActorTransform {
  const transform: NormalizedActorTransform = {
    transition: {
      name: stringParam(command, "transition"),
      durationMs: durationMsParam(command, 0),
      easing: stringParam(command, "easing"),
      lazy: booleanParam(command, "lazy", false),
      wait: booleanParam(command, "wait", false)
    }
  };
  const pos = sceneVector2Param(command, "pos");
  if (pos) transform.pos = pos;
  const position = vector3Param(command, "position");
  if (position) transform.position = position;
  const rotation = vector3Param(command, "rotation");
  if (rotation) transform.rotation = rotation;
  const scale = vector3Param(command, "scale");
  if (scale) transform.scale = scale;
  const tint = stringParam(command, "tint");
  if (tint !== undefined) transform.tint = tint;
  const visible = booleanParam(command, "visible");
  if (visible !== undefined) transform.visible = visible;
  return transform;
}

function reduceBack(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const appearance = stringParam(command, "appearance");
  if (!appearance) return unsupportedPixiParams(snapshot, command, "missing required params: appearance");
  const target = stringParam(command, "target") ?? MAIN_BACKGROUND_ID;
  const transform = normalizeActorTransformParams(command);
  const previous = snapshot.backgroundsById[target];
  const updateActor = (id: string, actor?: PixiActorSnapshot): PixiActorSnapshot => ({
    id,
    kind: "background",
    appearance,
    appearanceExpression: "",
    pose: stringParam(command, "pose") ?? actor?.pose,
    visible: transform.visible ?? actor?.visible ?? true,
    alpha: actor?.alpha ?? 1,
    z: actor?.z ?? -100,
    filters: actor?.filters ?? {},
    transition: transform.transition,
    ...(transform.pos ?? actor?.pos ? { pos: transform.pos ?? actor?.pos } : {}),
    ...(transform.position ?? actor?.position ? { position: transform.position ?? actor?.position } : {}),
    ...(transform.rotation ?? actor?.rotation ? { rotation: transform.rotation ?? actor?.rotation } : {}),
    ...(transform.scale ?? actor?.scale ? { scale: transform.scale ?? actor?.scale } : {}),
    ...(transform.tint ?? actor?.tint ? { tint: transform.tint ?? actor?.tint } : {})
  });
  if (target === "*") {
    const visibleBackgrounds = Object.values(snapshot.backgroundsById).filter((actor) => actor.visible);
    if (visibleBackgrounds.length === 0) return emptyReduction(snapshot);
    const backgroundsById = { ...snapshot.backgroundsById };
    for (const actor of visibleBackgrounds) backgroundsById[actor.id] = updateActor(actor.id, actor);
    return withWaitTasks(command, changedSnapshot({
      ...snapshot,
      backgroundsById
    }), "actor-transition", visibleBackgrounds.map((actor) => actor.id));
  }
  const actor: PixiActorSnapshot = {
    ...updateActor(target, previous)
  };
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    backgroundsById: { ...snapshot.backgroundsById, [target]: actor },
    actorOrder: ensureActorOrder(snapshot.actorOrder, target)
  }), "actor-transition", [target]);
}

function reduceInback(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const target = INNER_BACKGROUND_ID;
  const previous = snapshot.innerBackgroundsById[target];
  const transition = timingTransition(command);
  const visible = booleanParam(command, "visible");
  if (visible === false) {
    if (!previous) return emptyReduction(snapshot);
    return withWaitTasks(command, changedSnapshot({
      ...snapshot,
      innerBackgroundsById: {
        ...snapshot.innerBackgroundsById,
        [target]: {
          ...previous,
          visible: false,
          transition
        }
      }
    }), "actor-transition", [target]);
  }

  const appearance = stringParam(command, "appearance") ?? previous?.appearance;
  if (!appearance) return unsupportedPixiParams(snapshot, command, "missing required params: appearance");
  const actor: PixiActorSnapshot = {
    id: target,
    kind: "background",
    appearance,
    appearanceExpression: "",
    visible: visible ?? previous?.visible ?? true,
    alpha: previous?.alpha ?? 1,
    z: previous?.z ?? 0,
    filters: previous?.filters ?? {},
    transition
  };
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    innerBackgroundsById: {
      ...snapshot.innerBackgroundsById,
      [target]: actor
    }
  }), "actor-transition", [target]);
}

function reduceChar(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const target = stringParam(command, "target");
  if (!target) return unsupportedPixiParams(snapshot, command, "missing required params: target");
  const transform = normalizeActorTransformParams(command);
  if (target === "*") {
    const visibleActors = snapshot.actorOrder
      .map((id) => snapshot.charactersById[id])
      .filter((actor): actor is PixiActorSnapshot => Boolean(actor?.visible));
    if (visibleActors.length === 0) return emptyReduction(snapshot);
    const charactersById = { ...snapshot.charactersById };
    for (const actor of visibleActors) {
      charactersById[actor.id] = buildCharacterActor(snapshot, command, actor.id, transform, actor);
    }
    return withWaitTasks(command, changedSnapshot({ ...snapshot, charactersById }), "actor-transition", visibleActors.map((actor) => actor.id));
  }
  const previous = snapshot.charactersById[target];
  const actor = buildCharacterActor(snapshot, command, target, transform, previous);
  return withWaitTasks(command, changedSnapshot(
    {
      ...snapshot,
      charactersById: { ...snapshot.charactersById, [target]: actor },
      actorOrder: ensureActorOrder(snapshot.actorOrder, target)
    }
  ), "actor-transition", [target]);
}

function reduceArrange(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const positions = namedPositionParam(command, "characterPositions");
  const visibleActors = snapshot.actorOrder
    .map((id) => snapshot.charactersById[id])
    .filter((actor): actor is PixiActorSnapshot => Boolean(actor?.visible));
  const fallbackPositions = evenlySpacedPositions(visibleActors.length);
  const charactersById = { ...snapshot.charactersById };

  visibleActors.forEach((actor, index) => {
    const x = positions.get(actor.id) ?? positions.get(actor.id.replace(/^character:/, "")) ?? fallbackPositions[index] ?? 50;
    const autoLook = positions.size === 0 ? booleanParam(command, "look", true) : booleanParam(command, "look", false);
    charactersById[actor.id] = {
      ...actor,
      pos: [x / 100, actor.pos?.[1] ?? 0],
      look: autoLook ? "camera" : actor.look,
      transition: timingTransition(command)
    };
  });

  return withWaitTasks(command, changedSnapshot({ ...snapshot, charactersById }), "actor-transition", visibleActors.map((actor) => actor.id));
}

function reduceHideChars(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const charactersById = Object.fromEntries(
    Object.entries(snapshot.charactersById).map(([id, actor]) => [
      id,
      { ...actor, visible: false, transition: timingTransition(command) }
    ])
  );
  return withWaitTasks(command, changedSnapshot({ ...snapshot, charactersById }), "actor-transition", Object.keys(snapshot.charactersById));
}

function reduceSlide(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const target = stringParam(command, "target");
  if (!target) return unsupportedPixiParams(snapshot, command, "missing required params: target");
  const actor = snapshot.charactersById[target] ?? snapshot.backgroundsById[target];
  if (!actor) return unsupportedPixiParams(snapshot, command, `unknown actor target: ${target}`);
  const nextPos = sceneVector2Param(command, "to", actor.pos);
  const explicitFrom = sceneVector2Param(command, "from", actor.pos);
  const startPos = explicitFrom ?? defaultSlideFrom(actor, nextPos);
  const transition = {
    ...timingTransition(command),
    name: "slide",
    ...(startPos ? { from: startPos } : {}),
    ...(nextPos ? { to: nextPos } : {})
  };
  const nextActor: PixiActorSnapshot = {
    ...actor,
    appearanceExpression: actor.kind === "character" ? stringParam(command, "appearanceExpression") ?? actor.appearanceExpression : actor.appearanceExpression,
    visible: booleanParam(command, "visible", true),
    transition,
    ...(nextPos ? { pos: nextPos } : {})
  };
  const next =
    actor.kind === "background"
      ? { ...snapshot, backgroundsById: { ...snapshot.backgroundsById, [target]: nextActor } }
      : { ...snapshot, charactersById: { ...snapshot.charactersById, [target]: nextActor } };
  return withWaitTasks(command, changedSnapshot(next), "actor-transition", [target]);
}

function buildCharacterActor(
  snapshot: PixiStageSnapshot,
  command: RuntimeCommand,
  target: string,
  transform: NormalizedActorTransform,
  previous: PixiActorSnapshot | undefined
): PixiActorSnapshot {
  return {
    id: target,
    kind: "character",
    appearanceExpression: stringParam(command, "appearanceExpression") ?? "",
    pose: stringParam(command, "pose") ?? previous?.pose,
    visible: transform.visible ?? true,
    alpha: previous?.alpha ?? 1,
    z: previous?.z ?? snapshot.actorOrder.length,
    filters: previous?.filters ?? {},
    look: stringParam(command, "look") ?? previous?.look,
    transition: transform.transition,
    pos: transform.pos ?? previous?.pos ?? defaultCharacterPos(snapshot, target),
    ...(transform.position ?? previous?.position ? { position: transform.position ?? previous?.position } : {}),
    ...(transform.rotation ?? previous?.rotation ? { rotation: transform.rotation ?? previous?.rotation } : {}),
    ...(transform.scale ?? previous?.scale ? { scale: transform.scale ?? previous?.scale } : {}),
    ...(transform.tint ?? previous?.tint ? { tint: transform.tint ?? previous?.tint } : {})
  };
}

function reduceTrialKeyword(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const keywordId = stringParam(command, "keywordId");
  const text = stringParam(command, "text");
  if (!keywordId || !text) {
    const missingParams = [keywordId ? undefined : "keywordId", text ? undefined : "text"].filter(
      (param): param is string => param !== undefined
    );
    return unsupportedPixiParams(snapshot, command, `missing required params: ${missingParams.join(", ")}`);
  }
  const hint: PixiStageRenderHint = { type: "trial-keyword", keywordId, text };
  const evidenceId = stringParam(command, "evidenceId");
  if (evidenceId) hint.evidenceId = evidenceId;
  const speakerId = stringParam(command, "speakerId");
  if (speakerId) hint.speakerId = speakerId;
  return { snapshot, hints: [hint], waitTasks: [], diagnostics: [] };
}

function changedSnapshot(snapshot: PixiStageSnapshot): PixiRuntimeCommandReduction {
  return {
    snapshot: { ...snapshot, revision: snapshot.revision + 1 },
    hints: [],
    waitTasks: [],
    diagnostics: []
  };
}

function emptyReduction(snapshot: PixiStageSnapshot): PixiRuntimeCommandReduction {
  return { snapshot, hints: [], waitTasks: [], diagnostics: [] };
}

function withWaitTasks(
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

function waitTask(
  command: RuntimeCommand,
  kind: StoryPresentationWaitTask["kind"],
  target: string,
  revision: number
): StoryPresentationWaitTask[] {
  if (!booleanParam(command, "wait", false) || durationMsParam(command, 0) <= 0) return [];
  return [{ kind, target, revision }];
}

function ensureActorOrder(order: string[], id: string): string[] {
  return order.includes(id) ? order : [...order, id];
}

function defaultCharacterPos(snapshot: PixiStageSnapshot, id: string): [number, number] {
  const visibleCount = snapshot.actorOrder.filter((actorId) => snapshot.charactersById[actorId]?.visible).length;
  const positions = evenlySpacedPositions(Math.max(1, visibleCount + (snapshot.charactersById[id] ? 0 : 1)));
  return [(positions.at(-1) ?? 50) / 100, 0];
}

function evenlySpacedPositions(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [50];
  const step = 70 / (count - 1);
  return Array.from({ length: count }, (_, index) => 15 + step * index);
}

function timingTransition(command: RuntimeCommand): PixiActorSnapshot["transition"] {
  return {
    name: stringParam(command, "transition"),
    durationMs: durationMsParam(command, 0),
    easing: stringParam(command, "easing"),
    lazy: booleanParam(command, "lazy", false),
    wait: booleanParam(command, "wait", false)
  };
}

function unsupportedPixiCommand(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  return {
    snapshot,
    hints: [],
    waitTasks: [],
    diagnostics: [
      {
        code: "unsupported-pixi-command",
        commandId: command.commandId,
        message: `@${command.canonicalName} is routed to Pixi but is not consumed by pixi-presenter yet.`
      }
    ]
  };
}

function unsupportedPixiParams(
  snapshot: PixiStageSnapshot,
  command: RuntimeCommand,
  reason: string
): PixiRuntimeCommandReduction {
  return {
    snapshot,
    hints: [],
    waitTasks: [],
    diagnostics: [
      {
        code: "unsupported-pixi-params",
        commandId: command.commandId,
        message: `@${command.canonicalName} is routed to Pixi but cannot be consumed: ${reason}.`
      }
    ]
  };
}

function stringParam(command: RuntimeCommand, key: string): string | undefined {
  const value = scalarValue(command.params[key]);
  return value === undefined ? undefined : String(value);
}

function numberParam(command: RuntimeCommand, key: string): number | undefined;
function numberParam(command: RuntimeCommand, key: string, fallback: number): number;
function numberParam(command: RuntimeCommand, key: string, fallback?: number): number | undefined {
  const value = scalarValue(command.params[key]);
  return typeof value === "number" ? value : fallback;
}

function booleanParam(command: RuntimeCommand, key: string): boolean | undefined;
function booleanParam(command: RuntimeCommand, key: string, fallback: boolean): boolean;
function booleanParam(command: RuntimeCommand, key: string, fallback?: boolean): boolean | undefined {
  const value = scalarValue(command.params[key]);
  return typeof value === "boolean" ? value : fallback;
}

function durationMsParam(command: RuntimeCommand, fallback: number): number {
  return numberParam(command, "durationMs", numberParam(command, "duration", fallback)) ?? fallback;
}

function sceneVector2Param(
  command: RuntimeCommand,
  key: string,
  fallback?: [number, number]
): [number, number] | undefined {
  const list = numericList(command.params[key]);
  if (list.length === 0) return undefined;
  const x = list[0] !== undefined ? list[0] / 100 : fallback?.[0];
  const y = list[1] !== undefined ? list[1] / 100 : fallback?.[1];
  if (x === undefined || y === undefined) return undefined;
  return [x, y];
}

function vector3Param(command: RuntimeCommand, key: string): [number, number, number] | undefined {
  const list = numericList(command.params[key]);
  if (list.length === 2) return [list[0]!, list[1]!, 0];
  return list.length >= 3 ? [list[0]!, list[1]!, list[2]!] : undefined;
}

function namedPositionParam(command: RuntimeCommand, key: string): Map<string, number> {
  const value = command.params[key];
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const result = new Map<string, number>();
  for (const item of items) {
    const text = String(scalarValue(item) ?? "");
    const dot = text.lastIndexOf(".");
    if (dot <= 0) continue;
    const actorId = text.slice(0, dot);
    const position = Number(text.slice(dot + 1));
    if (Number.isFinite(position)) result.set(actorId, position);
  }
  return result;
}

function defaultSlideFrom(actor: PixiActorSnapshot, to: [number, number] | undefined): [number, number] | undefined {
  if (actor.visible && actor.pos) return actor.pos;
  if (!to) return actor.pos;
  return [to[0] < 0.5 ? 1.1 : -0.1, to[1]];
}

function numericList(value: RuntimeValue | undefined): number[] {
  if (Array.isArray(value)) return value.map(scalarValue).filter((item): item is number => typeof item === "number");
  if (typeof value === "number") return [value];
  if (typeof value === "string" && value.includes(",")) {
    return value
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
  }
  return [];
}

function scalarValue(value: RuntimeValue | undefined): string | number | boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => String(scalarValue(item))).join(",");
  return undefined;
}

function hasUnresolvedExpression(command: RuntimeCommand): boolean {
  return Object.values(command.params).some(runtimeValueHasExpression);
}

function runtimeValueHasExpression(value: RuntimeValue): boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return false;
  if (Array.isArray(value)) return value.some(runtimeValueHasExpression);
  return true;
}
