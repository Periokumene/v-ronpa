import {
  CHARACTER_TONE_PRESET_IDS,
  RUNTIME_UI_GROUPS,
  type NaniCommandDefinition
} from "@v-ronpa/contracts";
import {
  resolveNaniSourceRef,
  type NaniSourceRef,
  type NaniSourceDiagnostic,
  type NaniValue,
  type SourceLocation,
  type TextSpan
} from "@v-ronpa/nani-parser";
import { commandParamSpecsByName } from "./binding.ts";
import type {
  BoundArgumentOrigin,
  BoundCommand,
  CommandDiagnosticContext,
  CommandNormalizerDescriptor
} from "./types";
import {
  getCommandParam,
  normalizeParamName,
  runtimeParam,
  staticScalarValue
} from "./values.ts";

export type RuntimeCompilerDiagnosticCode =
  | "unknown-command"
  | "invalid-command-param"
  | "unsupported-command-param"
  | "declared-only-command"
  | "ignored-promoted-primary"
  | "unsupported-ui-target";

export interface RuntimeCompilerDiagnostic
  extends NaniSourceDiagnostic<RuntimeCompilerDiagnosticCode> {}

export function validateCommandAgainstCatalog(
  bound: BoundCommand,
  definition: NaniCommandDefinition,
  context: CommandDiagnosticContext
): RuntimeCompilerDiagnostic[] {
  const diagnostics: RuntimeCompilerDiagnostic[] = [];
  const specsByName = commandParamSpecsByName(definition);
  const command = bound.shape;

  for (const spec of definition.params) {
    if (spec.name === "params") continue;
    const isPrimarySpec = definition.primaryParam &&
      normalizeParamName(definition.primaryParam) === normalizeParamName(spec.name);
    const value = getCommandParam(command, spec.name) ?? (isPrimarySpec ? command.primary : undefined);
    if (spec.required && value === undefined) {
      diagnostics.push(
        createCommandDiagnostic(
          context,
          "invalid-command-param",
          "@" + definition.canonicalName + " requires parameter " + spec.name + ":" + spec.type + ".",
          "error"
        )
      );
    }
    if (value !== undefined && isPrimarySpec && command.primary && !isCompatibleCommandValue(command.primary, spec.type)) {
      diagnostics.push(
        createArgumentDiagnostic(
          context,
          bound.origins.primary,
          "value",
          "invalid-command-param",
          "@" + definition.canonicalName + " primary parameter expected " + spec.type + ".",
          "error",
          firstIncompatibleListItemIndex(command.primary, spec.type)
        )
      );
    }
  }

  for (const [key, value] of Object.entries(command.params)) {
    const spec = specsByName.get(normalizeParamName(key));
    if (!spec) {
      if (!allowsDynamicAssignmentParam(definition)) {
        diagnostics.push(
          createArgumentDiagnostic(
            context,
            bound.origins.params[key],
            "whole",
            "invalid-command-param",
            "@" + definition.canonicalName + " does not declare parameter " + key + "; commandCatalog is the authority.",
            "warning"
          )
        );
      }
      continue;
    }
    if (!isCompatibleCommandValue(value, spec.type)) {
      const itemIndex = firstIncompatibleListItemIndex(value, spec.type);
      diagnostics.push(
        createArgumentDiagnostic(
          context,
          bound.origins.params[key],
          "value",
          "invalid-command-param",
          "@" + definition.canonicalName + " parameter " + key + " expected " + spec.type + ".",
          "error",
          itemIndex
        )
      );
    }
  }

  for (const key of Object.keys(command.flags)) {
    const spec = specsByName.get(normalizeParamName(key));
    if (!spec) {
      diagnostics.push(
        createArgumentDiagnostic(
          context,
          bound.origins.flags[key],
          "whole",
          "invalid-command-param",
          "@" + definition.canonicalName + " does not declare boolean flag " + key + "; commandCatalog is the authority.",
          "warning"
        )
      );
      continue;
    }
    if (!spec.type.includes("boolean")) {
      diagnostics.push(
        createArgumentDiagnostic(
          context,
          bound.origins.flags[key],
          "whole",
          "invalid-command-param",
          "@" + definition.canonicalName + " flag " + key + "! maps to " + spec.type + ", not boolean.",
          "error"
        )
      );
    }
  }

  if (definition.id === "signalmask" && bound.origins.primary?.promoted) {
    const origin = bound.origins.primary;
    const argument = context.command.args[origin.argumentIndex];
    const key = argument?.kind === "param" ? argument.key : "primary";
    diagnostics.push(createArgumentDiagnostic(
      context,
      origin,
      "whole",
      "invalid-command-param",
      `@signalMask does not declare parameter ${key}; commandCatalog is the authority.`,
      "error"
    ));
  }

  return diagnostics;
}

