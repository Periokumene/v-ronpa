import type {
  RuntimeCommand,
  RuntimeScript,
  RuntimeValue,
  StoryBacklogEntry,
  StoryChoiceOption,
  StoryRuntimeSnapshot,
  StoryScalar
} from "@v-ronpa/contracts";

export type BacklogEntry = StoryBacklogEntry;

export type ChoiceRuntimeOption = StoryChoiceOption;

export type StoryRuntimeState = StoryRuntimeSnapshot;

export type StoryStepperDiagnosticCode =
  | "invalid-choice"
  | "story-ended-noop"
  | "pending-choices"
  | "max-steps"
  | "command-not-implemented"
  | "expression-unresolved";

export interface StoryStepperDiagnostic {
  code: StoryStepperDiagnosticCode;
  message: string;
  severity?: "info" | "warning" | "error";
}

export interface StoryStepperResult {
  state: StoryRuntimeState;
  diagnostics: StoryStepperDiagnostic[];
  emittedRuntimeCommands: RuntimeCommand[];
}

export interface AdvanceToNextStopOptions {
  maxSteps?: number;
}

export interface CurrentStoryLine {
  speaker?: string;
  text: string;
}

export type StoryEvent =
  | { type: "STEP"; script: RuntimeScript }
  | { type: "CHOOSE"; script: RuntimeScript; index: number }
  | { type: "JUMP"; script: RuntimeScript; label: string }
  | { type: "PATCH_VARIABLE"; key: string; value: string | number | boolean };

interface RuntimeCommandExecutionResult {
  state: StoryRuntimeState;
  diagnostics: StoryStepperDiagnostic[];
  emittedRuntimeCommands: RuntimeCommand[];
}

interface RuntimeValueResolution {
  value?: RuntimeValue;
  diagnostic?: StoryStepperDiagnostic;
}

interface RuntimeCommandResolution {
  command?: RuntimeCommand;
  diagnostic?: StoryStepperDiagnostic;
}

const DEFAULT_ADVANCE_MAX_STEPS = 100;
const CONTROL_COMMAND_IDS = new Set(["choice", "end", "goto", "set"]);

export function createInitialStoryState(script: Pick<RuntimeScript, "scriptPath">): StoryRuntimeState {
  return {
    currentScriptPath: script.scriptPath,
    instructionPointer: 0,
    variables: {},
    backlog: [],
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

export function advanceToNextStop(
  state: StoryRuntimeState,
  script: RuntimeScript,
  options: AdvanceToNextStopOptions = {}
): StoryStepperResult {
  if (state.ended) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [createDiagnostic("story-ended-noop", "Story is already ended; advance did not change state.")]
    };
  }

  if (state.pendingChoices.length > 0) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [createDiagnostic("pending-choices", "Story is waiting for a choice; advance did not change state.")]
    };
  }

  const diagnostics: StoryStepperDiagnostic[] = [];
  const emittedRuntimeCommands: RuntimeCommand[] = [];
  const maxSteps = Math.max(0, Math.floor(options.maxSteps ?? DEFAULT_ADVANCE_MAX_STEPS));
  let nextState = state;
  let steps = 0;

  while (steps < maxSteps) {
    if (nextState.ended) return { state: nextState, diagnostics, emittedRuntimeCommands };

    const command = script.commands[nextState.instructionPointer];
    if (!command) return { state: { ...nextState, ended: true }, diagnostics, emittedRuntimeCommands };

    const result = executeCommandAtPointer(nextState, script, command);
    nextState = result.state;
    diagnostics.push(...result.diagnostics);
    emittedRuntimeCommands.push(...result.emittedRuntimeCommands);
    steps += 1;

    if (result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      return { state: nextState, diagnostics, emittedRuntimeCommands };
    }

    if (command.commandId === "print" || nextState.ended) {
      return { state: nextState, diagnostics, emittedRuntimeCommands };
    }

    if (nextState.pendingChoices.length > 0) {
      const nextCommand = script.commands[nextState.instructionPointer];
      if (nextCommand?.category === "choice") continue;
      return { state: nextState, diagnostics, emittedRuntimeCommands };
    }
  }

  return {
    state: nextState,
    emittedRuntimeCommands,
    diagnostics: [
      ...diagnostics,
      createDiagnostic("max-steps", `Advance stopped after reaching the max step limit of ${maxSteps}.`)
    ]
  };
}

