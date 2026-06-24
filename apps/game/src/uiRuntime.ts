import type { RuntimeCommand, RuntimeValue, StoryRuntimeSnapshot } from "@v-ronpa/contracts";

export const RUNTIME_UI_GROUPS = ["dialog", "commandBar", "toastLayer"] as const;
export type RuntimeUiGroup = (typeof RUNTIME_UI_GROUPS)[number];

export interface RuntimeToast {
  id: string;
  text: string;
  durationMs?: number;
}

export interface RuntimeInputPrompt {
  variableName: string;
  valueType: "string" | "number" | "boolean";
  summary?: string;
  defaultValue?: string | number | boolean;
}

export interface RuntimeMovieOverlay {
  sourceRef: string;
  uri?: string;
  blocking: boolean;
}

export interface UiRuntimeState {
  visible: Record<RuntimeUiGroup, boolean>;
  toasts: RuntimeToast[];
  inputPrompt?: RuntimeInputPrompt;
  movieOverlay?: RuntimeMovieOverlay;
}

export interface UiRuntimeDiagnostic {
  code: "unsupported-ui-target" | "unsupported-ui-command";
  severity: "info" | "warning" | "error";
  message: string;
  commandId: string;
}

export interface UiRuntimeResult {
  state: UiRuntimeState;
  diagnostics: UiRuntimeDiagnostic[];
}

const SHOW_UI_TARGETS = new Set<string>(RUNTIME_UI_GROUPS);
let toastSequence = 0;

export function createInitialUiRuntimeState(): UiRuntimeState {
  return {
    visible: {
      dialog: true,
      commandBar: true,
      toastLayer: true
    },
    toasts: []
  };
}

export function reduceUiRuntimeCommand(state: UiRuntimeState, command: RuntimeCommand): UiRuntimeResult {
  if (command.commandId === "showui") return reduceUiVisibilityCommand(state, command, true);
  if (command.commandId === "hideui") return reduceUiVisibilityCommand(state, command, false);
  if (command.commandId === "toast") return reduceToastCommand(state, command);
  return {
    state,
    diagnostics: [
      {
        code: "unsupported-ui-command",
        commandId: command.commandId,
        severity: "warning",
        message: `@${command.canonicalName} is not handled by uiRuntime.`
      }
    ]
  };
}

export function reduceUiRuntimeCommands(state: UiRuntimeState, commands: RuntimeCommand[]): UiRuntimeResult {
  return commands.reduce<UiRuntimeResult>(
    (current, command) => {
      const next = reduceUiRuntimeCommand(current.state, command);
      return { state: next.state, diagnostics: [...current.diagnostics, ...next.diagnostics] };
    },
    { state, diagnostics: [] }
  );
}

export function deriveUiRuntimeLifecycleState(state: UiRuntimeState, story: StoryRuntimeSnapshot): UiRuntimeState {
  if (story.runtimeWait?.kind !== "input") {
    const { inputPrompt: _inputPrompt, ...rest } = state;
    void _inputPrompt;
    return rest;
  }
  return {
    ...state,
    inputPrompt: {
      variableName: story.runtimeWait.variableName,
      valueType: story.runtimeWait.valueType,
      ...(story.runtimeWait.summary ? { summary: story.runtimeWait.summary } : {}),
      ...(story.runtimeWait.defaultValue !== undefined ? { defaultValue: story.runtimeWait.defaultValue } : {})
    }
  };
}

export function startMovieOverlay(state: UiRuntimeState, overlay: RuntimeMovieOverlay): UiRuntimeState {
  return { ...state, movieOverlay: overlay };
}

export function clearMovieOverlay(state: UiRuntimeState): UiRuntimeState {
  const { movieOverlay: _movieOverlay, ...rest } = state;
  void _movieOverlay;
  return rest;
}

export function dismissToast(state: UiRuntimeState, toastId: string): UiRuntimeState {
  return { ...state, toasts: state.toasts.filter((toast) => toast.id !== toastId) };
}

function reduceUiVisibilityCommand(state: UiRuntimeState, command: RuntimeCommand, defaultVisible: boolean): UiRuntimeResult {
  const target = stringParam(command, "target");
  if (target !== undefined && !isRuntimeUiGroup(target)) {
    return {
      state,
      diagnostics: [
        {
          code: "unsupported-ui-target",
          commandId: command.commandId,
          severity: "warning",
          message: `@${command.canonicalName} target ${target ?? "(missing)"} is not a v1 runtime UI surface.`
        }
      ]
    };
  }
  const targets: readonly RuntimeUiGroup[] = target === undefined ? RUNTIME_UI_GROUPS : [target];
  const visible = command.commandId === "showui" ? booleanParam(command, "visible") ?? defaultVisible : defaultVisible;
  const nextVisible = { ...state.visible };
  for (const group of targets) nextVisible[group] = visible;
  return {
    state: {
      ...state,
      visible: nextVisible
    },
    diagnostics: []
  };
}

function reduceToastCommand(state: UiRuntimeState, command: RuntimeCommand): UiRuntimeResult {
  const text = stringParam(command, "text") ?? "";
  const durationMs = numberParam(command, "durationMs");
  return {
    state: {
      ...state,
      toasts: [
        ...state.toasts,
        {
          id: `toast:${++toastSequence}`,
          text,
          ...(durationMs !== undefined ? { durationMs } : {})
        }
      ]
    },
    diagnostics: []
  };
}

function isRuntimeUiGroup(value: string | undefined): value is RuntimeUiGroup {
  return value !== undefined && SHOW_UI_TARGETS.has(value as RuntimeUiGroup);
}

function stringParam(command: RuntimeCommand, key: string): string | undefined {
  const value = scalarValue(command.params[key]);
  return value === undefined ? undefined : String(value);
}

function numberParam(command: RuntimeCommand, key: string): number | undefined {
  const value = scalarValue(command.params[key]);
  return typeof value === "number" ? value : undefined;
}

function booleanParam(command: RuntimeCommand, key: string): boolean | undefined {
  const value = scalarValue(command.params[key]);
  return typeof value === "boolean" ? value : undefined;
}

function scalarValue(value: RuntimeValue | undefined): string | number | boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const items = value.map(scalarValue);
    return items.some((item) => item === undefined) ? undefined : items.map(String).join(",");
  }
  return undefined;
}