export function diagnoseUnsupportedImplementedParams(
  bound: BoundCommand,
  definition: NaniCommandDefinition,
  normalizer: CommandNormalizerDescriptor,
  context: CommandDiagnosticContext
): RuntimeCompilerDiagnostic[] {
  if (definition.status !== "implemented") return [];

  const command = bound.shape;
  const consumed = new Set(normalizer.consumedParams.map(normalizeParamName));
  const specsByName = commandParamSpecsByName(definition);
  const diagnostics: RuntimeCompilerDiagnostic[] = [];

  for (const [key, value] of Object.entries(command.params)) {
    const spec = specsByName.get(normalizeParamName(key));
    if (
      !spec ||
      !isCompatibleCommandValue(value, spec.type) ||
      normalizerConsumesParam(command, definition, consumed, key)
    ) {
      continue;
    }
    diagnostics.push(
      createArgumentDiagnostic(
        context,
        bound.origins.params[key],
        "whole",
        "unsupported-command-param",
        "@" +
          definition.canonicalName +
          " accepts " +
          key +
          ":" +
          spec.type +
          ", but the current runtime compiler does not consume it yet.",
        "warning"
      )
    );
  }

  for (const key of Object.keys(command.flags)) {
    const spec = specsByName.get(normalizeParamName(key));
    if (!spec || consumed.has(normalizeParamName(key))) continue;
    diagnostics.push(
      createArgumentDiagnostic(
        context,
        bound.origins.flags[key],
        "whole",
        "unsupported-command-param",
        "@" +
          definition.canonicalName +
          " accepts " +
          key +
          "!:" +
          spec.type +
          ", but the current runtime compiler does not consume it yet.",
        "warning"
      )
    );
  }

  return diagnostics;
}

function normalizerConsumesParam(
  command: BoundCommand["shape"],
  definition: NaniCommandDefinition,
  declaredConsumedParams: ReadonlySet<string>,
  key: string
): boolean {
  if (definition.id !== "set") return declaredConsumedParams.has(normalizeParamName(key));
  const assignmentKey = command.primary
    ? String(staticScalarValue(command.primary) ?? "")
    : Object.keys(command.params)[0] ?? "";
  return normalizeParamName(key) === normalizeParamName(assignmentKey);
}

