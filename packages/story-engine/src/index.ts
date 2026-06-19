import { getNaniCommandDefinition } from "@v-ronpa/contracts";
import type {
  GameplayEvent,
  NaniCommandCategory,
  NaniCommandDefinition,
  NaniWildcardType,
  PresentationCommand,
  StoryBacklogEntry,
  StoryChoiceOption,
  StoryEffect,
  StoryRuntimeSnapshot
} from "@v-ronpa/contracts";
import type { CommandIR, NaniValue, ScenarioIR, StatementIR, TextIR } from "@v-ronpa/nani-parser";

export type BacklogEntry = StoryBacklogEntry;

export type ChoiceRuntimeOption = StoryChoiceOption;

export interface StoryRuntimeState extends StoryRuntimeSnapshot {
  presentationCommands: PresentationCommand[];
  effects: StoryEffect[];
}

export type StoryStepperDiagnosticCode =
  | "invalid-choice"
  | "story-ended-noop"
  | "pending-choices"
  | "max-steps"
  | "unknown-command"
  | "invalid-command-param"
  | "command-not-implemented"
  | "unsupported-command-param";

export interface StoryStepperDiagnostic {
  code: StoryStepperDiagnosticCode;
  message: string;
  severity?: "info" | "warning" | "error";
}

export interface StoryStepperResult {
  state: StoryRuntimeState;
  diagnostics: StoryStepperDiagnostic[];
}

export interface AdvanceToNextStopOptions {
  maxSteps?: number;
  registry?: NaniCommandHandlerRegistry;
}

export interface CurrentStoryLine {
  speaker?: string;
  text: string;
}

export type StoryEvent =
  | { type: "STEP"; scenario: ScenarioIR }
  | { type: "CHOOSE"; scenario: ScenarioIR; index: number }
  | { type: "JUMP"; scenario: ScenarioIR; label: string }
  | { type: "PATCH_VARIABLE"; key: string; value: string | number | boolean };

export interface RuntimeCommandContext {
  state: StoryRuntimeState;
  scenario: ScenarioIR;
  command: CommandIR;
}

export type CommandResult =
  | { type: "none" }
  | { type: "jump"; label: string }
  | { type: "end" }
  | { type: "presentation"; command: PresentationCommand }
  | { type: "choice"; choice: ChoiceRuntimeOption }
  | { type: "set"; key: string; value: string | number | boolean }
  | { type: "gameplay"; event: GameplayEvent }
  | { type: "effect"; effect: StoryEffect };

export interface NaniCommandHandler {
  id: string;
  aliases?: string[];
  category: NaniCommandCategory;
  consumesParams?: string[];
  execute(ctx: RuntimeCommandContext): CommandResult;
}

export interface NaniCommandHandlerRegistry {
  register(handler: NaniCommandHandler): void;
  resolve(id: string): NaniCommandHandler | undefined;
}

export type CommandDefinition = NaniCommandHandler;
export type CommandRegistry = NaniCommandHandlerRegistry;

export function createNaniCommandHandlerRegistry(handlers: NaniCommandHandler[] = []): NaniCommandHandlerRegistry {
  const handlersById = new Map<string, NaniCommandHandler>();
  const registry: NaniCommandHandlerRegistry = {
    register(handler) {
      assertHandlerDeclaredInCatalog(handler);
      const definition = getNaniCommandDefinition(handler.id);
      handlersById.set(definition?.id ?? handler.id, handler);
      for (const alias of handler.aliases ?? []) handlersById.set(alias.trim().toLowerCase(), handler);
    },
    resolve(id) {
      return handlersById.get(id.trim().toLowerCase());
    }
  };

  for (const handler of [...builtinCommands, ...handlers]) registry.register(handler);
  return registry;
}

export const createCommandRegistry = createNaniCommandHandlerRegistry;

export function createInitialStoryState(scenario: ScenarioIR): StoryRuntimeState {
  return {
    currentScriptPath: scenario.scriptPath,
    instructionPointer: 0,
    variables: {},
    backlog: [],
    presentationCommands: [],
    effects: [],
    pendingChoices: [],
    ended: false
  };
}

