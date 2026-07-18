import type {
  RuntimeUiGroup,
  RuntimeCommand,
  RuntimeScript,
  RuntimeValue,
  RichTextDocument,
  StoryBacklogEntry,
  StoryChoiceOption,
  StoryRuntimeSnapshot,
  StoryScalar
} from "@v-ronpa/contracts";
import { RUNTIME_UI_GROUPS } from "@v-ronpa/contracts";

export type BacklogEntry = StoryBacklogEntry;

export type ChoiceRuntimeOption = StoryChoiceOption;

export type StoryRuntimeState = StoryRuntimeSnapshot;

export type StoryStopReason = "text" | "choices" | "ended" | "presentation-wait" | "runtime-wait" | "max-steps";

export type StoryStepperDiagnosticCode =
  | "invalid-choice"
  | "story-ended-noop"
  | "pending-choices"
  | "presentation-wait"
  | "runtime-wait"
  | "invalid-runtime-wait-completion"
  | "input-validation"
  | "invalid-goto"
  | "unsupported-command-param"
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
  stopReason?: StoryStopReason;
}

export interface AdvanceToNextStopOptions {
  maxSteps?: number;
}

export interface CurrentStoryLine {
  speaker?: string;
  text: string;
  richText?: RichTextDocument;
}

export type StoryEvent =
  | { type: "STEP"; script: RuntimeScript }
  | { type: "PRESENTATION_COMPLETE"; script: RuntimeScript }
  | { type: "RUNTIME_WAIT_COMPLETE"; script: RuntimeScript; kind: "pause" | "movie" }
  | { type: "SUBMIT_INPUT"; script: RuntimeScript; value: string | number | boolean }
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
const RUNTIME_UI_GROUP_SET = new Set<string>(RUNTIME_UI_GROUPS);
const CONTROL_COMMAND_IDS = new Set([
  "append",
  "choice",
  "clearbacklog",
  "clearchoice",
  "end",
  "goto",
  "input",
  "resettext",
  "set",
  "showprinter",
  "wait"
]);

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
    ...(state.presentationWait ? { presentationWait: state.presentationWait } : {}),
    ...(state.runtimeWait ? { runtimeWait: state.runtimeWait } : {}),
    ...(state.text ? { text: cloneTextState(state.text) } : {}),
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
      diagnostics: [createDiagnostic("story-ended-noop", "Story is already ended; advance did not change state.")],
      stopReason: "ended"
    };
  }

  if (state.presentationWait) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [
        createDiagnostic("presentation-wait", "Story is waiting for a presentation command to complete; advance did not change state.")
      ],
      stopReason: "presentation-wait"
    };
  }

  if (state.runtimeWait) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [
        createDiagnostic("runtime-wait", "Story is waiting for a runtime command to complete; advance did not change state.")
      ],
      stopReason: "runtime-wait"
    };
  }

  if (state.pendingChoices.length > 0 && !canContinueChoiceGroup(state, script)) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [createDiagnostic("pending-choices", "Story is waiting for a choice; advance did not change state.")],
      stopReason: "choices"
    };
  }

  const diagnostics: StoryStepperDiagnostic[] = [];
  const emittedRuntimeCommands: RuntimeCommand[] = [];
  const maxSteps = Math.max(0, Math.floor(options.maxSteps ?? DEFAULT_ADVANCE_MAX_STEPS));
  let nextState = state;
  let steps = 0;

  while (steps < maxSteps) {
    if (nextState.ended) return { state: nextState, diagnostics, emittedRuntimeCommands, stopReason: "ended" };

    const command = script.commands[nextState.instructionPointer];
    if (!command) return { state: { ...nextState, ended: true }, diagnostics, emittedRuntimeCommands, stopReason: "ended" };

    const result = stepStoryInstruction(nextState, script);
    nextState = result.state;
    diagnostics.push(...result.diagnostics);
    emittedRuntimeCommands.push(...result.emittedRuntimeCommands);
    steps += 1;

    if (result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      return { state: nextState, diagnostics, emittedRuntimeCommands };
    }

    if (nextState.presentationWait) {
      return { state: nextState, diagnostics, emittedRuntimeCommands, stopReason: "presentation-wait" };
    }

    if (nextState.runtimeWait) {
      return { state: nextState, diagnostics, emittedRuntimeCommands, stopReason: "runtime-wait" };
    }

    if (command.commandId === "print" || nextState.ended) {
      return { state: nextState, diagnostics, emittedRuntimeCommands, stopReason: nextState.ended ? "ended" : "text" };
    }

    if (nextState.pendingChoices.length > 0) {
      if (canContinueChoiceGroup(nextState, script)) continue;
      return { state: nextState, diagnostics, emittedRuntimeCommands, stopReason: "choices" };
    }
  }

  return {
    state: nextState,
    emittedRuntimeCommands,
    diagnostics: [
      ...diagnostics,
      createDiagnostic("max-steps", `Advance stopped after reaching the max step limit of ${maxSteps}.`)
    ],
    stopReason: "max-steps"
  };
}