export function diagnoseExecutionBoundaryParams(
  bound: BoundCommand,
  definition: NaniCommandDefinition,
  context: CommandDiagnosticContext
): RuntimeCompilerDiagnostic[] {
  const diagnostics: RuntimeCompilerDiagnostic[] = [];
  const command = bound.shape;
  if (definition.id === "shake" && runtimeParam(command, "loop") === true) {
    diagnostics.push(createArgumentDiagnostic(
      context,
      bound.origins.params.loop ?? bound.origins.flags.loop,
      "whole",
      "unsupported-command-param",
      "@shake loop! is declared by Naninovel, but this Pixi runtime does not implement indefinite loop effects in the main story track; the command is diagnosed instead of approximated.",
      "warning"
    ));
  }
  const unit = (...keys: string[]) => keys.forEach((key) => validatePixiNumber(bound, definition, context, diagnostics, key, 0, 1));
  const nonNegative = (...keys: string[]) => keys.forEach((key) => validatePixiNumber(bound, definition, context, diagnostics, key, 0));
  const finite = (...keys: string[]) => keys.forEach((key) => validatePixiNumber(bound, definition, context, diagnostics, key));
  const timing = (finiteEffect = false) => {
    validatePixiNumber(bound, definition, context, diagnostics, "time", finiteEffect ? Number.MIN_VALUE : 0);
    validatePixiEnum(bound, definition, context, diagnostics, "easing", ["linear", "easeIn", "easeOut", "easeInOut"]);
  };

  switch (definition.id) {
    case "afterimage":
      unit("power", "decay", "edge");
      validatePixiInteger(bound, definition, context, diagnostics, "count", 1, 6);
      validatePixiVector2(bound, definition, context, diagnostics, "offset", false);
      validatePixiColor(bound, definition, context, diagnostics, "tint");
      timing(true);
      break;
    case "flicker":
      unit("power", "irregularity", "invert", "white", "tear", "chroma");
      validatePixiInteger(bound, definition, context, diagnostics, "bursts", 1, 32);
      finite("seed");
      timing(true);
      break;
    case "impact":
      unit("power", "smear", "chroma");
      finite("direction");
      validatePixiVector2(bound, definition, context, diagnostics, "origin", true);
      timing(true);
      break;
    case "pulse":
      unit("power", "edge", "distortion", "chroma", "decay");
      validatePixiNumber(bound, definition, context, diagnostics, "rate", Number.MIN_VALUE);
      validatePixiNumber(bound, definition, context, diagnostics, "expansion", 0, 0.2);
      validatePixiInteger(bound, definition, context, diagnostics, "echoes", 1, 4);
      validatePixiVector2(bound, definition, context, diagnostics, "origin", true);
      validatePixiColor(bound, definition, context, diagnostics, "color");
      timing();
      break;
    case "shutter":
      unit("power", "hold", "skew");
      validatePixiEnum(bound, definition, context, diagnostics, "shape", ["eyelid", "iris", "slice"]);
      validatePixiColor(bound, definition, context, diagnostics, "color");
      timing(true);
      break;
    case "signalmask":
      unit("power", "bands", "noise", "chroma", "threshold");
      nonNegative("speed");
      finite("seed");
      timing();
      break;
    case "staticfilter":
      unit("power", "density", "scanline", "jitter", "warp", "vignette");
      validatePixiNumber(bound, definition, context, diagnostics, "grainSize", Number.MIN_VALUE);
      nonNegative("speed");
      finite("seed");
      validatePixiEnum(bound, definition, context, diagnostics, "palette", ["cold", "sepia", "green", "mono"]);
      timing();
      break;
    case "vignette":
      unit("power", "radius", "softness", "breathe", "grain");
      validatePixiColor(bound, definition, context, diagnostics, "color");
      timing();
      break;
    case "waterveil":
      unit("power", "level", "ripple", "blur", "droplets");
      finite("drift", "seed");
      validatePixiColor(bound, definition, context, diagnostics, "tint");
      timing();
      break;
  }
  return diagnostics;
}

const characterTonePresetIds = new Set<string>([...CHARACTER_TONE_PRESET_IDS, "none"]);

function validatePixiNumber(
  bound: BoundCommand,
  definition: NaniCommandDefinition,
  context: CommandDiagnosticContext,
  diagnostics: RuntimeCompilerDiagnostic[],
  key: string,
  minimum?: number,
  maximum?: number
): void {
  const value = staticScalarValue(getCommandParam(bound.shape, key));
  if (value === undefined) return;
  if (typeof value === "number" && Number.isFinite(value) &&
    (minimum === undefined || value >= minimum) && (maximum === undefined || value <= maximum)) return;
  const range = minimum === undefined
    ? "a finite number"
    : maximum === undefined
      ? `a finite number greater than or equal to ${minimum}`
      : `a finite number from ${minimum} to ${maximum}`;
  diagnostics.push(pixiParamDiagnostic(bound, definition, context, key, `${key} must be ${range}.`));
}

