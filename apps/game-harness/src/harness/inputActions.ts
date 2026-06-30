import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { InputAction, InputActionEvent, InputActionState, InputBindingMap, InputContext } from "@v-ronpa/contracts";

const INPUT_EVENT_HISTORY_LIMIT = 32;

export const defaultHarnessInputBindings = {
  version: 1,
  bindings: [
    { action: "move-forward", device: "keyboard", code: "ArrowUp", context: "navi" },
    { action: "move-back", device: "keyboard", code: "ArrowDown", context: "navi" },
    { action: "move-left", device: "keyboard", code: "ArrowLeft", context: "navi" },
    { action: "move-right", device: "keyboard", code: "ArrowRight", context: "navi" },
    { action: "interact", device: "keyboard", code: "Space", context: "navi" }
  ]
} satisfies InputBindingMap;

export function useKeyboardInputActions(
  inputBindings: InputBindingMap,
  context: InputContext,
  enabled: boolean
): MutableRefObject<InputActionState> {
  const stateRef = useRef<InputActionState>(createInputActionState(context, new Set(), [], 0));
  const pressedCodesRef = useRef(new Map<string, InputAction>());
  const downActionsRef = useRef(new Set<InputAction>());
  const eventsRef = useRef<InputActionEvent[]>([]);
  const sequenceRef = useRef(0);
  const keyboardActions = useMemo(() => createKeyboardActionLookup(inputBindings, context), [context, inputBindings]);

  useEffect(() => {
    if (enabled) return;
    pressedCodesRef.current.clear();
    downActionsRef.current.clear();
    eventsRef.current = [];
    stateRef.current = createInputActionState(context, downActionsRef.current, eventsRef.current, sequenceRef.current);
  }, [context, enabled]);

  useEffect(() => {
    if (!enabled) return;

    function publish(events: InputActionEvent[]) {
      eventsRef.current = [...eventsRef.current, ...events].slice(-INPUT_EVENT_HISTORY_LIMIT);
      stateRef.current = createInputActionState(context, downActionsRef.current, eventsRef.current, sequenceRef.current);
    }

    function onKeyDown(event: KeyboardEvent) {
      const action = keyboardActions.get(event.code);
      if (!action) return;

      event.preventDefault();
      if (event.repeat || pressedCodesRef.current.has(event.code)) return;

      const wasActionDown = downActionsRef.current.has(action);
      pressedCodesRef.current.set(event.code, action);
      downActionsRef.current.add(action);
      if (!wasActionDown) {
        sequenceRef.current += 1;
        publish([{ action, phase: "pressed", sequence: sequenceRef.current }]);
      } else {
        stateRef.current = createInputActionState(context, downActionsRef.current, eventsRef.current, sequenceRef.current);
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      const action = pressedCodesRef.current.get(event.code) ?? keyboardActions.get(event.code);
      if (!action) return;

      event.preventDefault();
      pressedCodesRef.current.delete(event.code);
      if (hasPressedAction(pressedCodesRef.current, action)) return;

      downActionsRef.current.delete(action);
      sequenceRef.current += 1;
      publish([{ action, phase: "released", sequence: sequenceRef.current }]);
    }

    function onBlur() {
      if (downActionsRef.current.size === 0) return;

      const released = [...downActionsRef.current].map((action) => {
        sequenceRef.current += 1;
        return { action, phase: "released" as const, sequence: sequenceRef.current };
      });
      pressedCodesRef.current.clear();
      downActionsRef.current.clear();
      publish(released);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [context, enabled, keyboardActions]);

  return stateRef;
}

function createKeyboardActionLookup(inputBindings: InputBindingMap, context: InputContext): Map<string, InputAction> {
  const lookup = new Map<string, InputAction>();
  for (const binding of inputBindings.bindings) {
    if (binding.device !== "keyboard") continue;
    if (binding.context !== context && binding.context !== "global") continue;
    lookup.set(binding.code, binding.action);
  }
  return lookup;
}

function createInputActionState(
  context: InputContext,
  downActions: ReadonlySet<InputAction>,
  events: readonly InputActionEvent[],
  sequence: number
): InputActionState {
  return {
    version: 1,
    context,
    down: [...downActions],
    events: [...events],
    sequence
  };
}

function hasPressedAction(pressedCodes: ReadonlyMap<string, InputAction>, action: InputAction): boolean {
  for (const pressedAction of pressedCodes.values()) {
    if (pressedAction === action) return true;
  }
  return false;
}