/** Executes exactly one instruction, or returns the active story boundary unchanged. */
export function stepStoryInstruction(state: StoryRuntimeState, script: RuntimeScript): StoryStepperResult {
  if (state.ended) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [createDiagnostic("story-ended-noop", "Story is already ended; advance did not change state.")],
      stopReason: "ended"
    };
  }

  if (state.presentationWait) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [
        createDiagnostic("presentation-wait", "Story is waiting for a presentation command to complete; advance did not change state.")
      ],
      stopReason: "presentation-wait"
    };
  }

  if (state.runtimeWait) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [
        createDiagnostic("runtime-wait", "Story is waiting for a runtime command to complete; advance did not change state.")
      ],
      stopReason: "runtime-wait"
    };
  }

  const command = script.commands[state.instructionPointer];
  if (state.pendingChoices.length > 0 && !canContinueChoiceGroup(state, script)) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [createDiagnostic("pending-choices", "Story is waiting for a choice; advance did not change state.")],
      stopReason: "choices"
    };
  }

  if (!command) return { state: { ...state, ended: true }, diagnostics: [], emittedRuntimeCommands: [] };
  return executeCommandAtPointer(state, script, command);
}

export function chooseStoryOption(state: StoryRuntimeState, script: RuntimeScript, index: number): StoryStepperResult {
  if (state.presentationWait) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [
        createDiagnostic("presentation-wait", "Story is waiting for a presentation command to complete; choice did not change state.")
      ],
      stopReason: "presentation-wait"
    };
  }

  if (state.runtimeWait) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [
        createDiagnostic("runtime-wait", "Story is waiting for a runtime command to complete; choice did not change state.")
      ],
      stopReason: "runtime-wait"
    };
  }

  const choice = Number.isInteger(index) ? state.pendingChoices[index] : undefined;
  if (!choice) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [createDiagnostic("invalid-choice", `Choice index ${index} is not available.`)]
    };
  }
  if (choice.enabled === false) {
    return {
      state,
      emittedRuntimeCommands: [],
      diagnostics: [createDiagnostic("invalid-choice", `Choice index ${index} is disabled.`)]
    };
  }

  const cleared = { ...state, pendingChoices: [] };
  const withChoiceSet = choice.setExpression ? applySetExpression(cleared, choice.setExpression) : cleared;
  return {
    state: choice.goto ? jumpToLabel(withChoiceSet, script, choice.goto) : withChoiceSet,
    diagnostics: [],
    emittedRuntimeCommands: []
  };
}

export function selectCurrentStoryLine(state: StoryRuntimeState): CurrentStoryLine | undefined {
  const latest = state.text?.current ?? state.backlog.at(-1);
  if (!latest) return undefined;
  return compactStoryTextLine(latest);
}

export function storyReducer(state: StoryRuntimeState, event: StoryEvent): StoryStepperResult {
  if (event.type === "STEP") return stepStoryInstruction(state, event.script);

  if (event.type === "PRESENTATION_COMPLETE") {
    return {
      state: state.presentationWait ? { ...state, presentationWait: undefined } : state,
      diagnostics: [],
      emittedRuntimeCommands: []
    };
  }

  if (event.type === "RUNTIME_WAIT_COMPLETE") {
    if (!state.runtimeWait || state.runtimeWait.kind !== event.kind) {
      return {
        state,
        diagnostics: [
          createDiagnostic(
            "invalid-runtime-wait-completion",
            `Runtime wait completion ${event.kind} does not match the active wait.`
          )
        ],
        emittedRuntimeCommands: []
      };
    }
    return {
      state: { ...state, runtimeWait: undefined },
      diagnostics: [],
      emittedRuntimeCommands: []
    };
  }

  if (event.type === "SUBMIT_INPUT") {
    if (!state.runtimeWait || state.runtimeWait.kind !== "input") {
      return {
        state,
        diagnostics: [
          createDiagnostic("invalid-runtime-wait-completion", "Input submission does not match an active input wait.")
        ],
        emittedRuntimeCommands: []
      };
    }
    const coerced = coerceInputValue(event.value, state.runtimeWait.valueType);
    if (coerced.diagnostic) {
      return {
        state,
        diagnostics: [coerced.diagnostic],
        emittedRuntimeCommands: []
      };
    }
    return {
      state: {
        ...state,
        runtimeWait: undefined,
        variables: { ...state.variables, [state.runtimeWait.variableName]: coerced.value ?? "" }
      },
      diagnostics: [],
      emittedRuntimeCommands: []
    };
  }

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

  return assertNeverStoryEvent(event);
}

