import {
  getNaniCommandDefinition,
  type NaniCommandDefinition,
  type RuntimeCommand,
  type RuntimeScript,
  type RuntimeValue
} from "@v-ronpa/contracts";
import type { CommandIR, NaniValue, ScenarioIR, StatementIR, TextIR } from "@v-ronpa/nani-parser";

export type RuntimeCompilerDiagnosticCode =
  | "unknown-command"
  | "invalid-command-param"
  | "unsupported-command-param";

export interface RuntimeCompilerDiagnostic {
  code: RuntimeCompilerDiagnosticCode;
  message: string;
  severity?: "info" | "warning" | "error";
}

export interface CompileRuntimeScriptResult {
  script: RuntimeScript;
  diagnostics: RuntimeCompilerDiagnostic[];
}

interface NormalizedCommandParams {
  params: Record<string, RuntimeValue>;
  consumesParams: string[];
}

export function compileRuntimeScript(scenario: ScenarioIR): CompileRuntimeScriptResult {
  const diagnostics: RuntimeCompilerDiagnostic[] = [];
  const commands: RuntimeCommand[] = [];
  const labels: Record<string, number> = {};

  for (const statement of scenario.statements) {
    if (statement.kind === "label") {
      labels[statement.name] = commands.length;
      continue;
    }

    const command = compileStatement(statement, diagnostics);
    if (command) commands.push(command);
  }

  return {
    script: {
      scriptPath: scenario.scriptPath,
      commands,
      labels,
      assets: scenario.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind as RuntimeScript["assets"][number]["kind"],
        uri: asset.uri ?? "",
        tags: []
      })),
      dependencies: scenario.dependencies
    },
    diagnostics
  };
}

function compileStatement(
  statement: StatementIR,
  diagnostics: RuntimeCompilerDiagnostic[]
): RuntimeCommand | undefined {
  if (statement.kind === "comment" || statement.kind === "label") return undefined;
  if (statement.kind === "text") return compileText(statement);
  return compileCommand(statement, diagnostics);
}

function compileText(statement: TextIR): RuntimeCommand {
  const text = statement.tokens.filter((token) => token.kind === "text").map((token) => token.text).join("");
  const autoNext = statement.tokens.some((token) => token.kind === "inline-command" && token.command.commandId === ">");
  const params: Record<string, RuntimeValue> = {
    text,
    autoNext
  };
  if (statement.speaker) params.speaker = statement.speaker;
  if (statement.appearance) params.appearance = statement.appearance;

  return {
    commandId: "print",
    canonicalName: "print",
    category: "text",
    source: "v-ronpa",
    status: "implemented",
    params,
    loc: statement.loc,
    sourceCommand: {
      rawCommandId: "text",
      rawParams: statement.printParams ? plainParamRecord(statement.printParams) : {}
    }
  };
}

function compileCommand(command: CommandIR, diagnostics: RuntimeCompilerDiagnostic[]): RuntimeCommand | undefined {
  const definition = getNaniCommandDefinition(command.commandId);
  if (!definition) {
    diagnostics.push(
      createDiagnostic("unknown-command", `Unknown .nani command: @${command.commandId}.`, "error")
    );
    return undefined;
  }

  const validationDiagnostics = validateCommandAgainstCatalog(command, definition);
  diagnostics.push(...validationDiagnostics);
  if (validationDiagnostics.some((diagnostic) => diagnostic.severity === "error")) return undefined;

  const normalized = normalizeCommandParams(command, definition);
  diagnostics.push(...diagnoseUnsupportedImplementedParams(command, definition, normalized.consumesParams));

  const sourceCommand = {
    rawCommandId: command.commandId,
    ...(command.primary ? { rawPrimary: plainCommandValue(command.primary) } : {}),
    rawParams: plainParamRecord(command.params),
    rawFlags: { ...command.flags }
  };

  return {
    commandId: definition.id,
    canonicalName: definition.canonicalName,
    category: definition.category,
    source: definition.source,
    status: definition.status,
    params: normalized.params,
    ...(command.condition ? { condition: { type: "expression" as const, source: command.condition.source } } : {}),
    ...(command.unless ? { unless: { type: "expression" as const, source: command.unless.source } } : {}),
    loc: command.loc,
    sourceCommand
  };
}

