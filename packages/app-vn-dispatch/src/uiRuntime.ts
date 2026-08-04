import {
  RUNTIME_UI_GROUPS,
  VN_UI_SURFACE_IDS,
  type RichTextDocument,
  type RuntimeCommand,
  type RuntimeUiGroup,
  type RuntimeValue,
  type StoryRuntimeSnapshot,
  type StoryUiPresentationWait,
  type VnPinpCheckpoint,
  type VnUiCheckpoint,
  type VnUiSurfaceId
} from "@v-ronpa/contracts";

export { RUNTIME_UI_GROUPS, VN_UI_SURFACE_IDS };
export type { RuntimeUiGroup, VnUiSurfaceId };

export type UiSurfacePhase = "hidden" | "shown" | "showing" | "hiding";

export interface UiSurfaceTransition {
  startedAtMs: number;
  durationMs: number;
  fromOpacity: number;
  toOpacity: number;
  targetVisible: boolean;
}

export interface UiSurfacePresentation {
  targetVisible: boolean;
  mounted: boolean;
  opacity: number;
  phase: UiSurfacePhase;
}

export interface UiSurfaceState extends UiSurfacePresentation {
  transition?: UiSurfaceTransition;
}

export type UiSurfaceStateMap = Record<VnUiSurfaceId, UiSurfaceState>;

export interface RuntimeToast {
  id: string;
  text: string;
  richText?: RichTextDocument;
  durationMs?: number;
}

export interface RuntimeInputPrompt {
  variableName: string;
  valueType: "string" | "number" | "boolean";
  summary?: string;
  defaultValue?: string | number | boolean;
}

export interface RuntimeMovieOverlay {
  assetId: string;
  uri?: string;
  blocking: boolean;
}

export interface RuntimePinpContent extends VnPinpCheckpoint {
  uri?: string;
}

export interface UiRuntimeState {
  surfaces: UiSurfaceStateMap;
  toasts: RuntimeToast[];
  toastSequence: number;
  pinpSequence: number;
  pinp?: RuntimePinpContent;
  inputPrompt?: RuntimeInputPrompt;
  movieOverlay?: RuntimeMovieOverlay;
}

export interface UiRuntimeDiagnostic {
  code: "unsupported-ui-target" | "unsupported-ui-command" | "invalid-pinp-command";
  severity: "info" | "warning" | "error";
  message: string;
  commandId: string;
}

export interface UiRuntimeResult {
  state: UiRuntimeState;
  diagnostics: UiRuntimeDiagnostic[];
}

export interface UiRuntimeCommandOptions {
  nowMs?: number;
}

const SHOW_UI_TARGETS = new Set<string>(RUNTIME_UI_GROUPS);

export function createInitialUiRuntimeState(): UiRuntimeState {
  return {
    surfaces: {
      dialog: shownSurface(),
      commandBar: shownSurface(),
      toastLayer: shownSurface(),
      cue: hiddenSurface(),
      pinp: hiddenSurface()
    },
    toasts: [],
    toastSequence: 0,
    pinpSequence: 0
  };
}

export function createVnUiCheckpoint(state: UiRuntimeState): VnUiCheckpoint {
  return {
    dialog: state.surfaces.dialog.targetVisible,
    commandBar: state.surfaces.commandBar.targetVisible,
    toastLayer: state.surfaces.toastLayer.targetVisible,
    cue: state.surfaces.cue.targetVisible,
    pinp: state.surfaces.pinp.targetVisible && state.pinp
      ? stablePinpContent(state.pinp)
      : null
  };
}

export function createUiRuntimeStateFromCheckpoint(checkpoint: VnUiCheckpoint): UiRuntimeState {
  return {
    surfaces: {
      dialog: terminalSurface(checkpoint.dialog),
      commandBar: terminalSurface(checkpoint.commandBar),
      toastLayer: terminalSurface(checkpoint.toastLayer),
      cue: terminalSurface(checkpoint.cue),
      pinp: terminalSurface(checkpoint.pinp !== null)
    },
    toasts: [],
    toastSequence: 0,
    pinpSequence: checkpoint.pinp ? 1 : 0,
    ...(checkpoint.pinp ? { pinp: clonePinpCheckpoint(checkpoint.pinp) } : {})
  };
}

