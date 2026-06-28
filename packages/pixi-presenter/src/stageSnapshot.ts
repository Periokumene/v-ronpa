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
  | { type: "screen-filter-remove"; kind: "glitch"; durationMs: number; easing?: string; wait?: boolean }
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
      type: "trial-keyword";
      keywordId: string;
      text: string;
      evidenceId?: string;
      speakerId?: string;
    }
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
  | "unsupported-pixi-params";

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

export interface NormalizedActorTransform {
  pos?: [number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  tint?: string;
  visible?: boolean;
  transition: PixiActorSnapshot["transition"];
}

export const MAIN_BACKGROUND_ID = "MainBackground";

export function createInitialPixiStageSnapshot(): PixiStageSnapshot {
  return {
    version: 3,
    revision: 0,
    backgroundsById: {},
    charactersById: {},
    actorOrder: [],
    weather: {},
    screenFilters: {}
  };
}

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

  switch (command.commandId) {
    case "back":
      return reduceBack(snapshot, command);
    case "char":
      return reduceChar(snapshot, command);
    case "arrange":
      return reduceArrange(snapshot, command);
    case "hidechars":
      return reduceHideChars(snapshot, command);
    case "slide":
      return reduceSlide(snapshot, command);
    case "blur":
      return reduceBlur(snapshot, command);
    case "bokeh":
      return reduceBokeh(snapshot, command);
    case "rain":
    case "snow":
    case "sun":
      return reduceWeather(snapshot, command, command.commandId);
    case "flash":
      return {
        snapshot,
        hints: [
          {
            type: "flash",
            color: stringParam(command, "color") ?? "#ffffff",
            durationMs: durationMsParam(command, 160),
            wait: booleanParam(command, "wait", false)
          }
        ],
        waitTasks: waitTask(command, "flash", "screen", snapshot.revision),
        diagnostics: []
      };
    case "shake":
      {
        if (booleanParam(command, "loop", false)) {
          return unsupportedPixiParams(snapshot, command, "@shake loop! is not implemented by this Pixi runtime; disable loop or issue a finite shake");
        }
        const deltaTimeMs = numberParam(command, "deltaTime");
        const deltaPower = numberParam(command, "deltaPower");
        const hint: Extract<PixiStageRenderHint, { type: "shake" }> = {
          type: "shake",
          target: stringParam(command, "target") ?? "stage",
          intensity: numberParam(command, "power", 0.5),
          durationMs: durationMsParam(command, 150),
          count: numberParam(command, "count", 3),
          loop: booleanParam(command, "loop", false),
          hor: booleanParam(command, "hor", false),
          ver: booleanParam(command, "ver", true),
          wait: booleanParam(command, "wait", false)
        };
        if (deltaTimeMs !== undefined) hint.deltaTimeMs = deltaTimeMs;
        if (deltaPower !== undefined) hint.deltaPower = deltaPower;
        return {
          snapshot,
          hints: [hint],
          waitTasks: waitTask(command, "shake", hint.target, snapshot.revision),
          diagnostics: []
        };
      }
    case "glitch":
      {
        const blockJump = numberParam(command, "blockJump");
        const burstJump = numberParam(command, "burstJump");
        const pixelScatter = numberParam(command, "pixelScatter");
        const colorNoise = numberParam(command, "colorNoise");
        const speed = numberParam(command, "speed");
        const seed = numberParam(command, "seed");
        const hint: Extract<PixiStageRenderHint, { type: "glitch" }> = {
          type: "glitch",
          power: numberParam(command, "power", 1),
          durationMs: durationMsParam(command, 1000),
          wait: booleanParam(command, "wait", false)
        };
        if (blockJump !== undefined) hint.blockJump = blockJump;
        if (burstJump !== undefined) hint.burstJump = burstJump;
        if (pixelScatter !== undefined) hint.pixelScatter = pixelScatter;
        if (colorNoise !== undefined) hint.colorNoise = colorNoise;
        if (speed !== undefined) hint.speed = speed;
        if (seed !== undefined) hint.seed = seed;
        return {
          snapshot,
          hints: [hint],
          waitTasks: waitTask(command, "glitch", "screen", snapshot.revision),
          diagnostics: []
        };
      }
    case "glitchfilter":
      return reduceGlitchFilter(snapshot, command);
    case "trialkeyword":
      return reduceTrialKeyword(snapshot, command);
    default:
      return unsupportedPixiCommand(snapshot, command);
  }
}

export function resolvePixiActorTarget(target: string | undefined, stage: PixiStageSnapshot): string[] {
  if (!target || target === "MainBackground") return stage.backgroundsById[MAIN_BACKGROUND_ID] ? [MAIN_BACKGROUND_ID] : [];
  if (target === "*") {
    return [
      ...Object.values(stage.backgroundsById).filter((actor) => actor.visible).map((actor) => actor.id),
      ...Object.values(stage.charactersById).filter((actor) => actor.visible).map((actor) => actor.id)
    ];
  }
  if (target === "stage" || target === "camera") return ["stage"];
  if (stage.backgroundsById[target] || stage.charactersById[target]) return [target];
  return [];
}

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