function executeCommandAtPointer(
  state: StoryRuntimeState,
  script: RuntimeScript,
  command: RuntimeCommand
): RuntimeCommandExecutionResult {
  return executeCommand(state, script, command);
}

function canContinueChoiceGroup(state: StoryRuntimeState, script: RuntimeScript): boolean {
  const command = script.commands[state.instructionPointer];
  return command?.category === "choice" || command?.commandId === "clearchoice";
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
    case "append":
      return { state: executeAppend(advancedState, resolved.command), diagnostics: [], emittedRuntimeCommands: [] };
    case "resettext":
      return { state: executeResetText(advancedState), diagnostics: [], emittedRuntimeCommands: [] };
    case "clearbacklog":
      return { state: { ...advancedState, backlog: [] }, diagnostics: [], emittedRuntimeCommands: [] };
    case "showprinter":
      return { state: executeShowPrinter(advancedState, resolved.command), diagnostics: [], emittedRuntimeCommands: [] };
    case "wait":
      return executeWait(advancedState, state.instructionPointer, resolved.command);
    case "input":
      return executeInput(advancedState, state.instructionPointer, resolved.command);
    case "choice":
      return { state: executeChoice(advancedState, resolved.command), diagnostics: [], emittedRuntimeCommands: [] };
    case "clearchoice":
      return executeClearChoice(advancedState, resolved.command);
    case "goto":
      return executeGoto(advancedState, script, resolved.command);
    case "set":
      return { state: executeSet(advancedState, resolved.command), diagnostics: [], emittedRuntimeCommands: [] };
    case "end":
      return { state: { ...advancedState, ended: true }, diagnostics: [], emittedRuntimeCommands: [] };
    case "movie":
      return executeMovie(advancedState, state.instructionPointer, resolved.command);
    default:
      if (!CONTROL_COMMAND_IDS.has(command.commandId) && shouldWaitForPresentation(resolved.command)) {
        return {
          state: {
            ...advancedState,
            presentationWait: createPresentationWait(state.instructionPointer, resolved.command)
          },
          diagnostics: [],
          emittedRuntimeCommands: [resolved.command]
        };
      }
      return {
        state: advancedState,
        diagnostics: [],
        emittedRuntimeCommands: CONTROL_COMMAND_IDS.has(command.commandId) ? [] : [resolved.command]
      };
  }
}

function shouldWaitForPresentation(command: RuntimeCommand): boolean {
  if (scalarParam(command, "wait") !== true) return false;
  if (command.commandId === "showui" || command.commandId === "hideui") return hasValidRuntimeUiTargets(command);
  return command.category === "actor" || command.category === "scene" || command.category === "effect";
}

function presentationWaitDurationMs(command: RuntimeCommand): number {
  const fallback = command.commandId === "shake" ? 150 : 0;
  const durationMs = numberParam(command, "durationMs", numberParam(command, "duration", fallback));
  if (command.commandId !== "shake") return durationMs;
  return durationMs * Math.max(1, numberParam(command, "count", 3));
}

function createPresentationWait(commandIndex: number, command: RuntimeCommand): NonNullable<StoryRuntimeState["presentationWait"]> {
  const durationMs = presentationWaitDurationMs(command);
  if (command.commandId === "showui" || command.commandId === "hideui") {
    return {
      channel: "ui",
      commandId: command.commandId,
      commandIndex,
      durationMs,
      targets: runtimeUiTargets(command),
      targetVisible: command.commandId === "showui" ? booleanParam(command, "visible") ?? true : false
    };
  }

  return {
    channel: "pixi",
    commandId: command.commandId,
    commandIndex,
    durationMs,
    expectedTasks: [],
    ...(stringParam(command, "target") ? { target: stringParam(command, "target") } : {})
  };
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
  const printerId = stringParam(command, "printerId") ?? state.text?.printerId ?? "default";
  const richText = command.richText ? cloneRichText(command.richText) : undefined;
  const current = compactStoryTextLine({ speaker, text, richText });
  const backlogEntry: BacklogEntry = current;

  return {
    ...state,
    text: {
      printerId,
      visible: true,
      current
    },
    backlog: [...state.backlog, backlogEntry]
  };
}