export function chooseStoryOption(state: StoryRuntimeState, script: RuntimeScript, index: number): StoryStepperResult {
  const choice = Number.isInteger(index) ? state.pendingChoices[index] : undefined;
  if (!choice) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [createDiagnostic("invalid-choice", `Choice index ${index} is not available.`)]
    };
  }

  const cleared = { ...state, pendingChoices: [] };
  return {
    state: choice.goto ? jumpToLabel(cleared, script, choice.goto) : cleared,
    diagnostics: [],
    emittedRuntimeCommands: []
  };
}

export function selectCurrentStoryLine(state: StoryRuntimeState): CurrentStoryLine | undefined {
  const latest = state.backlog.at(-1);
  if (!latest) return undefined;
  return latest.speaker ? { speaker: latest.speaker, text: latest.text } : { text: latest.text };
}

export function storyReducer(state: StoryRuntimeState, event: StoryEvent): StoryStepperResult {
  if (event.type === "PATCH_VARIABLE") {
    return {
      state: {
        ...state,
        variables: { ...state.variables, [event.key]: event.value }
      },
      diagnostics: [],
      emittedRuntimeCommands: []
    };
  }

  if (event.type === "JUMP") {
    return { state: jumpToLabel(state, event.script, event.label), diagnostics: [], emittedRuntimeCommands: [] };
  }

  if (event.type === "CHOOSE") {
    return chooseStoryOption(state, event.script, event.index);
  }

  if (state.ended) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [createDiagnostic("story-ended-noop", "Story is already ended; advance did not change state.")]
    };
  }

  if (state.pendingChoices.length > 0) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [createDiagnostic("pending-choices", "Story is waiting for a choice; advance did not change state.")]
    };
  }

  const command = event.script.commands[state.instructionPointer];
  if (!command) return { state: { ...state, ended: true }, diagnostics: [], emittedRuntimeCommands: [] };

  return executeCommandAtPointer(state, event.script, command);
}

function executeCommandAtPointer(
  state: StoryRuntimeState,
  script: RuntimeScript,
  command: RuntimeCommand
): RuntimeCommandExecutionResult {
  return executeCommand(state, script, command);
}

function executeCommand(
  state: StoryRuntimeState,
  script: RuntimeScript,
  command: RuntimeCommand
): RuntimeCommandExecutionResult {
  const conditionResult = shouldExecuteCommand(state, command);
  if (conditionResult.diagnostic) {
    return { state, diagnostics: [conditionResult.diagnostic], emittedRuntimeCommands: [] };
  }
  const advancedState = { ...state, instructionPointer: state.instructionPointer + 1 };
  if (!conditionResult.value) {
    return { state: advancedState, diagnostics: [], emittedRuntimeCommands: [] };
  }

  if (command.status !== "implemented") {
    return {
      state: advancedState,
      emittedRuntimeCommands: [],
      diagnostics: [
        createDiagnostic(
          "command-not-implemented",
          `@${command.canonicalName} is declared in commandCatalog but has no runtime handler; treated as no-op.`,
          "warning"
        )
      ]
    };
  }

  const resolved = resolveRuntimeCommand(state, command);
  if (resolved.diagnostic || !resolved.command) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [resolved.diagnostic ?? createExpressionDiagnostic(command, "command params", "Unable to resolve command params.")]
    };
  }

  switch (command.commandId) {
    case "print":
      return { state: executePrint(advancedState, resolved.command), diagnostics: [], emittedRuntimeCommands: [resolved.command] };
    case "choice":
      return { state: executeChoice(advancedState, resolved.command), diagnostics: [], emittedRuntimeCommands: [] };
    case "goto":
      return { state: jumpToLabel(advancedState, script, stringParam(resolved.command, "label") ?? ""), diagnostics: [], emittedRuntimeCommands: [] };
    case "set":
      return { state: executeSet(advancedState, resolved.command), diagnostics: [], emittedRuntimeCommands: [] };
    case "end":
      return { state: { ...advancedState, ended: true }, diagnostics: [], emittedRuntimeCommands: [] };
    default:
      return {
        state: advancedState,
        diagnostics: [],
        emittedRuntimeCommands: CONTROL_COMMAND_IDS.has(command.commandId) ? [] : [resolved.command]
      };
  }
}