function validatePixiInteger(
  bound: BoundCommand,
  definition: NaniCommandDefinition,
  context: CommandDiagnosticContext,
  diagnostics: RuntimeCompilerDiagnostic[],
  key: string,
  minimum: number,
  maximum: number
): void {
  const value = staticScalarValue(getCommandParam(bound.shape, key));
  if (value === undefined) return;
  if (typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum) return;
  diagnostics.push(pixiParamDiagnostic(
    bound, definition, context, key, `${key} must be an integer from ${minimum} to ${maximum}.`
  ));
}

function validatePixiEnum(
  bound: BoundCommand,
  definition: NaniCommandDefinition,
  context: CommandDiagnosticContext,
  diagnostics: RuntimeCompilerDiagnostic[],
  key: string,
  allowed: readonly string[]
): void {
  const value = staticScalarValue(getCommandParam(bound.shape, key));
  if (value === undefined || (typeof value === "string" && allowed.includes(value))) return;
  diagnostics.push(pixiParamDiagnostic(
    bound, definition, context, key, `${key} must be one of ${allowed.join(", ")}.`
  ));
}

function validatePixiColor(
  bound: BoundCommand,
  definition: NaniCommandDefinition,
  context: CommandDiagnosticContext,
  diagnostics: RuntimeCompilerDiagnostic[],
  key: string
): void {
  const value = staticScalarValue(getCommandParam(bound.shape, key));
  if (value === undefined || (typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u.test(value))) return;
  diagnostics.push(pixiParamDiagnostic(bound, definition, context, key, `${key} must be a #RGB or #RRGGBB color.`));
}

function validatePixiVector2(
  bound: BoundCommand,
  definition: NaniCommandDefinition,
  context: CommandDiagnosticContext,
  diagnostics: RuntimeCompilerDiagnostic[],
  key: string,
  percent: boolean
): void {
  const raw = getCommandParam(bound.shape, key);
  if (!raw || raw.type === "expression") return;
  const values = raw.type === "list" ? raw.value : [raw];
  const valid = values.length === 2 && values.every((item) =>
    item.type === "number" && Number.isFinite(item.value) && (!percent || (item.value >= 0 && item.value <= 100))
  );
  if (valid) return;
  diagnostics.push(pixiParamDiagnostic(
    bound, definition, context, key, `${key} must contain exactly two finite${percent ? " 0..100" : ""} numbers.`
  ));
}

function pixiParamDiagnostic(
  bound: BoundCommand,
  definition: NaniCommandDefinition,
  context: CommandDiagnosticContext,
  key: string,
  message: string
): RuntimeCompilerDiagnostic {
  return createArgumentDiagnostic(
    context,
    paramOrigin(bound, key),
    "value",
    "invalid-command-param",
    `@${definition.canonicalName} ${message}`,
    "error"
  );
}

export function diagnoseCharacterToneParams(
  bound: BoundCommand,
  definition: NaniCommandDefinition,
  context: CommandDiagnosticContext
): RuntimeCompilerDiagnostic[] {
  if (definition.id !== "chartone") return [];

  const presetValue = bound.shape.primary ?? getCommandParam(bound.shape, "preset");
  const amountValue = getCommandParam(bound.shape, "amount");
  const timeValue = getCommandParam(bound.shape, "time");
  const preset = staticScalarValue(presetValue);
  const amount = staticScalarValue(amountValue);
  const time = staticScalarValue(timeValue);
  const diagnostics: RuntimeCompilerDiagnostic[] = [];

  if (bound.shape.primary && getCommandParam(bound.shape, "preset")) {
    diagnostics.push(
      createArgumentDiagnostic(
        context,
        paramOrigin(bound, "preset"),
        "whole",
        "invalid-command-param",
        "@charTone accepts the preset either as its primary value or as preset:, but not both.",
        "error"
      )
    );
  }

  if (!presetValue && !amountValue) {
    diagnostics.push(
      createCommandDiagnostic(
        context,
        "invalid-command-param",
        "@charTone requires a preset, none, or amount.",
        "error"
      )
    );
  }

  if (preset !== undefined && (typeof preset !== "string" || !characterTonePresetIds.has(preset))) {
    diagnostics.push(
      createArgumentDiagnostic(
        context,
        bound.origins.primary ?? paramOrigin(bound, "preset"),
        "value",
        "invalid-command-param",
        `@charTone preset must be one of ${[...characterTonePresetIds].join(", ")}.`,
        "error"
      )
    );
  }

  if (amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)) {
    diagnostics.push(
      createArgumentDiagnostic(
        context,
        paramOrigin(bound, "amount"),
        "value",
        "invalid-command-param",
        "@charTone amount must be a finite non-negative number.",
        "error"
      )
    );
  }

  if (time !== undefined && (typeof time !== "number" || !Number.isFinite(time) || time < 0)) {
    diagnostics.push(
      createArgumentDiagnostic(
        context,
        paramOrigin(bound, "time"),
        "value",
        "invalid-command-param",
        "@charTone time must be a finite non-negative number of seconds.",
        "error"
      )
    );
  }

  if (preset === "none" && typeof amount === "number" && amount > 0) {
    diagnostics.push(
      createArgumentDiagnostic(
        context,
        paramOrigin(bound, "amount"),
        "value",
        "invalid-command-param",
        "@charTone none cannot be combined with a positive amount.",
        "error"
      )
    );
  }

  return diagnostics;
}