function executeAppend(state: StoryRuntimeState, command: RuntimeCommand): StoryRuntimeState {
  const text = stringParam(command, "text") ?? "";
  const current = state.text?.current;
  const speaker = current?.speaker ?? stringParam(command, "speaker");
  const nextText = `${current?.text ?? ""}${text}`;
  const richText = appendRichText(current?.richText, current?.text ?? "", command.richText, text);
  return {
    ...state,
    text: {
      printerId: stringParam(command, "printerId") ?? state.text?.printerId ?? "default",
      visible: state.text?.visible ?? true,
      current: compactStoryTextLine({ speaker, text: nextText, richText })
    }
  };
}

function executeResetText(state: StoryRuntimeState): StoryRuntimeState {
  return {
    ...state,
    text: {
      printerId: state.text?.printerId ?? "default",
      visible: state.text?.visible ?? true
    }
  };
}

function executeShowPrinter(state: StoryRuntimeState, command: RuntimeCommand): StoryRuntimeState {
  return {
    ...state,
    text: {
      printerId: stringParam(command, "printerId") ?? state.text?.printerId ?? "default",
      visible: true,
      ...(state.text?.current ? { current: cloneStoryTextLine(state.text.current) } : {})
    }
  };
}

function executeWait(state: StoryRuntimeState, commandIndex: number, command: RuntimeCommand): RuntimeCommandExecutionResult {
  const waitMode = parseWaitMode(stringParam(command, "waitMode") ?? "i");
  if (waitMode.diagnostic) {
    return { state, diagnostics: [waitMode.diagnostic], emittedRuntimeCommands: [] };
  }
  return {
    state: {
      ...state,
      runtimeWait: {
        kind: "pause",
        commandId: "wait",
        commandIndex,
        mode: waitMode.mode,
        ...(waitMode.durationMs !== undefined ? { durationMs: waitMode.durationMs } : {})
      }
    },
    diagnostics: [],
    emittedRuntimeCommands: []
  };
}

function executeInput(state: StoryRuntimeState, commandIndex: number, command: RuntimeCommand): RuntimeCommandExecutionResult {
  const variableName = stringParam(command, "variableName");
  const valueType = stringParam(command, "valueType") ?? "string";
  if (!variableName) {
    return {
      state,
      diagnostics: [createDiagnostic("unsupported-command-param", "@input requires a variable name.", "warning")],
      emittedRuntimeCommands: []
    };
  }
  if (valueType !== "string" && valueType !== "number" && valueType !== "boolean") {
    return {
      state,
      diagnostics: [createDiagnostic("unsupported-command-param", `@input type ${valueType} is unsupported.`, "warning")],
      emittedRuntimeCommands: []
    };
  }
  const defaultValue = scalarParam(command, "defaultValue");
  return {
    state: {
      ...state,
      runtimeWait: {
        kind: "input",
        commandId: "input",
        commandIndex,
        variableName,
        valueType,
        ...(stringParam(command, "summary") ? { summary: stringParam(command, "summary") } : {}),
        ...(defaultValue !== undefined ? { defaultValue } : {})
      }
    },
    diagnostics: [],
    emittedRuntimeCommands: []
  };
}

function executeChoice(state: StoryRuntimeState, command: RuntimeCommand): StoryRuntimeState {
  const text = stringParam(command, "text") ?? "Choice";
  const goto = stringParam(command, "goto");
  const id = stringParam(command, "id");
  const enabled = booleanParam(command, "enabled") ?? true;
  const setExpression = stringParam(command, "setExpression");
  const choice: StoryChoiceOption = {
    text,
    enabled,
    ...(command.richText ? { richText: cloneRichText(command.richText) } : {}),
    ...(goto ? { goto } : {}),
    ...(id ? { id } : {}),
    ...(setExpression ? { setExpression } : {})
  };
  return { ...state, pendingChoices: [...state.pendingChoices, choice] };
}

