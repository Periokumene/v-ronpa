import type { NaniCommandDefinition, NaniCommandParamSpec } from "@v-ronpa/contracts";
import type { CommandIR, NaniValue } from "@v-ronpa/nani-parser";
import type { BoundCommand, CommandOrigins, CommandShape } from "./types";
import {
  normalizeParamName,
  runtimePrimaryValueFromRawParam,
  staticScalarValue
} from "./values.ts";

const commandParamSpecsCache = new WeakMap<
  NaniCommandDefinition,
  ReadonlyMap<string, NaniCommandParamSpec>
>();

export function bindCommand(command: CommandIR, definition: NaniCommandDefinition): BoundCommand {
  const specsByName = commandParamSpecsByName(definition);
  const shape: CommandShape = {
    params: {},
    flags: {}
  };
  const origins: CommandOrigins = { params: {}, flags: {} };

  for (const [argumentIndex, arg] of command.args.entries()) {
    if (arg.kind === "flag") {
      const spec = specsByName.get(normalizeParamName(arg.key));
      const key = spec?.name ?? arg.key;
      shape.flags[key] = arg.value;
      origins.flags[key] = { argumentIndex };
      continue;
    }

    if (arg.kind === "value") {
      if (!shape.primary) {
        shape.primary = arg.value;
        origins.primary = { argumentIndex };
      }
      continue;
    }

    const normalizedKey = normalizeParamName(arg.key);
    if (normalizedKey === "if") {
      shape.condition = conditionFromArgValue(arg.value);
      continue;
    }
    if (normalizedKey === "unless") {
      shape.unless = conditionFromArgValue(arg.value);
      continue;
    }
    const spec = specsByName.get(normalizedKey);
    if (definition.id === "set" && !spec) {
      shape.params[arg.key] = arg.value;
      origins.params[arg.key] = { argumentIndex };
      continue;
    }
    if (spec) {
      shape.params[spec.name] = arg.value;
      origins.params[spec.name] = { argumentIndex };
      continue;
    }

    if (!shape.primary) {
      shape.primary = runtimePrimaryValueFromRawParam(arg.raw);
      origins.primary = { argumentIndex, promoted: true };
    } else {
      shape.params[arg.key] = arg.value;
      origins.params[arg.key] = { argumentIndex };
    }
  }

  return { shape, origins };
}

function conditionFromArgValue(value: NaniValue): NonNullable<CommandShape["condition"]> {
  if (value.type === "expression") return { source: value.source };
  return { source: String(staticScalarValue(value) ?? "") };
}

export function commandParamSpecsByName(
  definition: NaniCommandDefinition
): ReadonlyMap<string, NaniCommandParamSpec> {
  const cached = commandParamSpecsCache.get(definition);
  if (cached) return cached;
  const specs = new Map<string, NaniCommandParamSpec>();
  for (const spec of definition.params) {
    specs.set(normalizeParamName(spec.name), spec);
    for (const alias of spec.aliases ?? []) specs.set(normalizeParamName(alias), spec);
  }
  commandParamSpecsCache.set(definition, specs);
  return specs;
}