function shouldExecuteCommand(state: StoryRuntimeState, command: RuntimeCommand): RuntimeValueResolution {
  if (command.condition) {
    const condition = evaluateRuntimeExpression(command.condition.source, state.variables);
    if (condition.diagnostic) return { diagnostic: createExpressionDiagnostic(command, command.condition.source, condition.diagnostic.message) };
    if (!isTruthy(condition.value)) return { value: false };
  }

  if (command.unless) {
    const unless = evaluateRuntimeExpression(command.unless.source, state.variables);
    if (unless.diagnostic) return { diagnostic: createExpressionDiagnostic(command, command.unless.source, unless.diagnostic.message) };
    if (isTruthy(unless.value)) return { value: false };
  }

  return { value: true };
}

function resolveRuntimeCommand(state: StoryRuntimeState, command: RuntimeCommand): RuntimeCommandResolution {
  const params: Record<string, RuntimeValue> = {};
  for (const [key, value] of Object.entries(command.params)) {
    const resolved = resolveRuntimeValue(value, state.variables, command, key);
    if (resolved.diagnostic) return { diagnostic: resolved.diagnostic };
    if (resolved.value === undefined) return { diagnostic: createExpressionDiagnostic(command, key, "Parameter resolved to undefined.") };
    params[key] = resolved.value;
  }

  return { command: { ...command, params } };
}

function resolveRuntimeValue(
  value: RuntimeValue,
  variables: StoryRuntimeState["variables"],
  command: RuntimeCommand,
  key: string
): RuntimeValueResolution {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return { value };
  if (Array.isArray(value)) {
    const resolvedItems: RuntimeValue[] = [];
    for (const item of value) {
      const resolved = resolveRuntimeValue(item, variables, command, key);
      if (resolved.diagnostic) return { diagnostic: resolved.diagnostic };
      if (resolved.value === undefined) return { diagnostic: createExpressionDiagnostic(command, key, "List item resolved to undefined.") };
      resolvedItems.push(resolved.value);
    }
    return { value: resolvedItems };
  }

  const evaluated = evaluateRuntimeExpression(value.source, variables);
  if (evaluated.diagnostic) {
    return { diagnostic: createExpressionDiagnostic(command, value.source, `Parameter ${key}: ${evaluated.diagnostic.message}`) };
  }
  return evaluated.value === undefined
    ? { diagnostic: createExpressionDiagnostic(command, value.source, `Parameter ${key}: Expression resolved to undefined.`) }
    : { value: evaluated.value };
}

function executePrint(state: StoryRuntimeState, command: RuntimeCommand): StoryRuntimeState {
  const text = stringParam(command, "text") ?? "";
  const speaker = stringParam(command, "speaker");
  const backlogEntry: BacklogEntry = speaker ? { speaker, text } : { text };

  return {
    ...state,
    backlog: [...state.backlog, backlogEntry]
  };
}

function executeChoice(state: StoryRuntimeState, command: RuntimeCommand): StoryRuntimeState {
  const text = stringParam(command, "text") ?? "Choice";
  const goto = stringParam(command, "goto");
  const choice = goto ? { text, goto } : { text };
  return { ...state, pendingChoices: [...state.pendingChoices, choice] };
}

function executeSet(state: StoryRuntimeState, command: RuntimeCommand): StoryRuntimeState {
  const key = stringParam(command, "key") ?? "";
  const value = scalarParam(command, "value");
  return { ...state, variables: { ...state.variables, [key]: value ?? true } };
}

