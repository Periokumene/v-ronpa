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
      return {
        params: compactParams({
          appearance: runtimeCommandValue(command.primary) ?? runtimeParam(command, "appearanceAndTransition") ?? runtimeParam(command, "id"),
          effect: runtimeParam(command, "effect")
        }),
        consumesParams: ["appearanceAndTransition", "id", "effect"]
      };
    case "charenter":
      return {
        params: compactParams({
          characterId: runtimeCommandValue(command.primary) ?? runtimeParam(command, "character") ?? "character:unknown",
          portraitId: runtimeParam(command, "portrait"),
          slot: runtimeParam(command, "slot") ?? "center",
          effect: runtimeParam(command, "effect") ?? "fadeIn"
        }),
        consumesParams: ["character", "portrait", "slot", "effect"]
      };
    case "shake":
      return {
        params: compactParams({
          target: runtimeCommandValue(command.primary) ?? runtimeParam(command, "actorId") ?? runtimeParam(command, "target") ?? "stage",
          intensity: runtimeParam(command, "intensity") ?? 0.35,
          duration: runtimeParam(command, "duration") ?? 280
        }),
        consumesParams: ["actorId", "target", "intensity", "duration"]
      };
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
  return runtimeCommandValue(getCommandParam(command, key));
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