function normalizeCommandParams(command: CommandIR, definition: NaniCommandDefinition): NormalizedCommandParams {
  switch (definition.id) {
    case "print":
      return {
        params: compactParams({
          text: runtimeCommandValue(command.primary) ?? runtimeParam(command, "text") ?? "",
          speaker: runtimeParam(command, "speaker") ?? runtimeParam(command, "author"),
          autoNext: runtimeParam(command, "autoNext") ?? false
        }),
        consumesParams: ["text", "speaker", "author", "autoNext"]
      };
    case "back":
      return normalizeBackCommand(command);
    case "char":
      return normalizeCharCommand(command);
    case "arrange":
      return normalizeArrangeCommand(command);
    case "hidechars":
      return normalizeHideCharsCommand(command);
    case "slide":
      return normalizeSlideCommand(command);
    case "blur":
      return normalizeBlurCommand(command);
    case "bokeh":
      return normalizeBokehCommand(command);
    case "glitch":
      return normalizeGlitchCommand(command);
    case "rain":
    case "snow":
    case "sun":
      return normalizeWeatherCommand(command, definition.id);
    case "shake":
      return normalizeShakeCommand(command);
    case "flash":
      return {
        params: compactParams({
          color: runtimeParam(command, "color") ?? "#ffffff",
          duration: runtimeParam(command, "duration") ?? 160
        }),
        consumesParams: ["color", "duration"]
      };
    case "focus":
      return {
        params: compactParams({
          target: runtimeCommandValue(command.primary) ?? runtimeParam(command, "target") ?? "stage",
          duration: runtimeParam(command, "duration") ?? 500
        }),
        consumesParams: ["target", "duration"]
      };
    case "trialkeyword":
      return {
        params: compactParams({
          keywordId: runtimeCommandValue(command.primary) ?? runtimeParam(command, "id") ?? "kw:unknown",
          text: runtimeParam(command, "text") ?? "keyword",
          evidenceId: runtimeParam(command, "evidence") ?? runtimeParam(command, "evidenceId"),
          speakerId: runtimeParam(command, "speaker")
        }),
        consumesParams: ["id", "text", "speaker", "evidence", "evidenceId"]
      };
    case "gameplay": {
      return {
        params: compactParams({
          type: runtimeCommandValue(command.primary) ?? runtimeParam(command, "type") ?? "",
          quantity: runtimeParam(command, "quantity") ?? 1,
          itemId: runtimeParam(command, "item") ?? runtimeParam(command, "itemId") ?? runtimeParam(command, "id"),
          evidenceId: runtimeParam(command, "evidence") ?? runtimeParam(command, "evidenceId") ?? runtimeParam(command, "id"),
          characterId: runtimeParam(command, "character") ?? runtimeParam(command, "characterId"),
          status: runtimeParam(command, "status"),
          skillId: runtimeParam(command, "skill") ?? runtimeParam(command, "skillId"),
          affinityDelta: runtimeParam(command, "delta") ?? runtimeParam(command, "affinityDelta") ?? 0
        }),
        consumesParams: [
          "type",
          "quantity",
          "item",
          "itemId",
          "id",
          "evidence",
          "evidenceId",
          "character",
          "characterId",
          "status",
          "skill",
          "skillId",
          "delta",
          "affinityDelta"
        ]
      };
    }
    case "choice":
      return {
        params: compactParams({
          text: runtimeCommandValue(command.primary) ?? "Choice",
          goto: runtimeParam(command, "goto")
        }),
        consumesParams: ["goto"]
      };
    case "goto":
      return {
        params: compactParams({
          label: runtimeCommandValue(command.primary) ?? runtimeParam(command, "path") ?? ""
        }),
        consumesParams: ["path"]
      };
    case "set": {
      const key = command.primary ? String(staticScalarValue(command.primary) ?? "") : Object.keys(command.params)[0] ?? "";
      const value = runtimeParam(command, key) ?? runtimeCommandValue(command.primary) ?? true;
      return {
        params: compactParams({
          key,
          value
        }),
        consumesParams: [key]
      };
    }
    case "end":
      return { params: {}, consumesParams: [] };
    default:
      return { params: createGenericParams(command), consumesParams: [] };
  }
}