const pinpEffects = new Set(["fade", "none"]);
const pinpLayoutParams = ["pos", "height", "ratio", "alt"] as const;

export function diagnosePinpParams(
  bound: BoundCommand,
  definition: NaniCommandDefinition,
  context: CommandDiagnosticContext
): RuntimeCompilerDiagnostic[] {
  if (definition.id !== "pinp") return [];

  const command = bound.shape;
  const namedAsset = getCommandParam(command, "assetId");
  const sourceValue = command.primary ?? namedAsset;
  const visibleValue = getCommandParam(command, "visible");
  const visible = staticScalarValue(visibleValue);
  const effectValue = getCommandParam(command, "effect");
  const effect = staticScalarValue(effectValue);
  const timeValue = getCommandParam(command, "time");
  const time = staticScalarValue(timeValue);
  const diagnostics: RuntimeCompilerDiagnostic[] = [];

  if (command.primary && namedAsset) {
    diagnostics.push(createArgumentDiagnostic(
      context,
      paramOrigin(bound, "assetId"),
      "whole",
      "invalid-command-param",
      "@pinp accepts the asset either as its primary value or as assetId:, but not both.",
      "error"
    ));
  }

  const waitArgumentIndex = context.command.args.findIndex(
    (argument) => (argument.kind === "flag" || argument.kind === "param") && normalizeParamName(argument.key) === "wait"
  );
  if (waitArgumentIndex >= 0) {
    diagnostics.push(createArgumentDiagnostic(
      context,
      { argumentIndex: waitArgumentIndex },
      "whole",
      "invalid-command-param",
      "@pinp is non-blocking and does not accept wait or wait!.",
      "error"
    ));
  }

  if (visible === false) {
    if (sourceValue) {
      diagnostics.push(createArgumentDiagnostic(
        context,
        bound.origins.primary ?? paramOrigin(bound, "assetId"),
        "whole",
        "invalid-command-param",
        "@pinp visible:false is the hide form and cannot include an asset.",
        "error"
      ));
    }
    for (const name of pinpLayoutParams) {
      if (!getCommandParam(command, name)) continue;
      diagnostics.push(createArgumentDiagnostic(
        context,
        paramOrigin(bound, name),
        "whole",
        "invalid-command-param",
        `@pinp visible:false cannot include ${name}.`,
        "error"
      ));
    }
  } else if (!sourceValue) {
    diagnostics.push(createCommandDiagnostic(
      context,
      "invalid-command-param",
      "@pinp show form requires a primary asset ID.",
      "error"
    ));
  } else {
    const source = staticScalarValue(sourceValue);
    if (source !== undefined && (typeof source !== "string" || source.trim().length === 0)) {
      diagnostics.push(createArgumentDiagnostic(
        context,
        bound.origins.primary ?? paramOrigin(bound, "assetId"),
        "value",
        "invalid-command-param",
        "@pinp asset ID must be a non-empty string.",
        "error"
      ));
    }
  }

  validatePinpTuple(bound, context, diagnostics, "pos", 2, (value) => value >= 0 && value <= 100,
    "@pinp pos must contain exactly two finite numbers from 0 to 100.");
  validatePinpNumber(bound, context, diagnostics, "height", (value) => value > 0 && value <= 100,
    "@pinp height must be a finite number greater than 0 and at most 100.");
  validatePinpTuple(bound, context, diagnostics, "ratio", 2, (value) => value > 0,
    "@pinp ratio must contain exactly two positive finite numbers.");
  validatePinpNumber(bound, context, diagnostics, "time", (value) => value >= 0,
    "@pinp time must be a finite non-negative number of seconds.");

  if (effect !== undefined && (typeof effect !== "string" || !pinpEffects.has(effect))) {
    diagnostics.push(createArgumentDiagnostic(
      context,
      paramOrigin(bound, "effect"),
      "value",
      "invalid-command-param",
      "@pinp effect must be fade or none.",
      "error"
    ));
  }
  if (effect === "none" && typeof time === "number" && time > 0) {
    diagnostics.push(createArgumentDiagnostic(
      context,
      paramOrigin(bound, "time"),
      "value",
      "invalid-command-param",
      "@pinp effect:none cannot be combined with a non-zero time.",
      "error"
    ));
  }
  return diagnostics;
}

