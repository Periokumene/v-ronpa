import {
  PIXI_INNER_BACKGROUND_ID,
  PIXI_MAIN_BACKGROUND_ID,
  type RuntimeValue
} from "@v-ronpa/contracts";
import type { CommandNormalizerDescriptor, CommandShape } from "../types";
import {
  compactParams,
  durationMsValue,
  runtimeCommandValue,
  runtimeParam,
  scenePositionRuntimeParam,
  splitNamedAppearanceExpression,
  splitNamedString
} from "../values.ts";

const DEFAULT_CHAR_TRANSITION_DURATION_MS = 120;

export const actorSceneNormalizers: Readonly<Record<string, CommandNormalizerDescriptor>> = {
  back: {
    acceptsPrimary: true,
    consumedParams: [
      "appearanceAndTransition",
      "id",
      "appearance",
      "pose",
      "via",
      "params",
      "dissolve",
      "pos",
      "position",
      "rotation",
      "scale",
      "tint",
      "easing",
      "time",
      "lazy",
      "wait",
      "visible",
      "effect"
    ],
    normalize: normalizeBackCommand
  },
  char: {
    acceptsPrimary: true,
    consumedParams: [
      "idAndAppearance",
      "id",
      "pose",
      "via",
      "params",
      "dissolve",
      "look",
      "avatar",
      "pos",
      "position",
      "rotation",
      "scale",
      "tint",
      "easing",
      "time",
      "lazy",
      "wait",
      "visible"
    ],
    normalize: normalizeCharCommand
  },
  arrange: {
    acceptsPrimary: true,
    consumedParams: ["characterPositions", "look", "time", "wait"],
    normalize: (command) =>
      compactParams({
        characterPositions: runtimeCommandValue(command.primary) ?? runtimeParam(command, "characterPositions"),
        look: runtimeParam(command, "look"),
        ...normalizeTimingParams(command, { easing: false, lazy: false })
      })
  },
  hidechars: {
    acceptsPrimary: false,
    consumedParams: ["time", "lazy", "wait"],
    normalize: (command) => compactParams(normalizeTimingParams(command, { easing: false, lazy: true }))
  },
  slide: {
    acceptsPrimary: true,
    consumedParams: ["idAndAppearance", "from", "to", "visible", "easing", "time", "lazy", "wait"],
    normalize: normalizeSlideCommand
  },
  inback: {
    acceptsPrimary: true,
    consumedParams: ["appearanceAndTransition", "appearance", "via", "effect", "visible", "easing", "time", "wait"],
    normalize: normalizeInbackCommand
  }
};

function normalizeBackCommand(command: CommandShape): Record<string, RuntimeValue> {
  const named = splitNamedString(runtimeCommandValue(command.primary) ?? runtimeParam(command, "appearanceAndTransition"));
  return compactParams({
    target: runtimeParam(command, "id") ?? PIXI_MAIN_BACKGROUND_ID,
    appearance: runtimeParam(command, "appearance") ?? named.id,
    pose: runtimeParam(command, "pose"),
    transition: runtimeParam(command, "via") ?? named.value ?? runtimeParam(command, "effect"),
    transitionParams: runtimeParam(command, "params"),
    dissolve: runtimeParam(command, "dissolve"),
    ...normalizeActorTransformParams(command)
  });
}

function normalizeInbackCommand(command: CommandShape): Record<string, RuntimeValue> {
  const named = splitNamedString(runtimeCommandValue(command.primary) ?? runtimeParam(command, "appearanceAndTransition"));
  return compactParams({
    target: PIXI_INNER_BACKGROUND_ID,
    appearance: runtimeParam(command, "appearance") ?? named.id,
    transition: runtimeParam(command, "via") ?? named.value ?? runtimeParam(command, "effect"),
    visible: runtimeParam(command, "visible"),
    easing: runtimeParam(command, "easing"),
    durationMs: durationMsValue(runtimeParam(command, "time")),
    wait: runtimeParam(command, "wait") ?? false
  });
}

function normalizeCharCommand(command: CommandShape): Record<string, RuntimeValue> {
  const named = splitNamedAppearanceExpression(runtimeCommandValue(command.primary) ?? runtimeParam(command, "idAndAppearance"));
  const transform = normalizeActorTransformParams(command);
  return compactParams({
    target: runtimeParam(command, "id") ?? named.id,
    appearanceExpression: named.value ?? "",
    pose: runtimeParam(command, "pose"),
    transition: runtimeParam(command, "via"),
    transitionParams: runtimeParam(command, "params"),
    dissolve: runtimeParam(command, "dissolve"),
    look: runtimeParam(command, "look"),
    avatar: runtimeParam(command, "avatar"),
    ...transform,
    durationMs: transform.durationMs ?? DEFAULT_CHAR_TRANSITION_DURATION_MS
  });
}

function normalizeSlideCommand(command: CommandShape): Record<string, RuntimeValue> {
  const named = splitNamedAppearanceExpression(runtimeCommandValue(command.primary) ?? runtimeParam(command, "idAndAppearance"));
  return compactParams({
    target: named.id,
    appearanceExpression: named.value,
    from: scenePositionRuntimeParam(command, "from"),
    to: scenePositionRuntimeParam(command, "to"),
    visible: runtimeParam(command, "visible"),
    ...normalizeTimingParams(command)
  });
}

function normalizeActorTransformParams(command: CommandShape): Record<string, RuntimeValue | undefined> {
  return {
    pos: scenePositionRuntimeParam(command, "pos"),
    position: runtimeParam(command, "position"),
    rotation: runtimeParam(command, "rotation"),
    scale: runtimeParam(command, "scale"),
    tint: runtimeParam(command, "tint"),
    visible: runtimeParam(command, "visible"),
    ...normalizeTimingParams(command)
  };
}

function normalizeTimingParams(
  command: CommandShape,
  options: { easing: boolean; lazy: boolean } = { easing: true, lazy: true }
): Record<string, RuntimeValue | undefined> {
  return {
    easing: options.easing ? runtimeParam(command, "easing") : undefined,
    durationMs: durationMsValue(runtimeParam(command, "time")),
    lazy: options.lazy ? runtimeParam(command, "lazy") ?? false : false,
    wait: runtimeParam(command, "wait") ?? false
  };
}