function jumpToLabel(state: StoryRuntimeState, script: RuntimeScript, label: string): StoryRuntimeState {
  const normalized = label.startsWith("#") ? label.slice(1) : label;
  const pointer = script.labels[normalized];
  return pointer === undefined ? state : { ...state, instructionPointer: pointer };
}

function stringParam(command: RuntimeCommand, key: string): string | undefined {
  const value = scalarParam(command, key);
  return value === undefined ? undefined : String(value);
}

function scalarParam(command: RuntimeCommand, key: string): string | number | boolean | undefined {
  const value = command.params[key];
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const items = value.map(runtimeValueScalar);
    return items.some((item) => item === undefined) ? undefined : items.map(String).join(",");
  }
  return undefined;
}

function runtimeValueScalar(value: RuntimeValue): string | number | boolean | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const items = value.map(runtimeValueScalar);
    return items.some((item) => item === undefined) ? undefined : items.map(String).join(",");
  }
  return undefined;
}

interface ExpressionEvaluationResult {
  value?: StoryScalar;
  diagnostic?: { message: string };
}

type ExpressionToken =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: string }
  | { type: "paren"; value: "(" | ")" };

class ExpressionParser {
  private index = 0;

  constructor(
    private readonly tokens: ExpressionToken[],
    private readonly variables: StoryRuntimeState["variables"]
  ) {}

  parse(): StoryScalar {
    const value = this.parseOr();
    if (this.peek()) throw new Error(`Unexpected token ${tokenText(this.peek())}.`);
    return value;
  }

  private parseOr(): StoryScalar {
    let left = this.parseAnd();
    while (this.matchOperator("||")) {
      const right = this.parseAnd();
      left = isTruthy(left) || isTruthy(right);
    }
    return left;
  }

  private parseAnd(): StoryScalar {
    let left = this.parseEquality();
    while (this.matchOperator("&&")) {
      const right = this.parseEquality();
      left = isTruthy(left) && isTruthy(right);
    }
    return left;
  }

  private parseEquality(): StoryScalar {
    let left = this.parseComparison();
    while (true) {
      if (this.matchOperator("==")) {
        left = left === this.parseComparison();
        continue;
      }
      if (this.matchOperator("!=")) {
        left = left !== this.parseComparison();
        continue;
      }
      return left;
    }
  }

  private parseComparison(): StoryScalar {
    let left = this.parseTerm();
    while (true) {
      if (this.matchOperator(">=")) {
        left = numericValue(left) >= numericValue(this.parseTerm());
        continue;
      }
      if (this.matchOperator("<=")) {
        left = numericValue(left) <= numericValue(this.parseTerm());
        continue;
      }
      if (this.matchOperator(">")) {
        left = numericValue(left) > numericValue(this.parseTerm());
        continue;
      }
      if (this.matchOperator("<")) {
        left = numericValue(left) < numericValue(this.parseTerm());
        continue;
      }
      return left;
    }
  }

  private parseTerm(): StoryScalar {
    let left = this.parseFactor();
    while (true) {
      if (this.matchOperator("+")) {
        const right = this.parseFactor();
        left = typeof left === "string" || typeof right === "string" ? `${left}${right}` : numericValue(left) + numericValue(right);
        continue;
      }
      if (this.matchOperator("-")) {
        left = numericValue(left) - numericValue(this.parseFactor());
        continue;
      }
      return left;
    }
  }

  private parseFactor(): StoryScalar {
    let left = this.parseUnary();
    while (true) {
      if (this.matchOperator("*")) {
        left = numericValue(left) * numericValue(this.parseUnary());
        continue;
      }
      if (this.matchOperator("/")) {
        left = numericValue(left) / numericValue(this.parseUnary());
        continue;
      }
      if (this.matchOperator("%")) {
        left = numericValue(left) % numericValue(this.parseUnary());
        continue;
      }
      return left;
    }
  }

  private parseUnary(): StoryScalar {
    if (this.matchOperator("!")) return !isTruthy(this.parseUnary());
    if (this.matchOperator("-")) return -numericValue(this.parseUnary());
    return this.parsePrimary();
  }