export function storyRuntimeSnapshot(state: StoryRuntimeState): StoryRuntimeSnapshot {
  return {
    currentScriptPath: state.currentScriptPath,
    instructionPointer: state.instructionPointer,
    variables: { ...state.variables },
    backlog: [...state.backlog],
    pendingChoices: [...state.pendingChoices],
    ended: state.ended
  };
}

const DEFAULT_ADVANCE_MAX_STEPS = 100;

export function advanceToNextStop(
  state: StoryRuntimeState,
  scenario: ScenarioIR,
  options: AdvanceToNextStopOptions = {}
): StoryStepperResult {
  if (state.ended) {
    return {
      state,
      diagnostics: [createDiagnostic("story-ended-noop", "Story is already ended; advance did not change state.")]
    };
  }

  if (state.pendingChoices.length > 0) {
    return {
      state,
      diagnostics: [createDiagnostic("pending-choices", "Story is waiting for a choice; advance did not change state.")]
    };
  }

  const diagnostics: StoryStepperDiagnostic[] = [];
  const registry = options.registry ?? createNaniCommandHandlerRegistry();
  const maxSteps = Math.max(0, Math.floor(options.maxSteps ?? DEFAULT_ADVANCE_MAX_STEPS));
  let nextState = state;
  let steps = 0;

  while (steps < maxSteps) {
    if (nextState.ended) return { state: nextState, diagnostics };

    const statement = scenario.statements[nextState.instructionPointer];
    if (!statement) return { state: { ...nextState, ended: true }, diagnostics };

    nextState = executeStatementAtPointer(nextState, scenario, statement, registry, diagnostics);
    steps += 1;

    if (statement.kind === "text" || nextState.ended) return { state: nextState, diagnostics };

    if (nextState.pendingChoices.length > 0) {
      const nextStatement = scenario.statements[nextState.instructionPointer];
      if (nextStatement && isChoiceStatement(nextStatement, registry)) continue;
      return { state: nextState, diagnostics };
    }
  }

  return {
    state: nextState,
    diagnostics: [
      ...diagnostics,
      createDiagnostic("max-steps", `Advance stopped after reaching the max step limit of ${maxSteps}.`)
    ]
  };
}

export function chooseStoryOption(state: StoryRuntimeState, scenario: ScenarioIR, index: number): StoryStepperResult {
  const choice = Number.isInteger(index) ? state.pendingChoices[index] : undefined;
  if (!choice) {
    return {
      state,
      diagnostics: [createDiagnostic("invalid-choice", `Choice index ${index} is not available.`)]
    };
  }

  const cleared = { ...state, pendingChoices: [] };
  return {
    state: choice.goto ? jumpToLabel(cleared, scenario, choice.goto) : cleared,
    diagnostics: []
  };
}

export function selectCurrentStoryLine(state: StoryRuntimeState): CurrentStoryLine | undefined {
  const latest = state.backlog.at(-1);
  if (!latest) return undefined;
  return latest.speaker ? { speaker: latest.speaker, text: latest.text } : { text: latest.text };
}

export function storyReducer(
  state: StoryRuntimeState,
  event: StoryEvent,
  registry = createNaniCommandHandlerRegistry()
): StoryStepperResult {
  if (event.type === "PATCH_VARIABLE") {
    return {
      state: {
        ...state,
        variables: { ...state.variables, [event.key]: event.value }
      },
      diagnostics: []
    };
  }

  if (event.type === "JUMP") {
    return { state: jumpToLabel(state, event.scenario, event.label), diagnostics: [] };
  }

  if (event.type === "CHOOSE") {
    const choice = state.pendingChoices[event.index];
    if (!choice) {
      return {
        state,
        diagnostics: [createDiagnostic("invalid-choice", `Choice index ${event.index} is not available.`)]
      };
    }
    const cleared = { ...state, pendingChoices: [] };
    return { state: choice.goto ? jumpToLabel(cleared, event.scenario, choice.goto) : cleared, diagnostics: [] };
  }

  if (state.ended) {
    return {
      state,
      diagnostics: [createDiagnostic("story-ended-noop", "Story is already ended; advance did not change state.")]
    };
  }

  if (state.pendingChoices.length > 0) {
    return {
      state,
      diagnostics: [createDiagnostic("pending-choices", "Story is waiting for a choice; advance did not change state.")]
    };
  }

  const statement = event.scenario.statements[state.instructionPointer];
  if (!statement) return { state: { ...state, ended: true }, diagnostics: [] };

  const diagnostics: StoryStepperDiagnostic[] = [];
  return { state: executeStatementAtPointer(state, event.scenario, statement, registry, diagnostics), diagnostics };
}

