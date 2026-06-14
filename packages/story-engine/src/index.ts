import type {
  GameplayEvent,
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
  | { type: "gameplay"; event: GameplayEvent };

export interface CommandDefinition {
  id: string;
  aliases?: string[];
  category: "dialog" | "stage" | "audio" | "flow" | "choice" | "state" | "trial";
  execute(ctx: RuntimeCommandContext): CommandResult;
}

export interface CommandRegistry {
  register(definition: CommandDefinition): void;
  resolve(id: string): CommandDefinition | undefined;
}

export function createCommandRegistry(definitions: CommandDefinition[] = []): CommandRegistry {
  const definitionsById = new Map<string, CommandDefinition>();
  const registry: CommandRegistry = {
    register(definition) {
      definitionsById.set(definition.id, definition);
      for (const alias of definition.aliases ?? []) definitionsById.set(alias, definition);
    },
    resolve(id) {
      return definitionsById.get(id);
    }
  };

  for (const definition of [...builtinCommands, ...definitions]) registry.register(definition);
  return registry;
}

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

export function storyReducer(
  state: StoryRuntimeState,
  event: StoryEvent,
  registry = createCommandRegistry()
): StoryRuntimeState {
  if (event.type === "PATCH_VARIABLE") {
    return {
      ...state,
      variables: { ...state.variables, [event.key]: event.value }
    };
  }

  if (event.type === "JUMP") {
    return jumpToLabel(state, event.scenario, event.label);
  }

  if (event.type === "CHOOSE") {
    const choice = state.pendingChoices[event.index];
    if (!choice) return state;
    const cleared = { ...state, pendingChoices: [] };
    return choice.goto ? jumpToLabel(cleared, event.scenario, choice.goto) : cleared;
  }

  if (state.ended || state.pendingChoices.length > 0) return state;

  const statement = event.scenario.statements[state.instructionPointer];
  if (!statement) return { ...state, ended: true };

  return executeStatement({ ...state, instructionPointer: state.instructionPointer + 1 }, event.scenario, statement, registry);
}

function executeStatement(
  state: StoryRuntimeState,
  scenario: ScenarioIR,
  statement: StatementIR,
  registry: CommandRegistry
): StoryRuntimeState {
  if (statement.kind === "comment" || statement.kind === "label") return state;

  if (statement.kind === "text") {
    return executeText(state, statement);
  }

  const definition = registry.resolve(statement.commandId);
  if (!definition) return state;
  const result = definition.execute({ state, scenario, command: statement });
  return applyCommandResult(state, scenario, result);
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
  const value = command.params[key];
  const scalar = scalarValue(value);
  return scalar === undefined ? undefined : String(scalar);
}

function numberParam(command: CommandIR, key: string, fallback: number): number {
  const value = scalarValue(command.params[key]);
  return typeof value === "number" ? value : fallback;
}

const builtinCommands: CommandDefinition[] = [
  {
    id: "end",
    category: "flow",
    execute: () => ({ type: "end" })
  },
  {
    id: "goto",
    category: "flow",
    execute: ({ command }) => ({ type: "jump", label: String(scalarValue(command.primary) ?? "") })
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
    execute: ({ command }) => {
      const event = createGameplayEvent(command);
      return event ? { type: "gameplay", event } : { type: "none" };
    }
  },
  {
    id: "choice",
    category: "choice",
    execute: ({ command }) => ({
      type: "choice",
      choice: createChoice(String(scalarValue(command.primary) ?? "Choice"), stringParam(command, "goto"))
    })
  },
  {
    id: "charenter",
    aliases: ["char-enter"],
    category: "stage",
    execute: ({ command }) => ({
      type: "presentation",
      command: createCharEnterCommand(command)
    })
  },
  {
    id: "back",
    aliases: ["background"],
    category: "stage",
    execute: ({ command }) => ({
      type: "presentation",
      command: createBackgroundCommand(command)
    })
  },
  {
    id: "shake",
    category: "stage",
    execute: ({ command }) => ({
      type: "presentation",
      command: {
        type: "shake",
        target: String(scalarValue(command.primary) ?? stringParam(command, "target") ?? "stage"),
        intensity: numberParam(command, "intensity", 0.35),
        durationMs: numberParam(command, "duration", 280)
      }
    })
  },
  {
    id: "flash",
    category: "stage",
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
    category: "stage",
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
    category: "trial",
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