  private parsePrimary(): StoryScalar {
    const token = this.advance();
    if (!token) throw new Error("Expected expression value.");
    if (token.type === "number" || token.type === "string" || token.type === "boolean") return token.value;
    if (token.type === "identifier") {
      const value = this.variables[token.value];
      if (value === undefined) throw new Error(`Unknown variable ${token.value}.`);
      return value;
    }
    if (token.type === "paren" && token.value === "(") {
      const value = this.parseOr();
      if (!this.matchParen(")")) throw new Error("Expected closing parenthesis.");
      return value;
    }
    throw new Error(`Unexpected token ${tokenText(token)}.`);
  }

  private matchOperator(value: string): boolean {
    const token = this.peek();
    if (token?.type !== "operator" || token.value !== value) return false;
    this.index += 1;
    return true;
  }

  private matchParen(value: "(" | ")"): boolean {
    const token = this.peek();
    if (token?.type !== "paren" || token.value !== value) return false;
    this.index += 1;
    return true;
  }

  private advance(): ExpressionToken | undefined {
    const token = this.peek();
    if (token) this.index += 1;
    return token;
  }

  private peek(): ExpressionToken | undefined {
    return this.tokens[this.index];
  }
}

function evaluateRuntimeExpression(source: string, variables: StoryRuntimeState["variables"]): ExpressionEvaluationResult {
  try {
    const tokens = tokenizeExpression(source);
    if (tokens.length === 0) return { diagnostic: { message: "Expression is empty." } };
    return { value: new ExpressionParser(tokens, variables).parse() };
  } catch (error) {
    return { diagnostic: { message: error instanceof Error ? error.message : "Expression could not be evaluated." } };
  }
}

function tokenizeExpression(source: string): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index] ?? "";
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      let value = "";
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\" && index + 1 < source.length) {
          value += source[index + 1] ?? "";
          index += 2;
          continue;
        }
        value += source[index] ?? "";
        index += 1;
      }
      if (source[index] !== quote) throw new Error("Unterminated string literal.");
      index += 1;
      tokens.push({ type: "string", value });
      continue;
    }

    const twoChar = source.slice(index, index + 2);
    if (["&&", "||", "==", "!=", ">=", "<="].includes(twoChar)) {
      tokens.push({ type: "operator", value: twoChar });
      index += 2;
      continue;
    }

    if (["+", "-", "*", "/", "%", "!", ">", "<"].includes(char)) {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      index += 1;
      continue;
    }

    if (/\d/.test(char)) {
      let raw = char;
      index += 1;
      while (index < source.length && /[\d.]/.test(source[index] ?? "")) {
        raw += source[index] ?? "";
        index += 1;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number ${raw}.`);
      tokens.push({ type: "number", value });
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      let value = char;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index] ?? "")) {
        value += source[index] ?? "";
        index += 1;
      }
      if (value === "true" || value === "false") {
        tokens.push({ type: "boolean", value: value === "true" });
      } else {
        tokens.push({ type: "identifier", value });
      }
      continue;
    }

    throw new Error(`Unexpected character ${char}.`);
  }

  return tokens;
}

function numericValue(value: StoryScalar): number {
  if (typeof value !== "number") throw new Error(`Expected number, received ${typeof value}.`);
  return value;
}

function isTruthy(value: StoryScalar | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value.length > 0;
}

function tokenText(token: ExpressionToken | undefined): string {
  if (!token) return "end of expression";
  if (token.type === "paren") return token.value;
  return String(token.value);
}

function createExpressionDiagnostic(command: RuntimeCommand, source: string, message: string): StoryStepperDiagnostic {
  return createDiagnostic(
    "expression-unresolved",
    `@${command.canonicalName} expression ${source} could not be resolved: ${message}`,
    "error"
  );
}

function createDiagnostic(
  code: StoryStepperDiagnosticCode,
  message: string,
  severity?: StoryStepperDiagnostic["severity"]
): StoryStepperDiagnostic {
  return severity ? { code, message, severity } : { code, message };
}