function executeClearChoice(state: StoryRuntimeState, command: RuntimeCommand): RuntimeCommandExecutionResult {
  const id = stringParam(command, "id");
  if (!id) return { state: { ...state, pendingChoices: [] }, diagnostics: [], emittedRuntimeCommands: [] };
  const nextChoices = state.pendingChoices.filter((choice) => choice.id !== id);
  if (nextChoices.length === state.pendingChoices.length) {
    return {
      state,
      diagnostics: [createDiagnostic("invalid-choice", `Choice id ${id} is not available.`)],
      emittedRuntimeCommands: []
    };
  }
  return { state: { ...state, pendingChoices: nextChoices }, diagnostics: [], emittedRuntimeCommands: [] };
}

function executeSet(state: StoryRuntimeState, command: RuntimeCommand): StoryRuntimeState {
  const key = stringParam(command, "key") ?? "";
  const value = scalarParam(command, "value");
  return { ...state, variables: { ...state.variables, [key]: value ?? true } };
}

function executeGoto(state: StoryRuntimeState, script: RuntimeScript, command: RuntimeCommand): RuntimeCommandExecutionResult {
  const label = stringParam(command, "label")?.trim() ?? "";
  if (!label) {
    return {
      state,
      diagnostics: [createDiagnostic("invalid-goto", "@goto requires a local label target.", "warning")],
      emittedRuntimeCommands: []
    };
  }
  if (isUnsupportedGotoTarget(label)) {
    return {
      state,
      diagnostics: [
        createDiagnostic(
          "unsupported-command-param",
          `@goto target ${label} is outside this task's local-label boundary; cross-script goto is not implemented.`,
          "warning"
        )
      ],
      emittedRuntimeCommands: []
    };
  }
  const normalized = normalizeLocalLabel(label);
  if (script.labels[normalized] === undefined) {
    return {
      state,
      diagnostics: [createDiagnostic("invalid-goto", `@goto target #${normalized} does not exist in ${script.scriptPath}.`, "warning")],
      emittedRuntimeCommands: []
    };
  }
  return { state: jumpToLabel(state, script, label), diagnostics: [], emittedRuntimeCommands: [] };
}

function executeMovie(state: StoryRuntimeState, commandIndex: number, command: RuntimeCommand): RuntimeCommandExecutionResult {
  if (booleanParam(command, "block") !== true) {
    return { state, diagnostics: [], emittedRuntimeCommands: [command] };
  }
  const moviePath = stringParam(command, "moviePath") ?? "";
  return {
    state: {
      ...state,
      runtimeWait: {
        kind: "movie",
        commandId: "movie",
        commandIndex,
        moviePath,
        allowSkip: true
      }
    },
    diagnostics: [],
    emittedRuntimeCommands: [command]
  };
}

function jumpToLabel(state: StoryRuntimeState, script: RuntimeScript, label: string): StoryRuntimeState {
  const normalized = normalizeLocalLabel(label);
  const pointer = script.labels[normalized];
  return pointer === undefined ? state : { ...state, instructionPointer: pointer };
}

function normalizeLocalLabel(label: string): string {
  return label.startsWith("#") ? label.slice(1) : label;
}

function isUnsupportedGotoTarget(label: string): boolean {
  if (label.startsWith("#")) return false;
  return label.includes("#") || label.includes("/") || label.includes("\\") || label.includes(".") || label.includes(":");
}

function stringParam(command: RuntimeCommand, key: string): string | undefined {
  const value = scalarParam(command, key);
  return value === undefined ? undefined : String(value);
}

function numberParam(command: RuntimeCommand, key: string, fallback: number): number {
  const value = scalarParam(command, key);
  return typeof value === "number" ? value : fallback;
}

function booleanParam(command: RuntimeCommand, key: string): boolean | undefined {
  const value = scalarParam(command, key);
  return typeof value === "boolean" ? value : undefined;
}

function runtimeUiTargets(command: RuntimeCommand): RuntimeUiGroup[] {
  const value = command.params.target;
  if (value === undefined) return [...RUNTIME_UI_GROUPS];
  const values = Array.isArray(value) ? value.map(runtimeValueScalar) : [runtimeValueScalar(value)];
  const targets = values
    .flatMap((item) => (item === undefined ? [] : String(item).split(",")))
    .map((item) => item.trim())
    .filter((item): item is RuntimeUiGroup => RUNTIME_UI_GROUP_SET.has(item));
  return targets;
}

