import {
  getNaniCommandDefinition,
  type RichTextDocument,
  type NaniCommandDefinition,
  type NaniCommandParamSpec,
  type RuntimeCommand,
  type RuntimeScript,
  type RuntimeValue
} from "@v-ronpa/contracts";
import type { CommandIR, NaniValue, RichTextDocumentIR, ScenarioIR, StatementIR, TextIR } from "@v-ronpa/nani-parser";

export type RuntimeCompilerDiagnosticCode =
  | "unknown-command"
  | "invalid-command-param"
  | "unsupported-command-param"
  | "declared-only-command";

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

interface CommandShape {
  primary?: NaniValue;
  params: Record<string, NaniValue>;
  flags: Record<string, boolean>;
  condition?: CommandIR["condition"];
  unless?: CommandIR["unless"];
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
  const text = statement.richText?.text ?? statement.tokens.filter((token) => token.kind === "text").map((token) => token.text).join("");
  const autoNext = statement.tokens.some((token) => token.kind === "inline-command" && token.command.commandId === ">");
  const params: Record<string, RuntimeValue> = {
    text,
    autoNext
  };
  if (statement.speaker) params.speaker = statement.speaker;
  if (statement.appearance) params.appearance = statement.appearance;
  if (statement.printParams?.speed !== undefined) params.speed = runtimeValue(statement.printParams.speed);
  if (statement.textId) params.textId = statement.textId;