function validatePinpNumber(
  bound: BoundCommand,
  context: CommandDiagnosticContext,
  diagnostics: RuntimeCompilerDiagnostic[],
  name: string,
  accepts: (value: number) => boolean,
  message: string
): void {
  const raw = getCommandParam(bound.shape, name);
  if (!raw || raw.type === "expression") return;
  const value = staticScalarValue(raw);
  if (typeof value === "number" && Number.isFinite(value) && accepts(value)) return;
  diagnostics.push(createArgumentDiagnostic(
    context,
    paramOrigin(bound, name),
    "value",
    "invalid-command-param",
    message,
    "error"
  ));
}

function validatePinpTuple(
  bound: BoundCommand,
  context: CommandDiagnosticContext,
  diagnostics: RuntimeCompilerDiagnostic[],
  name: string,
  length: number,
  accepts: (value: number) => boolean,
  message: string
): void {
  const raw = getCommandParam(bound.shape, name);
  if (!raw || raw.type === "expression") return;
  if (
    raw.type === "list" &&
    raw.value.length === length &&
    raw.value.every((item) => item.type === "number" && Number.isFinite(item.value) && accepts(item.value))
  ) return;
  diagnostics.push(createArgumentDiagnostic(
    context,
    paramOrigin(bound, name),
    "value",
    "invalid-command-param",
    message,
    "error"
  ));
}

function paramOrigin(bound: BoundCommand, name: string): BoundArgumentOrigin | undefined {
  const normalized = normalizeParamName(name);
  return Object.entries(bound.origins.params).find(([candidate]) => normalizeParamName(candidate) === normalized)?.[1];
}

export function diagnoseIgnoredPromotedPrimary(
  bound: BoundCommand,
  definition: NaniCommandDefinition,
  normalizer: CommandNormalizerDescriptor,
  context: CommandDiagnosticContext
): RuntimeCompilerDiagnostic[] {
  const origin = bound.origins.primary;
  if (!origin?.promoted || normalizer.acceptsPrimary) return [];
  const arg = context.command.args[origin.argumentIndex];
  if (!arg) return [];
  const argumentName = arg.kind === "param" ? arg.key : "value";
  return [
    createArgumentDiagnostic(
      context,
      origin,
      "whole",
      "ignored-promoted-primary",
      "@" +
        definition.canonicalName +
        " does not declare parameter " +
        argumentName +
        ", and its runtime compiler does not consume a primary value; " +
        arg.raw +
        " would be ignored.",
      "warning"
    )
  ];
}

const runtimeUiTargets = new Set<string>(RUNTIME_UI_GROUPS);

interface UiTargetCandidate {
  argumentIndex: number;
  itemIndex?: number;
  target: string;
}