function createDiagnostic(
  code: StoryStepperDiagnosticCode,
  message: string,
  severity?: StoryStepperDiagnostic["severity"]
): StoryStepperDiagnostic {
  return severity ? { code, message, severity } : { code, message };
}

function executeStatementAtPointer(
  state: StoryRuntimeState,
  scenario: ScenarioIR,
  statement: StatementIR,
  registry: NaniCommandHandlerRegistry,
  diagnostics?: StoryStepperDiagnostic[]
): StoryRuntimeState {
  const result = executeStatement({ ...state, instructionPointer: state.instructionPointer + 1 }, scenario, statement, registry);
  diagnostics?.push(...result.diagnostics);
  return result.state;
}

function isChoiceStatement(statement: StatementIR, registry: NaniCommandHandlerRegistry): boolean {
  return statement.kind === "command" && registry.resolve(statement.commandId)?.category === "choice";
}

interface StatementExecutionResult {
  state: StoryRuntimeState;
  diagnostics: StoryStepperDiagnostic[];
}

function executeStatement(
  state: StoryRuntimeState,
  scenario: ScenarioIR,
  statement: StatementIR,
  registry: NaniCommandHandlerRegistry
): StatementExecutionResult {
  if (statement.kind === "comment" || statement.kind === "label") return { state, diagnostics: [] };

  if (statement.kind === "text") {
    return { state: executeText(state, statement), diagnostics: [] };
  }

  const catalogDefinition = getNaniCommandDefinition(statement.commandId);
  if (!catalogDefinition) {
    return {
      state,
      diagnostics: [
        createDiagnostic("unknown-command", `Unknown .nani command: @${statement.commandId}.`, "warning")
      ]
    };
  }

  const diagnostics = validateCommandAgainstCatalog(statement, catalogDefinition);
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { state, diagnostics };
  }

  if (catalogDefinition.source === "wildcard") {
    const effect = createWildcardStoryEffect(statement, catalogDefinition);
    if (!effect) {
      return {
        state,
        diagnostics: [
          ...diagnostics,
          createDiagnostic("invalid-command-param", `@${statement.commandId} requires routeKey:string.`, "error")
        ]
      };
    }
    return {
      state: applyCommandResult(state, scenario, { type: "effect", effect }),
      diagnostics
    };
  }

  const handler = registry.resolve(statement.commandId);
  if (!handler) {
    return {
      state,
      diagnostics: [
        ...diagnostics,
        createDiagnostic(
          "command-not-implemented",
          `@${catalogDefinition.canonicalName} is declared in commandCatalog but has no runtime handler; treated as no-op.`,
          "warning"
        )
      ]
    };
  }

  diagnostics.push(...diagnoseUnsupportedImplementedParams(statement, catalogDefinition, handler));
  const result = handler.execute({ state, scenario, command: statement });
  return { state: applyCommandResult(state, scenario, result), diagnostics };
}

function executeText(state: StoryRuntimeState, statement: TextIR): StoryRuntimeState {
  const text = statement.tokens.filter((token) => token.kind === "text").map((token) => token.text).join("");
  const autoNext = statement.tokens.some((token) => token.kind === "inline-command" && token.command.commandId === ">");
  const command: PresentationCommand = {
    type: "print",
    text,
    autoNext
  };
  if (statement.speaker) command.speaker = statement.speaker;
  const backlogEntry: BacklogEntry = { text };
  if (statement.speaker) backlogEntry.speaker = statement.speaker;

  return {
    ...state,
    backlog: [...state.backlog, backlogEntry],
    presentationCommands: [...state.presentationCommands, command],
    effects: [...state.effects, { type: "presentation", command }]
  };
}

