import {
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
    if (spec.required && getCommandParam(command, spec.name) === undefined) {
      diagnostics.push(
        createCommandDiagnostic(
          context,
          "invalid-command-param",
          "@" + definition.canonicalName + " requires parameter " + spec.name + ":" + spec.type + ".",
          "error"
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
  const command = bound.shape;
  if (definition.id === "shake" && runtimeParam(command, "loop") === true) {
    return [
      createArgumentDiagnostic(
        context,
        bound.origins.params.loop ?? bound.origins.flags.loop,
        "whole",
        "unsupported-command-param",
        "@shake loop! is declared by Naninovel, but this Pixi runtime does not implement indefinite loop effects in the main story track; the command is diagnosed instead of approximated.",
        "warning"
      )
    ];
  }
  return [];
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