export function reduceUiRuntimeCommand(
  state: UiRuntimeState,
  command: RuntimeCommand,
  options: UiRuntimeCommandOptions = {}
): UiRuntimeResult {
  if (command.commandId === "showui") return reduceUiVisibilityCommand(state, command, true, options);
  if (command.commandId === "hideui") return reduceUiVisibilityCommand(state, command, false, options);
  if (command.commandId === "cue") return reduceCueVisibilityCommand(state, command, true, options);
  if (command.commandId === "hidecue") return reduceCueVisibilityCommand(state, command, false, options);
  if (command.commandId === "pinp") return reducePinpCommand(state, command, options);
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

export function reduceUiRuntimeCommands(
  state: UiRuntimeState,
  commands: RuntimeCommand[],
  options: UiRuntimeCommandOptions = {}
): UiRuntimeResult {
  return commands.reduce<UiRuntimeResult>(
    (current, command) => {
      const next = reduceUiRuntimeCommand(current.state, command, options);
      return { state: next.state, diagnostics: [...current.diagnostics, ...next.diagnostics] };
    },
    { state, diagnostics: [] }
  );
}

export function advanceUiRuntimeTransitions(state: UiRuntimeState, nowMs: number): UiRuntimeState {
  let changed = false;
  const surfaces = { ...state.surfaces };
  for (const group of VN_UI_SURFACE_IDS) {
    const current = surfaces[group];
    if (!current.transition) continue;
    const next = advanceUiSurfaceTransition(current, nowMs);
    if (next !== current) {
      surfaces[group] = next;
      changed = true;
    }
  }
  const next = changed ? { ...state, surfaces } : state;
  return clearHiddenPinpContent(next);
}

export function settleUiRuntimeTransitions(
  state: UiRuntimeState,
  targets: readonly VnUiSurfaceId[] = VN_UI_SURFACE_IDS
): UiRuntimeState {
  let changed = false;
  const surfaces = { ...state.surfaces };
  for (const target of targets) {
    const current = surfaces[target];
    if (!current.transition) continue;
    surfaces[target] = terminalSurface(current.transition.targetVisible);
    changed = true;
  }
  const next = changed ? { ...state, surfaces } : state;
  return clearHiddenPinpContent(next);
}

export function settleUiRuntimePresentationWait(state: UiRuntimeState, wait: StoryUiPresentationWait): UiRuntimeState {
  return settleUiRuntimeSurfaces(state, wait.targets, wait.targetVisible);
}

export function hasActiveUiRuntimeTransitions(state: UiRuntimeState): boolean {
  return VN_UI_SURFACE_IDS.some((group) => Boolean(state.surfaces[group].transition));
}

export function isUiPresentationWait(wait: StoryRuntimeSnapshot["presentationWait"]): wait is StoryUiPresentationWait {
  return wait?.channel === "ui";
}

export function isUiPresentationWaitComplete(state: UiRuntimeState, wait: StoryUiPresentationWait): boolean {
  return wait.targets.every((target) => {
    const surface = state.surfaces[target];
    return !surface.transition && surface.targetVisible === wait.targetVisible && surface.mounted === wait.targetVisible;
  });
}

export function selectUiSurfacePresentation(state: UiRuntimeState, group: VnUiSurfaceId): UiSurfacePresentation {
  const { targetVisible, mounted, opacity, phase } = state.surfaces[group];
  return { targetVisible, mounted, opacity, phase };
}

export function deriveUiRuntimeLifecycleState(state: UiRuntimeState, story: StoryRuntimeSnapshot): UiRuntimeState {
  const lifecycleState = story.text?.current?.channel === "cue"
    ? state
    : settleUiRuntimeSurfaces(state, ["cue"], false);
  if (story.runtimeWait?.kind !== "input") {
    const { inputPrompt: _inputPrompt, ...rest } = lifecycleState;
    void _inputPrompt;
    return rest;
  }
  return {
    ...lifecycleState,
    inputPrompt: {
      variableName: story.runtimeWait.variableName,
      valueType: story.runtimeWait.valueType,
      ...(story.runtimeWait.summary ? { summary: story.runtimeWait.summary } : {}),
      ...(story.runtimeWait.defaultValue !== undefined ? { defaultValue: story.runtimeWait.defaultValue } : {})
    }
  };
}

function reduceCueVisibilityCommand(
  state: UiRuntimeState,
  command: RuntimeCommand,
  visible: boolean,
  { nowMs = 0 }: UiRuntimeCommandOptions
): UiRuntimeResult {
  const durationMs = visible ? 0 : Math.max(0, Math.round(numberParam(command, "durationMs") ?? 0));
  return reduceUiSurfaceTargets(state, ["cue"], visible, durationMs, nowMs);
}

export function startMovieOverlay(state: UiRuntimeState, overlay: RuntimeMovieOverlay): UiRuntimeState {
  return { ...state, movieOverlay: overlay };
}

export function clearMovieOverlay(state: UiRuntimeState): UiRuntimeState {
  const { movieOverlay: _movieOverlay, ...rest } = state;
  void _movieOverlay;
  return rest;
}

export function clearRuntimePinp(state: UiRuntimeState): UiRuntimeState {
  const { pinp: _pinp, ...rest } = state;
  void _pinp;
  const current = state.surfaces.pinp;
  if (!state.pinp && !current.targetVisible && !current.mounted && !current.transition) return state;
  return {
    ...rest,
    surfaces: { ...state.surfaces, pinp: hiddenSurface() }
  };
}

export function hydrateRuntimePinp(
  state: UiRuntimeState,
  input: { assetId: string; uri?: string }
): UiRuntimeState {
  if (!state.pinp || state.pinp.assetId !== input.assetId) return state;
  const { uri: _uri, ...pinp } = state.pinp;
  void _uri;
  return {
    ...state,
    pinp: { ...pinp, ...(input.uri ? { uri: input.uri } : {}) }
  };
}

export function dismissToast(state: UiRuntimeState, toastId: string): UiRuntimeState {
  return { ...state, toasts: state.toasts.filter((toast) => toast.id !== toastId) };
}

function reduceUiVisibilityCommand(
  state: UiRuntimeState,
  command: RuntimeCommand,
  defaultVisible: boolean,
  { nowMs = 0 }: UiRuntimeCommandOptions
): UiRuntimeResult {
  const targets = runtimeUiTargets(command);
  if (!targets.valid) {
    return {
      state,
      diagnostics: [
        {
          code: "unsupported-ui-target",
          commandId: command.commandId,
          severity: "warning",
          message: `@${command.canonicalName} target ${targets.source ?? "(missing)"} is not a v1 runtime UI surface.`
        }
      ]
    };
  }

  const visible = command.commandId === "showui" ? booleanParam(command, "visible") ?? defaultVisible : defaultVisible;
  const durationMs = Math.max(0, Math.round(numberParam(command, "durationMs") ?? 0));
  return reduceUiSurfaceTargets(state, targets.targets, visible, durationMs, nowMs);
}

function reducePinpCommand(
  state: UiRuntimeState,
  command: RuntimeCommand,
  { nowMs = 0 }: UiRuntimeCommandOptions
): UiRuntimeResult {
  const currentState = advanceUiRuntimeTransitions(state, nowMs);
  const visible = booleanParam(command, "visible");
  if (visible === false) return hidePinp(currentState, command, nowMs);
  if (visible !== undefined && visible !== true) return invalidPinp(currentState, command, "visible must be a boolean.");

  const assetId = stringParam(command, "assetId");
  const positionPercent = numberTupleParam(command, "positionPercent", 2);
  const aspectRatio = numberTupleParam(command, "aspectRatio", 2);
  const heightPercent = numberParam(command, "heightPercent");
  const alt = stringParam(command, "alt");
  const effect = stringParam(command, "effect") ?? "fade";
  const durationMs = numberParam(command, "durationMs") ?? 180;
  if (!assetId?.trim()) return invalidPinp(currentState, command, "show form requires a non-empty assetId.");
  if (!positionPercent || positionPercent.some((value) => value < 0 || value > 100)) {
    return invalidPinp(currentState, command, "positionPercent must contain two finite numbers from 0 to 100.");
  }
  if (!Number.isFinite(heightPercent) || heightPercent === undefined || heightPercent <= 0 || heightPercent > 100) {
    return invalidPinp(currentState, command, "heightPercent must be greater than 0 and at most 100.");
  }
  if (!aspectRatio || aspectRatio.some((value) => value <= 0)) {
    return invalidPinp(currentState, command, "aspectRatio must contain two positive finite numbers.");
  }
  if (alt === undefined) return invalidPinp(currentState, command, "alt must be a string.");
  if (effect !== "fade" && effect !== "none") return invalidPinp(currentState, command, "effect must be fade or none.");
  if (!Number.isFinite(durationMs) || durationMs < 0 || (effect === "none" && durationMs > 0)) {
    return invalidPinp(currentState, command, "durationMs must be non-negative and zero when effect is none.");
  }

  const pinpSequence = currentState.pinpSequence + 1;
  const duration = effect === "none" ? 0 : Math.round(durationMs);
  const surface = duration === 0
    ? shownSurface()
    : transitionUiSurface(hiddenSurface(), true, duration, nowMs);
  return {
    state: {
      ...currentState,
      surfaces: { ...currentState.surfaces, pinp: surface },
      pinpSequence,
      pinp: {
        assetId,
        alt,
        positionPercent: [positionPercent[0]!, positionPercent[1]!],
        heightPercent,
        aspectRatio: [aspectRatio[0]!, aspectRatio[1]!]
      }
    },
    diagnostics: []
  };
}

function hidePinp(state: UiRuntimeState, command: RuntimeCommand, nowMs: number): UiRuntimeResult {
  if (command.params.assetId !== undefined || command.params.positionPercent !== undefined ||
      command.params.heightPercent !== undefined || command.params.aspectRatio !== undefined || command.params.alt !== undefined) {
    return invalidPinp(state, command, "hide form cannot include source or layout content.");
  }
  const effect = stringParam(command, "effect") ?? "fade";
  const durationMs = numberParam(command, "durationMs") ?? 180;
  if (effect !== "fade" && effect !== "none") return invalidPinp(state, command, "effect must be fade or none.");
  if (!Number.isFinite(durationMs) || durationMs < 0 || (effect === "none" && durationMs > 0)) {
    return invalidPinp(state, command, "durationMs must be non-negative and zero when effect is none.");
  }
  if (!state.pinp) return { state, diagnostics: [] };
  const duration = effect === "none" ? 0 : Math.round(durationMs);
  const surface = transitionUiSurface(state.surfaces.pinp, false, duration, nowMs);
  return {
    state: clearHiddenPinpContent({ ...state, surfaces: { ...state.surfaces, pinp: surface } }),
    diagnostics: []
  };
}

function invalidPinp(state: UiRuntimeState, command: RuntimeCommand, detail: string): UiRuntimeResult {
  return {
    state,
    diagnostics: [{
      code: "invalid-pinp-command",
      commandId: command.commandId,
      severity: "error",
      message: `@${command.canonicalName} ${detail}`
    }]
  };
}

function reduceUiSurfaceTargets(
  state: UiRuntimeState,
  targets: readonly VnUiSurfaceId[],
  visible: boolean,
  durationMs: number,
  nowMs: number
): UiRuntimeResult {
  const currentState = advanceUiRuntimeTransitions(state, nowMs);
  let changed = currentState !== state;
  const nextSurfaces = { ...currentState.surfaces };

  for (const group of targets) {
    const current = nextSurfaces[group];
    const next = transitionUiSurface(current, visible, durationMs, nowMs);
    if (next !== current) {
      nextSurfaces[group] = next;
      changed = true;
    }
  }

  return {
    state: changed ? { ...currentState, surfaces: nextSurfaces } : currentState,
    diagnostics: []
  };
}

function reduceToastCommand(state: UiRuntimeState, command: RuntimeCommand): UiRuntimeResult {
  const text = stringParam(command, "text") ?? "";
  const durationMs = numberParam(command, "durationMs");
  const toastSequence = state.toastSequence + 1;
  return {
    state: {
      ...state,
      toastSequence,
      toasts: [
        ...state.toasts,
        {
          id: `toast:${toastSequence}`,
          text,
          ...(command.richText ? { richText: cloneRichText(command.richText) } : {}),
          ...(durationMs !== undefined ? { durationMs } : {})
        }
      ]
    },
    diagnostics: []
  };
}

function settleUiRuntimeSurfaces(
  state: UiRuntimeState,
  targets: readonly VnUiSurfaceId[],
  targetVisible: boolean
): UiRuntimeState {
  let changed = false;
  const surfaces = { ...state.surfaces };
  for (const target of targets) {
    const current = surfaces[target];
    const next = terminalSurface(targetVisible);
    if (
      current.targetVisible !== next.targetVisible ||
      current.mounted !== next.mounted ||
      Math.abs(current.opacity - next.opacity) >= 0.001 ||
      current.phase !== next.phase ||
      current.transition
    ) {
      surfaces[target] = next;
      changed = true;
    }
  }
  const next = changed ? { ...state, surfaces } : state;
  return clearHiddenPinpContent(next);
}

function transitionUiSurface(
  surface: UiSurfaceState,
  targetVisible: boolean,
  durationMs: number,
  nowMs: number
): UiSurfaceState {
  const toOpacity = targetVisible ? 1 : 0;
  if (durationMs === 0 || Math.abs(surface.opacity - toOpacity) < 0.001) {
    return isTerminalUiSurface(surface, targetVisible) ? surface : terminalSurface(targetVisible);
  }
  return {
    targetVisible,
    mounted: true,
    opacity: surface.opacity,
    phase: targetVisible ? "showing" : "hiding",
    transition: {
      startedAtMs: nowMs,
      durationMs,
      fromOpacity: surface.opacity,
      toOpacity,
      targetVisible
    }
  };
}

function advanceUiSurfaceTransition(surface: UiSurfaceState, nowMs: number): UiSurfaceState {
  const transition = surface.transition;
  if (!transition) return surface;
  const elapsedMs = Math.max(0, nowMs - transition.startedAtMs);
  const progress = transition.durationMs === 0 ? 1 : Math.min(1, elapsedMs / transition.durationMs);
  if (progress >= 1) return terminalSurface(transition.targetVisible);
  const opacity = transition.fromOpacity + (transition.toOpacity - transition.fromOpacity) * progress;
  if (Math.abs(opacity - surface.opacity) < 0.001) return surface;
  return {
    ...surface,
    targetVisible: transition.targetVisible,
    mounted: true,
    opacity,
    phase: transition.targetVisible ? "showing" : "hiding"
  };
}

function terminalSurface(visible: boolean): UiSurfaceState {
  return visible ? shownSurface() : hiddenSurface();
}

function isTerminalUiSurface(surface: UiSurfaceState, visible: boolean): boolean {
  return (
    !surface.transition &&
    surface.targetVisible === visible &&
    surface.mounted === visible &&
    surface.phase === (visible ? "shown" : "hidden") &&
    Math.abs(surface.opacity - (visible ? 1 : 0)) < 0.001
  );
}

function shownSurface(): UiSurfaceState {
  return { targetVisible: true, mounted: true, opacity: 1, phase: "shown" };
}

function hiddenSurface(): UiSurfaceState {
  return { targetVisible: false, mounted: false, opacity: 0, phase: "hidden" };
}

function cloneRichText(document: RichTextDocument): RichTextDocument {
  return {
    text: document.text,
    runs: document.runs.map((run) => ({ start: run.start, end: run.end, style: { ...run.style } }))
  };
}

function stablePinpContent(pinp: RuntimePinpContent): VnPinpCheckpoint {
  return clonePinpCheckpoint(pinp);
}

function clonePinpCheckpoint(pinp: VnPinpCheckpoint): VnPinpCheckpoint {
  return {
    assetId: pinp.assetId,
    alt: pinp.alt,
    positionPercent: [pinp.positionPercent[0], pinp.positionPercent[1]],
    heightPercent: pinp.heightPercent,
    aspectRatio: [pinp.aspectRatio[0], pinp.aspectRatio[1]]
  };
}

function clearHiddenPinpContent(state: UiRuntimeState): UiRuntimeState {
  if (state.surfaces.pinp.mounted || !state.pinp) return state;
  const { pinp: _pinp, ...rest } = state;
  void _pinp;
  return rest;
}

function numberTupleParam(command: RuntimeCommand, key: string, length: number): number[] | undefined {
  const value = command.params[key];
  if (!Array.isArray(value) || value.length !== length) return undefined;
  if (!value.every((item): item is number => typeof item === "number" && Number.isFinite(item))) return undefined;
  return value;
}

function runtimeUiTargets(command: RuntimeCommand): { valid: true; targets: RuntimeUiGroup[] } | { valid: false; source?: string } {
  const value = command.params.target;
  if (value === undefined) return { valid: true, targets: [...RUNTIME_UI_GROUPS] };
  const source = stringParam(command, "target");
  const values = runtimeValueScalars(value)
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length === 0 || values.some((item) => !isRuntimeUiGroup(item))) return { valid: false, ...(source ? { source } : {}) };
  return { valid: true, targets: values as RuntimeUiGroup[] };
}

function isRuntimeUiGroup(value: string | undefined): value is RuntimeUiGroup {
  return value !== undefined && SHOW_UI_TARGETS.has(value);
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

function runtimeValueScalars(value: RuntimeValue): Array<string | number | boolean> {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [value];
  if (Array.isArray(value)) return value.flatMap(runtimeValueScalars);
  return [];
}