export function diagnoseUiTargets(
  bound: BoundCommand,
  definition: NaniCommandDefinition,
  context: CommandDiagnosticContext
): RuntimeCompilerDiagnostic[] {
  if (definition.id !== "showui" && definition.id !== "hideui") return [];

  const diagnostics: RuntimeCompilerDiagnostic[] = [];
  for (const candidate of uiTargetCandidates(context.command)) {
    if (runtimeUiTargets.has(candidate.target)) continue;
    const suffix = bound.shape.flags.wait === true ? "; wait! will not create a UI presentation wait." : ".";
    diagnostics.push(
      createArgumentDiagnostic(
        context,
        { argumentIndex: candidate.argumentIndex },
        "value",
        "unsupported-ui-target",
        "@" +
          definition.canonicalName +
          " target " +
          candidate.target +
          " is not a v1 runtime UI surface" +
          suffix,
        "warning",
        candidate.itemIndex
      )
    );
  }
  return diagnostics;
}

function uiTargetCandidates(command: CommandDiagnosticContext["command"]): UiTargetCandidate[] {
  const candidates: UiTargetCandidate[] = [];
  const primaryIndex = command.args.findIndex((arg) => arg.kind === "value");
  if (primaryIndex >= 0) {
    const primary = command.args[primaryIndex];
    if (primary?.kind === "value") candidates.push(...uiTargetsFromValue(primary.value, primaryIndex));
  }

  for (const [argumentIndex, arg] of command.args.entries()) {
    if (arg.kind !== "param") continue;
    const key = normalizeParamName(arg.key);
    if (key !== "target" && key !== "uinames") continue;
    candidates.push(...uiTargetsFromValue(arg.value, argumentIndex));
  }
  return candidates;
}

function uiTargetsFromValue(value: NaniValue, argumentIndex: number): UiTargetCandidate[] {
  if (value.type === "expression") return [];
  if (value.type === "list") {
    return value.value.flatMap((item, itemIndex) =>
      uiTargetsFromValue(item, argumentIndex).map((candidate) => ({ ...candidate, itemIndex }))
    );
  }
  const target = String(value.value).trim();
  return target ? [{ argumentIndex, target }] : [];
}

function allowsDynamicAssignmentParam(definition: NaniCommandDefinition): boolean {
  return definition.id === "set";
}

function isCompatibleCommandValue(value: NaniValue, officialType: string): boolean {
  const normalized = officialType.toLowerCase();
  if (normalized.includes("list")) {
    if (normalized === "decimal list" && (value.type === "number" || value.type === "expression")) return true;
    if (value.type !== "list") return normalized.startsWith("named ");
    const itemType = normalized.includes("decimal") ? "decimal" : normalized.includes("boolean") ? "boolean" : "string";
    return value.value.every((item) => isCompatibleCommandValue(item, itemType));
  }
  if (normalized.startsWith("named ")) {
    return value.type === "string" || value.type === "raw" || value.type === "expression" || value.type === "list";
  }
  if (normalized === "boolean") return value.type === "boolean" || value.type === "expression";
  if (normalized === "decimal") return value.type === "number" || value.type === "expression";
  if (normalized === "integer") {
    return (value.type === "number" && Number.isInteger(value.value)) || value.type === "expression";
  }
  return value.type === "string" || value.type === "raw" || value.type === "expression";
}

function firstIncompatibleListItemIndex(
  value: NaniValue,
  officialType: string
): number | undefined {
  const normalized = officialType.toLowerCase();
  if (!normalized.includes("list") || value.type !== "list") return undefined;
  const itemType = normalized.includes("decimal")
    ? "decimal"
    : normalized.includes("boolean")
      ? "boolean"
      : "string";
  const index = value.value.findIndex((item) => !isCompatibleCommandValue(item, itemType));
  return index >= 0 ? index : undefined;
}

export function createCommandDiagnostic(
  context: CommandDiagnosticContext,
  code: RuntimeCompilerDiagnosticCode,
  message: string,
  severity: RuntimeCompilerDiagnostic["severity"]
): RuntimeCompilerDiagnostic {
  return {
    code,
    message,
    severity,
    loc: context.command.loc,
    span: resolveNonEmptyDiagnosticSpan(context, [
      {
        kind: "command-name",
        statementIndex: context.statementIndex
      },
      {
        kind: "statement",
        statementIndex: context.statementIndex,
        part: "marker"
      },
      {
        kind: "statement",
        statementIndex: context.statementIndex,
        part: "whole"
      }
    ])
  };
}