function reduceBlur(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const targets = resolvePixiActorTarget(stringParam(command, "target"), snapshot);
  if (targets.length === 0) return unsupportedPixiParams(snapshot, command, `unknown actor target: ${stringParam(command, "target") ?? MAIN_BACKGROUND_ID}`);
  const power = numberParam(command, "power", 0);
  let next = snapshot;
  for (const target of targets) {
    const actor = next.backgroundsById[target] ?? next.charactersById[target];
    if (!actor) continue;
    const filters = { ...actor.filters };
    if (power <= 0) delete filters.blur;
    else filters.blur = power;
    const updated: PixiActorSnapshot = {
      ...actor,
      filters,
      transition: timingTransition(command)
    };
    next =
      actor.kind === "background"
        ? { ...next, backgroundsById: { ...next.backgroundsById, [target]: updated } }
        : { ...next, charactersById: { ...next.charactersById, [target]: updated } };
  }
  return withWaitTasks(command, changedSnapshot(next), "actor-transition", targets);
}

function reduceBokeh(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const power = numberParam(command, "power", 0);
  if (power <= 0) {
    const hadBokeh = Boolean(snapshot.screenFilters.bokeh);
    const { bokeh: _bokeh, ...screenFilters } = snapshot.screenFilters;
    const reduction = changedSnapshot({ ...snapshot, screenFilters });
    return hadBokeh ? withWaitTasks(command, reduction, "screen-filter-transition", ["bokeh"]) : reduction;
  }
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    screenFilters: {
      ...snapshot.screenFilters,
      bokeh: {
        focus: stringParam(command, "focus"),
        dist: numberParam(command, "dist", 0),
        power,
        transition: timingTransition(command)
      }
    }
  }), "screen-filter-transition", ["bokeh"]);
}

function reduceGlitchFilter(snapshot: PixiStageSnapshot, command: RuntimeCommand): PixiRuntimeCommandReduction {
  const power = numberParam(command, "power", 0);
  if (power <= 0) {
    const hadGlitch = Boolean(snapshot.screenFilters.glitch);
    const { glitch: _glitch, ...screenFilters } = snapshot.screenFilters;
    const reduction = changedSnapshot({ ...snapshot, screenFilters });
    const durationMs = durationMsParam(command, 0);
    if (!hadGlitch) return reduction;
    const easing = stringParam(command, "easing");
    return {
      ...withWaitTasks(command, reduction, "screen-filter-transition", ["glitch"]),
      hints: durationMs > 0
        ? [
            {
              type: "screen-filter-remove",
              kind: "glitch",
              durationMs,
              ...(easing ? { easing } : {}),
              wait: booleanParam(command, "wait", false)
            }
          ]
        : []
    };
  }

  const blockJump = numberParam(command, "blockJump");
  const burstJump = numberParam(command, "burstJump");
  const pixelScatter = numberParam(command, "pixelScatter");
  const colorNoise = numberParam(command, "colorNoise");
  const speed = numberParam(command, "speed");
  const seed = numberParam(command, "seed");
  const glitch: NonNullable<PixiStageSnapshot["screenFilters"]["glitch"]> = {
    power,
    transition: timingTransition(command)
  };
  if (blockJump !== undefined) glitch.blockJump = blockJump;
  if (burstJump !== undefined) glitch.burstJump = burstJump;
  if (pixelScatter !== undefined) glitch.pixelScatter = pixelScatter;
  if (colorNoise !== undefined) glitch.colorNoise = colorNoise;
  if (speed !== undefined) glitch.speed = speed;
  if (seed !== undefined) glitch.seed = seed;

  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    screenFilters: {
      ...snapshot.screenFilters,
      glitch
    }
  }), "screen-filter-transition", ["glitch"]);
}

function reduceWeather(snapshot: PixiStageSnapshot, command: RuntimeCommand, kind: PixiWeatherKind): PixiRuntimeCommandReduction {
  const power = numberParam(command, "power", 1);
  if (power <= 0) {
    const hadWeather = Boolean(snapshot.weather[kind]);
    const weather = { ...snapshot.weather };
    delete weather[kind];
    const reduction = changedSnapshot({ ...snapshot, weather });
    const durationMs = durationMsParam(command, 0);
    if (!hadWeather) return reduction;
    const easing = stringParam(command, "easing");
    return {
      ...withWaitTasks(command, reduction, "weather-transition", [kind]),
      hints: durationMs > 0
        ? [
            {
              type: "weather-remove",
              kind,
              durationMs,
              ...(easing ? { easing } : {}),
              wait: booleanParam(command, "wait", false)
            }
          ]
        : []
    };
  }
  return withWaitTasks(command, changedSnapshot({
    ...snapshot,
    weather: {
      ...snapshot.weather,
      [kind]: {
        kind,
        power,
        xSpeed: numberParam(command, "xSpeed"),
        ySpeed: numberParam(command, "ySpeed"),
        ...(kind === "snow"
          ? {
              density: numberParam(command, "density"),
              flakeScale: numberParam(command, "flakeScale"),
              sway: numberParam(command, "sway"),
              fog: numberParam(command, "fog"),
              noise: numberParam(command, "noise"),
              seed: numberParam(command, "seed")
            }
          : {}),
        pos: sceneVector2Param(command, "pos"),
        position: vector3Param(command, "position"),
        rotation: vector3Param(command, "rotation"),
        scale: vector3Param(command, "scale"),
        transition: timingTransition(command)
      }
    }
  }), "weather-transition", [kind]);
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
    visible: transform.visible ?? previous?.visible ?? true,
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