function applyCommandResult(state: StoryRuntimeState, scenario: ScenarioIR, result: CommandResult): StoryRuntimeState {
  switch (result.type) {
    case "none":
      return state;
    case "jump":
      return jumpToLabel(state, scenario, result.label);
    case "end":
      return { ...state, ended: true };
    case "presentation":
      return {
        ...state,
        presentationCommands: [...state.presentationCommands, result.command],
        effects: [...state.effects, { type: "presentation", command: result.command }]
      };
    case "choice":
      return { ...state, pendingChoices: [...state.pendingChoices, result.choice] };
    case "set":
      return { ...state, variables: { ...state.variables, [result.key]: result.value } };
    case "gameplay":
      return {
        ...state,
        effects: [...state.effects, { type: "gameplay-event", event: result.event }]
      };
    case "effect":
      return {
        ...state,
        effects: [...state.effects, result.effect]
      };
  }
}

function assertHandlerDeclaredInCatalog(handler: NaniCommandHandler): void {
  const definition = getNaniCommandDefinition(handler.id);
  if (!definition) {
    throw new Error(`Cannot register @${handler.id}; it is not declared in commandCatalog.`);
  }
  for (const alias of handler.aliases ?? []) {
    const aliasDefinition = getNaniCommandDefinition(alias);
    if (!aliasDefinition || aliasDefinition.id !== definition.id) {
      throw new Error(`Cannot register alias @${alias} for @${handler.id}; the alias is not declared in commandCatalog.`);
    }
  }
}