type CommandArgumentPart = Extract<NaniSourceRef, { kind: "command-argument" }>["part"];

export function createArgumentDiagnostic(
  context: CommandDiagnosticContext,
  origin: BoundArgumentOrigin | undefined,
  part: CommandArgumentPart,
  code: RuntimeCompilerDiagnosticCode,
  message: string,
  severity: RuntimeCompilerDiagnostic["severity"],
  itemIndex?: number
): RuntimeCompilerDiagnostic {
  if (!origin) {
    throw new Error(
      `Runtime compiler diagnostic invariant failed: ${code} has no argument origin for statement ` +
        `${context.statementIndex} in ${context.sourceMap.scriptPath}.`
    );
  }
  const refs: NaniSourceRef[] = [];
  if (itemIndex !== undefined) {
    if (part !== "value") {
      throw new Error("Runtime compiler diagnostic invariant failed: list item refs require a value part.");
    }
    refs.push({
      kind: "command-argument",
      statementIndex: context.statementIndex,
      argumentIndex: origin.argumentIndex,
      part: "value",
      itemIndex
    });
  } else {
    refs.push({
      kind: "command-argument",
      statementIndex: context.statementIndex,
      argumentIndex: origin.argumentIndex,
      part
    });
  }
  refs.push(
    {
      kind: "command-argument",
      statementIndex: context.statementIndex,
      argumentIndex: origin.argumentIndex,
      part: "whole"
    },
    {
      kind: "command-name",
      statementIndex: context.statementIndex
    },
    {
      kind: "statement",
      statementIndex: context.statementIndex,
      part: "marker"
    },
    {
      kind: "statement",
      statementIndex: context.statementIndex,
      part: "whole"
    }
  );

  const itemDelimiter =
    itemIndex === undefined
      ? undefined
      : emptyListItemDelimiterSpan(
          context,
          origin.argumentIndex,
          itemIndex
        );
  return {
    code,
    message,
    severity,
    loc: context.command.loc,
    span: resolveNonEmptyDiagnosticSpan(context, refs, itemDelimiter)
  };
}

function resolveNonEmptyDiagnosticSpan(
  context: CommandDiagnosticContext,
  refs: readonly NaniSourceRef[],
  structuralFallback?: TextSpan
): TextSpan {
  for (const [index, ref] of refs.entries()) {
    const span = resolveNaniSourceRef(context.sourceMap, ref);
    if (isValidNonEmptySpan(context, span)) return span;
    if (index === 0 && structuralFallback && isValidNonEmptySpan(context, structuralFallback)) {
      return structuralFallback;
    }
  }

  throw new Error(
    "Runtime compiler diagnostic invariant failed: no non-empty source anchor for statement " +
      context.statementIndex +
      " in " +
      context.sourceMap.scriptPath +
      "."
  );
}

function emptyListItemDelimiterSpan(
  context: CommandDiagnosticContext,
  argumentIndex: number,
  itemIndex: number
): TextSpan | undefined {
  const argument =
    context.sourceMap.statements[context.statementIndex]?.command?.arguments[argumentIndex];
  const item = argument?.itemSpans[itemIndex];
  if (!argument || !item || item.end > item.start) return undefined;

  const next = argument.itemSpans[itemIndex + 1];
  if (next && item.end < next.start) {
    return { start: item.end, end: next.start };
  }
  const previous = argument.itemSpans[itemIndex - 1];
  if (previous && previous.end < item.start) {
    return { start: previous.end, end: item.start };
  }
  return undefined;
}

function isValidNonEmptySpan(
  context: CommandDiagnosticContext,
  span: TextSpan
): boolean {
  return (
    span.start >= 0 &&
    span.end > span.start &&
    span.end <= context.sourceMap.sourceLength
  );
}