  return {
    commandId: "print",
    canonicalName: "print",
    category: "text",
    source: "v-ronpa",
    status: "implemented",
    params,
    ...(statement.richText ? { richText: richTextDocument(statement.richText) } : {}),
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

  const shape = resolveCommandShape(command, definition);
  if (definition.execution === "declared-only") {
    diagnostics.push(
      createDiagnostic(
        "declared-only-command",
        `@${definition.canonicalName} is declared for Naninovel compatibility, but this runtime does not implement its execution boundary yet.`,
        "warning"
      )
    );
  }

  const validationDiagnostics = validateCommandAgainstCatalog(shape, definition);
  diagnostics.push(...validationDiagnostics);
  if (validationDiagnostics.some((diagnostic) => diagnostic.severity === "error")) return undefined;

  const normalized = normalizeCommandParams(shape, definition);
  const richText = richTextForCommand(command, definition.id);
  if (richText) normalized.params.text = richText.text;
  diagnostics.push(...diagnoseUnsupportedImplementedParams(shape, definition, normalized.consumesParams));
  diagnostics.push(...diagnoseExecutionBoundaryParams(shape, definition));

  const sourceCommand = {
    rawCommandId: command.commandId,
    ...(shape.primary ? { rawPrimary: plainCommandValue(shape.primary) } : {}),
    rawParams: plainParamRecord(shape.params),
    rawFlags: { ...shape.flags }
  };

  return {
    commandId: definition.id,
    canonicalName: definition.canonicalName,
    category: definition.category,
    source: definition.source,
    status: definition.status,
    params: normalized.params,
    ...(richText ? { richText: richTextDocument(richText) } : {}),
    ...(shape.condition ? { condition: { type: "expression" as const, source: shape.condition.source } } : {}),
    ...(shape.unless ? { unless: { type: "expression" as const, source: shape.unless.source } } : {}),
    loc: command.loc,
    sourceCommand
  };
}

function richTextForCommand(command: CommandIR, commandId: string): RichTextDocumentIR | undefined {
  if (command.richTextPrimary && (commandId === "print" || commandId === "append" || commandId === "choice" || commandId === "toast")) {
    return command.richTextPrimary;
  }
  if (!command.richTextParams) return undefined;
  if (commandId === "print" || commandId === "append" || commandId === "toast") return command.richTextParams.text;
  if (commandId === "choice") return command.richTextParams.choiceSummary ?? command.richTextParams.text;
  return undefined;
}

function richTextDocument(document: RichTextDocumentIR): RichTextDocument {
  return {
    text: document.text,
    runs: document.runs.map((run) => ({ start: run.start, end: run.end, style: { ...run.style } }))
  };
}

function resolveCommandShape(command: CommandIR, definition: NaniCommandDefinition): CommandShape {
  const specsByName = commandParamSpecsByName(definition);
  const shape: CommandShape = {
    params: {},
    flags: {},
    ...(command.condition ? { condition: command.condition } : {}),
    ...(command.unless ? { unless: command.unless } : {})
  };

  if (!command.args || command.args.length === 0) {
    return {
      ...shape,
      ...(command.primary ? { primary: command.primary } : {}),
      params: { ...command.params },
      flags: { ...command.flags }
    };
  }

  for (const arg of command.args) {
    if (arg.kind === "flag") {
      const spec = specsByName.get(normalizeParamName(arg.key));
      shape.flags[spec?.name ?? arg.key] = arg.value;
      continue;
    }

    if (arg.kind === "value") {
      shape.primary ??= arg.value;
      continue;
    }

    const normalizedKey = normalizeParamName(arg.key);
    if (normalizedKey === "if") {
      shape.condition ??= conditionFromArgValue(arg.value);
      continue;
    }
    if (normalizedKey === "unless") {
      shape.unless ??= conditionFromArgValue(arg.value);
      continue;
    }
    const spec = specsByName.get(normalizedKey);
    if (definition.id === "set" && !spec) {
      shape.params[arg.key] = arg.value;
      continue;
    }
    if (spec) {
      shape.params[spec.name] = arg.value;
      continue;
    }

    if (!shape.primary) {
      shape.primary = runtimePrimaryValueFromRawParam(arg.raw);
    } else {
      shape.params[arg.key] = arg.value;
    }
  }

  return shape;
}

function conditionFromArgValue(value: NaniValue): NonNullable<CommandShape["condition"]> {
  if (value.type === "expression") return { source: value.source };
  return { source: String(staticScalarValue(value) ?? "") };
}

function commandParamSpecsByName(definition: NaniCommandDefinition): Map<string, NaniCommandParamSpec> {
  const specs = new Map<string, NaniCommandParamSpec>();
  for (const spec of definition.params) {
    specs.set(normalizeParamName(spec.name), spec);
    for (const alias of spec.aliases ?? []) specs.set(normalizeParamName(alias), spec);
  }
  return specs;
}

function runtimePrimaryValueFromRawParam(raw: string): NaniValue {
  return raw.startsWith("#") ? { type: "raw", value: raw } : raw.includes(",") ? parseRawList(raw) : { type: "string", value: raw };
}

function parseRawList(raw: string): NaniValue {
  return { type: "list", value: raw.split(",").map(runtimePrimaryValueFromRawParam) };
}

function normalizeCommandParams(command: CommandShape, definition: NaniCommandDefinition): NormalizedCommandParams {
  switch (definition.id) {
    case "print":
      return {
        params: compactParams({
          text: runtimeCommandValue(command.primary) ?? runtimeParam(command, "text") ?? "",
          speaker: runtimeParam(command, "speaker") ?? runtimeParam(command, "author") ?? runtimeParam(command, "as"),
          printerId: runtimeParam(command, "printer"),
          speed: runtimeParam(command, "speed"),
          reset: runtimeParam(command, "reset"),
          autoNext: runtimeParam(command, "autoNext") ?? false
        }),
        consumesParams: ["text", "speaker", "author", "as", "printer", "speed", "reset", "autoNext"]
      };
    case "append":
      return {
        params: compactParams({
          text: runtimeCommandValue(command.primary) ?? runtimeParam(command, "text") ?? "",
          speaker: runtimeParam(command, "speaker") ?? runtimeParam(command, "author"),
          printerId: runtimeParam(command, "printer")
        }),
        consumesParams: ["text", "speaker", "author", "printer"]
      };
    case "resettext":
      return {
        params: compactParams({
          printerId: runtimeCommandValue(command.primary) ?? runtimeParam(command, "printerId")
        }),
        consumesParams: ["printerId"]
      };
    case "clearbacklog":
      return { params: {}, consumesParams: [] };
    case "format":
      return {
        params: compactParams({
          templates: runtimeCommandValue(command.primary) ?? runtimeParam(command, "templates"),
          printerId: runtimeParam(command, "printer")
        }),
        consumesParams: ["templates", "printer"]
      };
    case "showprinter":
      return {
        params: compactParams({
          printerId: runtimeCommandValue(command.primary) ?? runtimeParam(command, "printerId") ?? "default",
          durationMs: durationMsValue(runtimeParam(command, "time"))
        }),
        consumesParams: ["printerId", "time"]
      };
    case "showui":
      return {
        params: compactParams({
          target: runtimeCommandValue(command.primary) ?? runtimeParam(command, "uINames") ?? runtimeParam(command, "target"),
          visible: runtimeParam(command, "visible") ?? true,
          durationMs: durationMsValue(runtimeParam(command, "time"))
        }),
        consumesParams: ["uINames", "target", "visible", "time"]
      };
    case "hideui":
      return {
        params: compactParams({
          target: runtimeCommandValue(command.primary) ?? runtimeParam(command, "uINames") ?? runtimeParam(command, "target"),
          visible: false,
          durationMs: durationMsValue(runtimeParam(command, "time"))
        }),
        consumesParams: ["uINames", "target", "time"]
      };
    case "toast":
      return {
        params: compactParams({
          text: runtimeCommandValue(command.primary) ?? runtimeParam(command, "text") ?? "",
          appearance: runtimeParam(command, "appearance"),
          durationMs: durationMsValue(runtimeParam(command, "time"))
        }),
        consumesParams: ["text", "appearance", "time"]
      };
    case "wait":
      return {
        params: compactParams({
          waitMode: runtimeCommandValue(command.primary) ?? runtimeParam(command, "waitMode") ?? "i"
        }),
        consumesParams: ["waitMode"]
      };
    case "input":
      return {
        params: compactParams({
          variableName: runtimeCommandValue(command.primary) ?? runtimeParam(command, "variableName") ?? "",
          valueType: runtimeParam(command, "type") ?? "string",
          summary: runtimeParam(command, "summary"),
          defaultValue: runtimeParam(command, "value")
        }),
        consumesParams: ["variableName", "type", "summary", "value"]
      };
    case "bgm":
      return {
        params: compactParams({
          bgmPath: runtimeCommandValue(command.primary) ?? runtimeParam(command, "bgmPath") ?? "",
          volume: runtimeParam(command, "volume"),
          loop: runtimeParam(command, "loop"),
          fadeMs: durationMsValue(runtimeParam(command, "fade")),
          durationMs: durationMsValue(runtimeParam(command, "time")),
          group: runtimeParam(command, "group")
        }),
        consumesParams: ["bgmPath", "volume", "loop", "fade", "time", "group"]
      };
    case "stopbgm":
      return {
        params: compactParams({
          bgmPath: runtimeCommandValue(command.primary) ?? runtimeParam(command, "bgmPath"),
          fadeMs: durationMsValue(runtimeParam(command, "fade")),
          group: runtimeParam(command, "group")
        }),
        consumesParams: ["bgmPath", "fade", "group"]
      };
    case "sfx":
      return {
        params: compactParams({
          sfxPath: runtimeCommandValue(command.primary) ?? runtimeParam(command, "sfxPath") ?? "",
          volume: runtimeParam(command, "volume"),
          loop: runtimeParam(command, "loop"),
          fadeMs: durationMsValue(runtimeParam(command, "fade")),
          durationMs: durationMsValue(runtimeParam(command, "time")),
          group: runtimeParam(command, "group")
        }),
        consumesParams: ["sfxPath", "volume", "loop", "fade", "time", "group"]
      };
    case "sfxfast":
      return {
        params: compactParams({
          sfxPath: runtimeCommandValue(command.primary) ?? runtimeParam(command, "sfxPath") ?? "",
          volume: runtimeParam(command, "volume"),
          group: runtimeParam(command, "group")
        }),
        consumesParams: ["sfxPath", "volume", "group"]
      };
    case "stopsfx":
      return {
        params: compactParams({
          sfxPath: runtimeCommandValue(command.primary) ?? runtimeParam(command, "sfxPath"),
          fadeMs: durationMsValue(runtimeParam(command, "fade")),
          group: runtimeParam(command, "group")
        }),
        consumesParams: ["sfxPath", "fade", "group"]
      };
    case "movie":
      return {
        params: compactParams({
          moviePath: runtimeCommandValue(command.primary) ?? runtimeParam(command, "moviePath") ?? "",
          durationMs: durationMsValue(runtimeParam(command, "time")),
          block: runtimeParam(command, "block") ?? false
        }),
        consumesParams: ["moviePath", "time", "block"]
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
    case "glitchfilter":
      return normalizeGlitchFilterCommand(command);
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
          durationMs: runtimeParam(command, "duration") ?? 160,
          wait: runtimeParam(command, "wait") ?? false
        }),
        consumesParams: ["color", "duration", "wait"]
      };
    case "focus":
      return {
        params: compactParams({
          target: runtimeCommandValue(command.primary) ?? runtimeParam(command, "target") ?? "stage",
          durationMs: runtimeParam(command, "duration") ?? 500
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
          goto: runtimeParam(command, "goto"),
          id: runtimeParam(command, "id"),
          enabled: runtimeParam(command, "enabled"),
          setExpression: runtimeParam(command, "set")
        }),
        consumesParams: ["goto", "id", "enabled", "set"]
      };
    case "clearchoice":
      return {
        params: compactParams({
          id: runtimeCommandValue(command.primary) ?? runtimeParam(command, "id")
        }),
        consumesParams: ["id"]
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

function normalizeBackCommand(command: CommandShape): NormalizedCommandParams {
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

function normalizeCharCommand(command: CommandShape): NormalizedCommandParams {
  const named = splitNamedAppearanceExpression(runtimeCommandValue(command.primary) ?? runtimeParam(command, "idAndAppearance"));
  return {
    params: compactParams({
      target: runtimeParam(command, "id") ?? named.id,
      appearanceExpression: named.value ?? "",
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

function normalizeArrangeCommand(command: CommandShape): NormalizedCommandParams {
  return {
    params: compactParams({
      characterPositions: runtimeCommandValue(command.primary) ?? runtimeParam(command, "characterPositions"),
      look: runtimeParam(command, "look"),
      ...normalizeTimingParams(command)
    }),
    consumesParams: ["characterPositions", "look", "time", "wait"]
  };
}

function normalizeHideCharsCommand(command: CommandShape): NormalizedCommandParams {
  return {
    params: compactParams(normalizeTimingParams(command)),
    consumesParams: ["time", "lazy", "wait"]
  };
}

function normalizeSlideCommand(command: CommandShape): NormalizedCommandParams {
  const named = splitNamedAppearanceExpression(runtimeCommandValue(command.primary) ?? runtimeParam(command, "idAndAppearance"));
  return {
    params: compactParams({
      target: named.id,
      appearanceExpression: named.value,
      from: scenePositionRuntimeParam(command, "from"),
      to: scenePositionRuntimeParam(command, "to"),
      visible: runtimeParam(command, "visible"),
      ...normalizeTimingParams(command)
    }),
    consumesParams: ["idAndAppearance", "from", "to", "visible", "easing", "time", "lazy", "wait"]
  };
}

function normalizeShakeCommand(command: CommandShape): NormalizedCommandParams {
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

function normalizeBlurCommand(command: CommandShape): NormalizedCommandParams {
  return {
    params: compactParams({
      target: runtimeCommandValue(command.primary) ?? runtimeParam(command, "actorId") ?? "MainBackground",
      power: runtimeParam(command, "power") ?? 0,
      ...normalizeTimingParams(command)
    }),
    consumesParams: ["actorId", "power", "time", "wait"]
  };
}

function normalizeBokehCommand(command: CommandShape): NormalizedCommandParams {
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

function normalizeGlitchCommand(command: CommandShape): NormalizedCommandParams {
  return {
    params: compactParams({
      power: runtimeParam(command, "power") ?? 1,
      blockJump: runtimeParam(command, "blockJump"),
      burstJump: runtimeParam(command, "burstJump"),
      pixelScatter: runtimeParam(command, "pixelScatter"),
      colorNoise: runtimeParam(command, "colorNoise"),
      speed: runtimeParam(command, "speed"),
      seed: runtimeParam(command, "seed"),
      ...normalizeTimingParams(command)
    }),
    consumesParams: ["time", "power", "blockJump", "burstJump", "pixelScatter", "colorNoise", "speed", "seed", "wait"]
  };
}

function normalizeGlitchFilterCommand(command: CommandShape): NormalizedCommandParams {
  return {
    params: compactParams({
      power: runtimeParam(command, "power") ?? 0,
      blockJump: runtimeParam(command, "blockJump"),
      burstJump: runtimeParam(command, "burstJump"),
      pixelScatter: runtimeParam(command, "pixelScatter"),
      colorNoise: runtimeParam(command, "colorNoise"),
      speed: runtimeParam(command, "speed"),
      seed: runtimeParam(command, "seed"),
      ...normalizeTimingParams(command)
    }),
    consumesParams: ["time", "easing", "power", "blockJump", "burstJump", "pixelScatter", "colorNoise", "speed", "seed", "wait"]
  };
}

function normalizeWeatherCommand(command: CommandShape, kind: string): NormalizedCommandParams {
  const snowShaderParams =
    kind === "snow"
      ? {
          density: runtimeParam(command, "density"),
          flakeScale: runtimeParam(command, "flakeScale"),
          sway: runtimeParam(command, "sway"),
          fog: runtimeParam(command, "fog"),
          noise: runtimeParam(command, "noise"),
          seed: runtimeParam(command, "seed")
        }
      : {};
  const snowShaderConsumes = kind === "snow" ? ["density", "flakeScale", "sway", "fog", "noise", "seed"] : [];
  return {
    params: compactParams({
      kind,
      power: runtimeParam(command, "power") ?? 1,
      xSpeed: runtimeParam(command, "xSpeed"),
      ySpeed: runtimeParam(command, "ySpeed"),
      ...snowShaderParams,
      pos: runtimeParam(command, "pos"),
      position: runtimeParam(command, "position"),
      rotation: runtimeParam(command, "rotation"),
      scale: runtimeParam(command, "scale"),
      ...normalizeTimingParams(command)
    }),
    consumesParams: ["power", "time", "xSpeed", "ySpeed", ...snowShaderConsumes, "pos", "position", "rotation", "scale", "wait"]
  };
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

function normalizeTimingParams(command: CommandShape): Record<string, RuntimeValue | undefined> {
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

function splitNamedAppearanceExpression(value: RuntimeValue | undefined): { id?: RuntimeValue; value?: RuntimeValue } {
  if (value === undefined) return {};
  if (Array.isArray(value)) {
    const [first, ...rest] = value;
    if (typeof first !== "string") return { id: value };
    const named = splitNamedString(first);
    if (typeof named.id !== "string") return { id: value };
    if (typeof named.value !== "string") return { id: named.id };
    const expressions = [named.value, ...rest.map(stringRuntimeValue)].filter((item): item is string => Boolean(item));
    return {
      id: named.id,
      value: expressions.join(",")
    };
  }
  return splitNamedString(value);
}

function stringRuntimeValue(value: RuntimeValue): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function scenePositionRuntimeParam(command: CommandShape, key: string): RuntimeValue | undefined {
  const value = runtimeParam(command, key);
  if (value === undefined) return undefined;
  if (typeof value === "number") return [value, 0];
  if (value && !Array.isArray(value) && typeof value === "object" && value.type === "expression") return [value, 0];
  return value;
}

function durationMsValue(value: RuntimeValue | undefined): RuntimeValue | undefined {
  if (typeof value === "number") return Math.max(0, Math.round(value * 1000));
  if (value && !Array.isArray(value) && typeof value === "object" && value.type === "expression") {
    return { type: "expression", source: `(${value.source})*1000` };
  }
  return value;
}

function createGenericParams(command: CommandShape): Record<string, RuntimeValue> {
  const params: Record<string, RuntimeValue> = {};
  if (command.primary) params.primary = runtimeValue(command.primary);
  for (const [key, value] of Object.entries(command.params)) params[key] = runtimeValue(value);
  for (const [key, value] of Object.entries(command.flags)) params[key] = value;
  return params;
}

function validateCommandAgainstCatalog(
  command: CommandShape,
  definition: NaniCommandDefinition
): RuntimeCompilerDiagnostic[] {
  const diagnostics: RuntimeCompilerDiagnostic[] = [];
  const specsByName = commandParamSpecsByName(definition);

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
  command: CommandShape,
  definition: NaniCommandDefinition,
  consumesParams: string[]
): RuntimeCompilerDiagnostic[] {
  if (definition.status !== "implemented") return [];

  const consumed = new Set(consumesParams.map(normalizeParamName));
  const specsByName = commandParamSpecsByName(definition);
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

  for (const key of Object.keys(command.flags)) {
    const spec = specsByName.get(normalizeParamName(key));
    if (!spec || consumed.has(normalizeParamName(key))) continue;
    diagnostics.push(
      createDiagnostic(
        "unsupported-command-param",
        `@${definition.canonicalName} accepts ${key}!:${spec.type}, but the current runtime compiler does not consume it yet.`,
        "warning"
      )
    );
  }

  return diagnostics;
}

function diagnoseExecutionBoundaryParams(
  command: CommandShape,
  definition: NaniCommandDefinition
): RuntimeCompilerDiagnostic[] {
  if (definition.id === "shake" && runtimeParam(command, "loop") === true) {
    return [
      createDiagnostic(
        "unsupported-command-param",
        "@shake loop! is declared by Naninovel, but this Pixi runtime does not implement indefinite loop effects in the main story track; the command is diagnosed instead of approximated.",
        "warning"
      )
    ];
  }
  return [];
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

function getCommandParam(command: CommandShape, key: string): NaniValue | undefined {
  const direct = command.params[key];
  if (direct) return direct;
  const normalized = normalizeParamName(key);
  return Object.entries(command.params).find(([candidate]) => normalizeParamName(candidate) === normalized)?.[1];
}

function runtimeParam(command: CommandShape, key: string): RuntimeValue | undefined {
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