function validateCommandAgainstCatalog(command: CommandIR, definition: NaniCommandDefinition): StoryStepperDiagnostic[] {
  const diagnostics: StoryStepperDiagnostic[] = [];
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
      if (definition.source !== "wildcard" && !allowsDynamicAssignmentParam(definition)) {
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
    if (!spec && definition.source !== "wildcard") {
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

function allowsDynamicAssignmentParam(definition: NaniCommandDefinition): boolean {
  return definition.id === "set";
}

function diagnoseUnsupportedImplementedParams(
  command: CommandIR,
  definition: NaniCommandDefinition,
  handler: NaniCommandHandler
): StoryStepperDiagnostic[] {
  const consumed = new Set((handler.consumesParams ?? []).map(normalizeParamName));
  const specsByName = new Map(definition.params.map((spec) => [normalizeParamName(spec.name), spec]));
  const diagnostics: StoryStepperDiagnostic[] = [];

  for (const [key, value] of Object.entries(command.params)) {
    const spec = specsByName.get(normalizeParamName(key));
    if (!spec || !isCompatibleCommandValue(value, spec.type) || consumed.has(normalizeParamName(key))) continue;
    diagnostics.push(
      createDiagnostic(
        "unsupported-command-param",
        `@${definition.canonicalName} accepts ${key}:${spec.type}, but the current runtime handler does not consume it yet.`,
        "warning"
      )
    );
  }

  return diagnostics;
}

function createWildcardStoryEffect(command: CommandIR, definition: NaniCommandDefinition): StoryEffect | undefined {
  const routeKey = stringParam(command, "routeKey");
  if (!routeKey) return undefined;
  const wildcardType = definition.id.slice("wildcard-".length) as NaniWildcardType;
  const params = Object.fromEntries(
    Object.entries(command.params)
      .filter(([key]) => normalizeParamName(key) !== "routekey")
      .map(([key, value]) => [key, plainCommandValue(value)])
  );

  return {
    type: "wildcard-event",
    wildcardType,
    routeKey,
    params,
    sourceCommand: {
      commandId: command.commandId,
      canonicalName: definition.canonicalName,
      loc: command.loc
    }
  };
}

function normalizeParamName(name: string): string {
  return name.toLowerCase();
}

function isCompatibleCommandValue(value: NaniValue, officialType: string): boolean {
  const normalized = officialType.toLowerCase();
  if (normalized === "generic params") return true;
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

function jumpToLabel(state: StoryRuntimeState, scenario: ScenarioIR, label: string): StoryRuntimeState {
  const normalized = label.startsWith("#") ? label.slice(1) : label;
  const pointer = scenario.labels[normalized];
  return pointer === undefined ? state : { ...state, instructionPointer: pointer + 1 };
}

function scalarValue(value: NaniValue | undefined): string | number | boolean | undefined {
  if (!value) return undefined;
  if (value.type === "string" || value.type === "number" || value.type === "boolean") return value.value;
  if (value.type === "raw") return value.value;
  if (value.type === "expression") return value.source;
  return value.value.map((item) => String(scalarValue(item))).join(",");
}

function stringParam(command: CommandIR, key: string): string | undefined {
  const value = getCommandParam(command, key);
  const scalar = scalarValue(value);
  return scalar === undefined ? undefined : String(scalar);
}

function numberParam(command: CommandIR, key: string, fallback: number): number {
  const value = scalarValue(getCommandParam(command, key));
  return typeof value === "number" ? value : fallback;
}

function getCommandParam(command: CommandIR, key: string): NaniValue | undefined {
  const direct = command.params[key];
  if (direct) return direct;
  const normalized = normalizeParamName(key);
  return Object.entries(command.params).find(([candidate]) => normalizeParamName(candidate) === normalized)?.[1];
}

const builtinCommands: NaniCommandHandler[] = [
  {
    id: "end",
    category: "flow",
    execute: () => ({ type: "end" })
  },
  {
    id: "goto",
    category: "flow",
    consumesParams: ["path"],
    execute: ({ command }) => ({ type: "jump", label: String(scalarValue(command.primary) ?? stringParam(command, "path") ?? "") })
  },
  {
    id: "set",
    category: "state",
    execute: ({ command }) => {
      const key = command.primary ? String(scalarValue(command.primary)) : Object.keys(command.params)[0] ?? "";
      const value = command.params[key] ?? command.primary;
      return { type: "set", key, value: scalarValue(value) ?? true };
    }
  },
  {
    id: "gameplay",
    aliases: ["gameplay-event"],
    category: "state",
    consumesParams: ["type", "quantity", "item", "itemId", "id", "evidence", "evidenceId", "character", "characterId", "status", "skill", "skillId", "delta", "affinityDelta"],
    execute: ({ command }) => {
      const event = createGameplayEvent(command);
      return event ? { type: "gameplay", event } : { type: "none" };
    }
  },
  {
    id: "choice",
    category: "choice",
    consumesParams: ["goto"],
    execute: ({ command }) => ({
      type: "choice",
      choice: createChoice(String(scalarValue(command.primary) ?? "Choice"), stringParam(command, "goto"))
    })
  },
  {
    id: "charenter",
    aliases: ["char-enter"],
    category: "actor",
    consumesParams: ["portrait", "slot", "effect"],
    execute: ({ command }) => ({
      type: "presentation",
      command: createCharEnterCommand(command)
    })
  },
  {
    id: "back",
    category: "scene",
    consumesParams: ["id", "effect"],
    execute: ({ command }) => ({
      type: "presentation",
      command: createBackgroundCommand(command)
    })
  },
  {
    id: "shake",
    category: "effect",
    consumesParams: ["target", "actorId", "intensity", "duration"],
    execute: ({ command }) => ({
      type: "presentation",
      command: {
        type: "shake",
        target: String(scalarValue(command.primary) ?? stringParam(command, "actorId") ?? stringParam(command, "target") ?? "stage"),
        intensity: numberParam(command, "intensity", 0.35),
        durationMs: numberParam(command, "duration", 280)
      }
    })
  },
  {
    id: "flash",
    category: "effect",
    consumesParams: ["color", "duration"],
    execute: ({ command }) => ({
      type: "presentation",
      command: {
        type: "flash",
        color: stringParam(command, "color") ?? "#ffffff",
        durationMs: numberParam(command, "duration", 160)
      }
    })
  },
  {
    id: "focus",
    category: "effect",
    consumesParams: ["target", "duration"],
    execute: ({ command }) => ({
      type: "presentation",
      command: {
        type: "focus",
        target: String(scalarValue(command.primary) ?? stringParam(command, "target") ?? "stage"),
        durationMs: numberParam(command, "duration", 500)
      }
    })
  },
  {
    id: "trialkeyword",
    aliases: ["trial-keyword"],
    category: "ui",
    consumesParams: ["id", "text", "speaker", "evidence", "evidenceId"],
    execute: ({ command }) => ({
      type: "presentation",
      command: createTrialKeywordCommand(command)
    })
  }
];

function createChoice(text: string, goto: string | undefined): ChoiceRuntimeOption {
  return goto ? { text, goto } : { text };
}

function createCharEnterCommand(command: CommandIR): PresentationCommand {
  const stageCommand: PresentationCommand = {
    type: "char-enter",
    characterId: String(scalarValue(command.primary) ?? stringParam(command, "character") ?? "character:unknown"),
    slot: (stringParam(command, "slot") as "left" | "center" | "right" | undefined) ?? "center",
    effect: stringParam(command, "effect") ?? "fadeIn"
  };
  const portraitId = stringParam(command, "portrait");
  if (portraitId) stageCommand.portraitId = portraitId;
  return stageCommand;
}

function createBackgroundCommand(command: CommandIR): PresentationCommand {
  const stageCommand: PresentationCommand = {
    type: "set-background",
    backgroundId: String(scalarValue(command.primary) ?? stringParam(command, "id") ?? "bg:unknown")
  };
  const effect = stringParam(command, "effect");
  if (effect) stageCommand.effect = effect;
  return stageCommand;
}

function createTrialKeywordCommand(command: CommandIR): PresentationCommand {
  const stageCommand: PresentationCommand = {
    type: "trial-keyword",
    keywordId: String(scalarValue(command.primary) ?? stringParam(command, "id") ?? "kw:unknown"),
    text: stringParam(command, "text") ?? "keyword"
  };
  const evidenceId = stringParam(command, "evidence") ?? stringParam(command, "evidenceId");
  if (evidenceId) stageCommand.evidenceId = evidenceId;
  const speakerId = stringParam(command, "speaker");
  if (speakerId) stageCommand.speakerId = speakerId;
  return stageCommand;
}

function createGameplayEvent(command: CommandIR): GameplayEvent | undefined {
  const type = String(scalarValue(command.primary) ?? stringParam(command, "type") ?? "");
  const quantity = numberParam(command, "quantity", 1);
  const itemId = stringParam(command, "item") ?? stringParam(command, "itemId") ?? stringParam(command, "id");
  const evidenceId = stringParam(command, "evidence") ?? stringParam(command, "evidenceId") ?? stringParam(command, "id");
  const characterId = stringParam(command, "character") ?? stringParam(command, "characterId");
  const status = stringParam(command, "status");
  const skillId = stringParam(command, "skill") ?? stringParam(command, "skillId");

  if (type === "grant-item" && itemId) return { type, itemId, quantity };
  if (type === "remove-item" && itemId) return { type, itemId, quantity };
  if (type === "consume-item" && itemId) return { type, itemId, quantity };
  if (type === "grant-evidence" && evidenceId) return { type, evidenceId };
  if (type === "remove-evidence" && evidenceId) return { type, evidenceId };
  if (type === "change-character-affinity" && characterId) {
    return { type, characterId, affinityDelta: numberParam(command, "delta", numberParam(command, "affinityDelta", 0)) };
  }
  if (type === "add-character-status" && characterId && status) return { type, characterId, status };
  if (type === "remove-character-status" && characterId && status) return { type, characterId, status };
  if (type === "unlock-character-skill" && characterId && skillId) return { type, characterId, skillId };
  return undefined;
}