function hasValidRuntimeUiTargets(command: RuntimeCommand): boolean {
  const value = command.params.target;
  if (value === undefined) return true;
  const values = Array.isArray(value) ? value.map(runtimeValueScalar) : [runtimeValueScalar(value)];
  const targets = values
    .flatMap((item) => (item === undefined ? [] : String(item).split(",")))
    .map((item) => item.trim());
  return targets.length > 0 && targets.every((target) => RUNTIME_UI_GROUP_SET.has(target));
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

function cloneTextState(text: NonNullable<StoryRuntimeState["text"]>): NonNullable<StoryRuntimeState["text"]> {
  return {
    printerId: text.printerId,
    visible: text.visible,
    ...(text.current ? { current: cloneStoryTextLine(text.current) } : {})
  };
}

function compactStoryTextLine(line: { speaker?: string | undefined; text: string; richText?: RichTextDocument | undefined }): {
  speaker?: string;
  text: string;
  richText?: RichTextDocument;
} {
  return {
    ...(line.speaker ? { speaker: line.speaker } : {}),
    text: line.text,
    ...(line.richText ? { richText: cloneRichText(line.richText) } : {})
  };
}

function cloneStoryTextLine(line: { speaker?: string | undefined; text: string; richText?: RichTextDocument | undefined }): {
  speaker?: string;
  text: string;
  richText?: RichTextDocument;
} {
  return compactStoryTextLine(line);
}

function cloneRichText(document: RichTextDocument): RichTextDocument {
  return {
    text: document.text,
    runs: document.runs.map((run) => ({ start: run.start, end: run.end, style: { ...run.style } }))
  };
}

function appendRichText(
  currentRichText: RichTextDocument | undefined,
  currentText: string,
  appendedRichText: RichTextDocument | undefined,
  appendedText: string
): RichTextDocument | undefined {
  if (!currentRichText && !appendedRichText) return undefined;
  const offset = Array.from(currentText).length;
  const nextText = `${currentText}${appendedText}`;
  return {
    text: nextText,
    runs: [
      ...(currentRichText?.runs.map((run) => ({ start: run.start, end: run.end, style: { ...run.style } })) ?? []),
      ...(appendedRichText?.runs.map((run) => ({ start: run.start + offset, end: run.end + offset, style: { ...run.style } })) ?? [])
    ]
  };
}

function parseWaitMode(value: string): { mode: "timer" | "confirm" | "timer-or-confirm"; durationMs?: number; diagnostic?: StoryStepperDiagnostic } {
  const trimmed = value.trim();
  if (trimmed === "i") return { mode: "confirm" };
  if (/^i\d+(\.\d+)?$/u.test(trimmed)) {
    return { mode: "timer-or-confirm", durationMs: secondsToMs(Number(trimmed.slice(1))) };
  }
  if (/^\d+(\.\d+)?$/u.test(trimmed)) return { mode: "timer", durationMs: secondsToMs(Number(trimmed)) };
  return {
    mode: "confirm",
    diagnostic: createDiagnostic("unsupported-command-param", `@wait mode ${value} is unsupported.`, "warning")
  };
}

function secondsToMs(seconds: number): number {
  return Math.max(0, Math.round(seconds * 1000));
}

function coerceInputValue(
  value: string | number | boolean,
  valueType: "string" | "number" | "boolean"
): { value?: string | number | boolean; diagnostic?: StoryStepperDiagnostic } {
  if (valueType === "string") return { value: String(value) };
  if (valueType === "number") {
    if (typeof value === "number" && Number.isFinite(value)) return { value };
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return { value: Number(value) };
    return { diagnostic: createDiagnostic("input-validation", `Input value ${String(value)} is not a valid number.`, "warning") };
  }
  if (typeof value === "boolean") return { value };
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return { value: true };
    if (normalized === "false") return { value: false };
  }
  return { diagnostic: createDiagnostic("input-validation", `Input value ${String(value)} is not a valid boolean.`, "warning") };
}

function applySetExpression(state: StoryRuntimeState, expression: string): StoryRuntimeState {
  const match = expression.match(/^\s*([a-zA-Z0-9:_./-]+)\s*(?::|=)\s*(.+?)\s*$/u);
  if (!match) return state;
  const [, key, rawValue] = match;
  if (!key || rawValue === undefined) return state;
  return { ...state, variables: { ...state.variables, [key]: parseSetExpressionValue(rawValue) } };
}

function parseSetExpressionValue(raw: string): StoryScalar {
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return trimmed;
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

function assertNeverStoryEvent(event: never): never {
  throw new Error(`Unhandled story event: ${JSON.stringify(event)}`);
}