function normalizeBackCommand(command: CommandIR): NormalizedCommandParams {
  const named = splitNamedString(runtimeCommandValue(command.primary) ?? runtimeParam(command, "appearanceAndTransition"));
  return {
    params: compactParams({
      target: runtimeParam(command, "id") ?? "MainBackground",
      appearance: runtimeParam(command, "appearance") ?? named.id,
      pose: runtimeParam(command, "pose"),
      transition: runtimeParam(command, "via") ?? named.value ?? runtimeParam(command, "effect"),
      transitionParams: runtimeParam(command, "params"),
      dissolve: runtimeParam(command, "dissolve"),
      ...normalizeActorTransformParams(command)
    }),
    consumesParams: [
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
    ]
  };
}

function normalizeCharCommand(command: CommandIR): NormalizedCommandParams {
  const named = splitNamedString(runtimeCommandValue(command.primary) ?? runtimeParam(command, "idAndAppearance"));
  return {
    params: compactParams({
      target: runtimeParam(command, "id") ?? named.id,
      appearance: runtimeParam(command, "appearance") ?? named.value,
      pose: runtimeParam(command, "pose"),
      transition: runtimeParam(command, "via"),
      transitionParams: runtimeParam(command, "params"),
      dissolve: runtimeParam(command, "dissolve"),
      look: runtimeParam(command, "look"),
      avatar: runtimeParam(command, "avatar"),
      ...normalizeActorTransformParams(command)
    }),
    consumesParams: [
      "idAndAppearance",
      "id",
      "appearance",
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
    ]
  };
}

function normalizeArrangeCommand(command: CommandIR): NormalizedCommandParams {
  return {
    params: compactParams({
      characterPositions: runtimeCommandValue(command.primary) ?? runtimeParam(command, "characterPositions"),
      look: runtimeParam(command, "look"),
      ...normalizeTimingParams(command)
    }),
    consumesParams: ["characterPositions", "look", "time", "wait"]
  };
}

function normalizeHideCharsCommand(command: CommandIR): NormalizedCommandParams {
  return {
    params: compactParams(normalizeTimingParams(command)),
    consumesParams: ["time", "lazy", "wait"]
  };
}

function normalizeSlideCommand(command: CommandIR): NormalizedCommandParams {
  const named = splitNamedString(runtimeCommandValue(command.primary) ?? runtimeParam(command, "idAndAppearance"));
  return {
    params: compactParams({
      target: named.id,
      appearance: named.value,
      from: runtimeParam(command, "from"),
      to: runtimeParam(command, "to"),
      visible: runtimeParam(command, "visible"),
      ...normalizeTimingParams(command)
    }),
    consumesParams: ["idAndAppearance", "from", "to", "visible", "easing", "time", "lazy", "wait"]
  };
}

function normalizeShakeCommand(command: CommandIR): NormalizedCommandParams {
  return {
    params: compactParams({
      target: runtimeCommandValue(command.primary) ?? runtimeParam(command, "actorId") ?? runtimeParam(command, "target") ?? "stage",
      count: runtimeParam(command, "count"),
      loop: runtimeParam(command, "loop"),
      deltaTime: durationMsValue(runtimeParam(command, "deltaTime")),
      power: runtimeParam(command, "power") ?? runtimeParam(command, "intensity") ?? 0.5,
      deltaPower: runtimeParam(command, "deltaPower"),
      hor: runtimeParam(command, "hor"),
      ver: runtimeParam(command, "ver"),
      durationMs: runtimeParam(command, "duration") ?? durationMsValue(runtimeParam(command, "time")),
      wait: runtimeParam(command, "wait") ?? false
    }),
    consumesParams: [
      "actorId",
      "target",
      "count",
      "loop",
      "time",
      "deltaTime",
      "power",
      "deltaPower",
      "hor",
      "ver",
      "wait",
      "intensity",
      "duration"
    ]
  };
}

function normalizeBlurCommand(command: CommandIR): NormalizedCommandParams {
  return {
    params: compactParams({
      target: runtimeCommandValue(command.primary) ?? runtimeParam(command, "actorId") ?? "MainBackground",
      power: runtimeParam(command, "power") ?? 0,
      ...normalizeTimingParams(command)
    }),
    consumesParams: ["actorId", "power", "time", "wait"]
  };
}

function normalizeBokehCommand(command: CommandIR): NormalizedCommandParams {
  return {
    params: compactParams({
      focus: runtimeParam(command, "focus"),
      dist: runtimeParam(command, "dist"),
      power: runtimeParam(command, "power") ?? 0,
      ...normalizeTimingParams(command)
    }),
    consumesParams: ["focus", "dist", "power", "time", "wait"]
  };
}

function normalizeGlitchCommand(command: CommandIR): NormalizedCommandParams {
  return {
    params: compactParams({
      power: runtimeParam(command, "power") ?? 1,
      ...normalizeTimingParams(command)
    }),
    consumesParams: ["time", "power", "wait"]
  };
}

function normalizeWeatherCommand(command: CommandIR, kind: string): NormalizedCommandParams {
  return {
    params: compactParams({
      kind,
      power: runtimeParam(command, "power") ?? 1,
      xSpeed: runtimeParam(command, "xSpeed"),
      ySpeed: runtimeParam(command, "ySpeed"),
      pos: runtimeParam(command, "pos"),
      position: runtimeParam(command, "position"),
      rotation: runtimeParam(command, "rotation"),
      scale: runtimeParam(command, "scale"),
      ...normalizeTimingParams(command)
    }),
    consumesParams: ["power", "time", "xSpeed", "ySpeed", "pos", "position", "rotation", "scale", "wait"]
  };
}

function normalizeActorTransformParams(command: CommandIR): Record<string, RuntimeValue | undefined> {
  return {
    pos: runtimeParam(command, "pos"),
    position: runtimeParam(command, "position"),
    rotation: runtimeParam(command, "rotation"),
    scale: runtimeParam(command, "scale"),
    tint: runtimeParam(command, "tint"),
    visible: runtimeParam(command, "visible"),
    ...normalizeTimingParams(command)
  };
}

function normalizeTimingParams(command: CommandIR): Record<string, RuntimeValue | undefined> {
  return {
    easing: runtimeParam(command, "easing"),
    durationMs: durationMsValue(runtimeParam(command, "time")),
    lazy: runtimeParam(command, "lazy") ?? false,
    wait: runtimeParam(command, "wait") ?? false
  };
}

function splitNamedString(value: RuntimeValue | undefined): { id?: RuntimeValue; value?: RuntimeValue } {
  if (value === undefined) return {};
  if (typeof value !== "string") return { id: value };
  const dot = value.indexOf(".");
  if (dot < 0) return { id: value };
  return { id: value.slice(0, dot), value: value.slice(dot + 1) };
}

function durationMsValue(value: RuntimeValue | undefined): RuntimeValue | undefined {
  if (typeof value === "number") return Math.max(0, Math.round(value * 1000));
  if (value && !Array.isArray(value) && typeof value === "object" && value.type === "expression") {
    return { type: "expression", source: `(${value.source})*1000` };
  }
  return value;
}

function createGenericParams(command: CommandIR): Record<string, RuntimeValue> {
  const params: Record<string, RuntimeValue> = {};
  if (command.primary) params.primary = runtimeValue(command.primary);
  for (const [key, value] of Object.entries(command.params)) params[key] = runtimeValue(value);
  for (const [key, value] of Object.entries(command.flags)) params[key] = value;
  return params;
}

function validateCommandAgainstCatalog(
  command: CommandIR,
  definition: NaniCommandDefinition
): RuntimeCompilerDiagnostic[] {
  const diagnostics: RuntimeCompilerDiagnostic[] = [];
  const specsByName = new Map(definition.params.map((spec) => [normalizeParamName(spec.name), spec]));

  for (const spec of definition.params) {
    if (spec.name === "params") continue;
    if (spec.required && getCommandParam(command, spec.name) === undefined) {
      diagnostics.push(
        createDiagnostic(
          "invalid-command-param",
          `@${definition.canonicalName} requires parameter ${spec.name}:${spec.type}.`,
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
          createDiagnostic(
            "invalid-command-param",
            `@${definition.canonicalName} does not declare parameter ${key}; commandCatalog is the authority.`,
            "warning"
          )
        );
      }
      continue;
    }
    if (!isCompatibleCommandValue(value, spec.type)) {
      diagnostics.push(
        createDiagnostic(
          "invalid-command-param",
          `@${definition.canonicalName} parameter ${key} expected ${spec.type}.`,
          "error"
        )
      );
    }
  }

  for (const key of Object.keys(command.flags)) {
    const spec = specsByName.get(normalizeParamName(key));
    if (!spec) {
      diagnostics.push(
        createDiagnostic(
          "invalid-command-param",
          `@${definition.canonicalName} does not declare boolean flag ${key}; commandCatalog is the authority.`,
          "warning"
        )
      );
      continue;
    }
    if (spec && !spec.type.includes("boolean")) {
      diagnostics.push(
        createDiagnostic(
          "invalid-command-param",
          `@${definition.canonicalName} flag ${key}! maps to ${spec.type}, not boolean.`,
          "error"
        )
      );
    }
  }

  return diagnostics;
}

function diagnoseUnsupportedImplementedParams(
  command: CommandIR,
  definition: NaniCommandDefinition,
  consumesParams: string[]
): RuntimeCompilerDiagnostic[] {
  if (definition.status !== "implemented") return [];

  const consumed = new Set(consumesParams.map(normalizeParamName));
  const specsByName = new Map(definition.params.map((spec) => [normalizeParamName(spec.name), spec]));
  const diagnostics: RuntimeCompilerDiagnostic[] = [];

  for (const [key, value] of Object.entries(command.params)) {
    const spec = specsByName.get(normalizeParamName(key));
    if (!spec || !isCompatibleCommandValue(value, spec.type) || consumed.has(normalizeParamName(key))) continue;
    diagnostics.push(
      createDiagnostic(
        "unsupported-command-param",
        `@${definition.canonicalName} accepts ${key}:${spec.type}, but the current runtime compiler does not consume it yet.`,
        "warning"
      )
    );
  }

  return diagnostics;
}

function allowsDynamicAssignmentParam(definition: NaniCommandDefinition): boolean {
  return definition.id === "set";
}

function isCompatibleCommandValue(value: NaniValue, officialType: string): boolean {
  const normalized = officialType.toLowerCase();
  if (normalized.includes("list")) {
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

function getCommandParam(command: CommandIR, key: string): NaniValue | undefined {
  const direct = command.params[key];
  if (direct) return direct;
  const normalized = normalizeParamName(key);
  return Object.entries(command.params).find(([candidate]) => normalizeParamName(candidate) === normalized)?.[1];
}

function runtimeParam(command: CommandIR, key: string): RuntimeValue | undefined {
  const value = runtimeCommandValue(getCommandParam(command, key));
  if (value !== undefined) return value;
  const normalized = normalizeParamName(key);
  const flag = Object.entries(command.flags).find(([candidate]) => normalizeParamName(candidate) === normalized);
  return flag?.[1];
}

function runtimeCommandValue(value: NaniValue | undefined): RuntimeValue | undefined {
  return value ? runtimeValue(value) : undefined;
}

function staticScalarValue(value: NaniValue | undefined): string | number | boolean | undefined {
  if (!value) return undefined;
  if (value.type === "string" || value.type === "number" || value.type === "boolean") return value.value;
  if (value.type === "raw") return value.value;
  if (value.type === "expression") return undefined;
  return value.value.map((item) => String(staticScalarValue(item))).join(",");
}

function runtimeValue(value: NaniValue | undefined): RuntimeValue {
  if (!value) return true;
  switch (value.type) {
    case "string":
    case "number":
    case "boolean":
      return value.value;
    case "raw":
      return value.value;
    case "expression":
      return { type: "expression", source: value.source };
    case "list":
      return value.value.map(runtimeValue);
  }
}

function plainCommandValue(value: NaniValue): unknown {
  switch (value.type) {
    case "string":
    case "number":
    case "boolean":
      return value.value;
    case "raw":
      return value.value;
    case "expression":
      return { expression: value.source };
    case "list":
      return value.value.map(plainCommandValue);
  }
}

function plainParamRecord(params: Record<string, NaniValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, plainCommandValue(value)]));
}

function compactParams(params: Record<string, RuntimeValue | undefined>): Record<string, RuntimeValue> {
  return Object.fromEntries(Object.entries(params).filter((entry): entry is [string, RuntimeValue] => entry[1] !== undefined));
}

function normalizeParamName(name: string): string {
  return name.toLowerCase();
}

function createDiagnostic(
  code: RuntimeCompilerDiagnosticCode,
  message: string,
  severity?: RuntimeCompilerDiagnostic["severity"]
): RuntimeCompilerDiagnostic {
  return severity ? { code, message, severity } : { code, message };
}
