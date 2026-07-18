import { clampVnDevtoolsWidth, VN_DEVTOOLS_DEFAULT_WIDTH } from "./types";
import type {
  VnDebugChoiceDecision,
  VnDebugInputDecision,
  VnDebugTargetAnchor
} from "@v-ronpa/app-vn-runtime/debug";

export const VN_DEVTOOLS_SESSION_VERSION = 1 as const;

export interface VnDevtoolsStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/** Only layout plus canonical target/decision fields may survive a tab refresh. */
export interface VnDevtoolsPersistedSessionState {
  version: typeof VN_DEVTOOLS_SESSION_VERSION;
  collapsed: boolean;
  width: number;
  pinnedTarget?: VnDebugTargetAnchor;
  decisions?: readonly VnDevtoolsPersistedDecision[];
}

export type VnDevtoolsPersistedDecision = VnDebugChoiceDecision | VnDebugInputDecision;

export function loadVnDevtoolsSessionState(
  storage: VnDevtoolsStorageLike,
  key: string
): VnDevtoolsPersistedSessionState | undefined {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== VN_DEVTOOLS_SESSION_VERSION) return undefined;
    if (typeof value.collapsed !== "boolean" || typeof value.width !== "number") return undefined;

    const state: VnDevtoolsPersistedSessionState = {
      version: VN_DEVTOOLS_SESSION_VERSION,
      collapsed: value.collapsed,
      width: clampVnDevtoolsWidth(value.width)
    };
    const pinnedTarget = canonicalizeTargetAnchor(value.pinnedTarget);
    if (pinnedTarget !== undefined) state.pinnedTarget = pinnedTarget;
    if (Array.isArray(value.decisions)) {
      state.decisions = value.decisions
        .map(canonicalizePersistedDecision)
        .filter((decision): decision is VnDevtoolsPersistedDecision => decision !== undefined);
    }
    return state;
  } catch {
    return undefined;
  }
}

export function saveVnDevtoolsSessionState(
  storage: VnDevtoolsStorageLike,
  key: string,
  state: Omit<VnDevtoolsPersistedSessionState, "version">
): boolean {
  try {
    const normalized: VnDevtoolsPersistedSessionState = {
      version: VN_DEVTOOLS_SESSION_VERSION,
      collapsed: state.collapsed,
      width: clampVnDevtoolsWidth(state.width)
    };
    const pinnedTarget = canonicalizeTargetAnchor(state.pinnedTarget);
    if (pinnedTarget !== undefined) normalized.pinnedTarget = pinnedTarget;
    if (state.decisions !== undefined) {
      normalized.decisions = state.decisions
        .map(canonicalizePersistedDecision)
        .filter((decision): decision is VnDevtoolsPersistedDecision => decision !== undefined);
    }
    storage.setItem(key, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function clearVnDevtoolsSessionState(storage: VnDevtoolsStorageLike, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function createDefaultVnDevtoolsSessionState(): VnDevtoolsPersistedSessionState {
  return {
    version: VN_DEVTOOLS_SESSION_VERSION,
    collapsed: false,
    width: VN_DEVTOOLS_DEFAULT_WIDTH
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalizePersistedDecision(value: unknown): VnDevtoolsPersistedDecision | undefined {
  if (!isRecord(value)) return undefined;
  const anchor = canonicalizeTargetAnchor(value.anchor);
  if (anchor === undefined) return undefined;
  if (typeof value.text === "string") {
    if ((value.choiceId !== undefined && typeof value.choiceId !== "string")
      || (value.goto !== undefined && typeof value.goto !== "string")) {
      return undefined;
    }
    const decision: VnDebugChoiceDecision = { anchor, text: value.text };
    if (typeof value.choiceId === "string") decision.choiceId = value.choiceId;
    if (typeof value.goto === "string") decision.goto = value.goto;
    return decision;
  }
  if (typeof value.value !== "string" && typeof value.value !== "number" && typeof value.value !== "boolean") {
    return undefined;
  }
  return { anchor, value: value.value };
}

function canonicalizeTargetAnchor(value: unknown): VnDebugTargetAnchor | undefined {
  if (!isRecord(value)
    || (value.kind !== "command" && value.kind !== "label")
    || typeof value.scriptPath !== "string"
    || typeof value.revision !== "string"
    || !isPositiveInteger(value.line)
    || !isNonNegativeInteger(value.commandIndex)
    || !isNonNegativeInteger(value.ordinal)
    || (value.commandId !== undefined && typeof value.commandId !== "string")
    || (value.label !== undefined && typeof value.label !== "string")
    || (value.stableId !== undefined && typeof value.stableId !== "string")
    || (value.fingerprint !== undefined && typeof value.fingerprint !== "string")) {
    return undefined;
  }

  const anchor: VnDebugTargetAnchor = {
    kind: value.kind,
    scriptPath: value.scriptPath,
    revision: value.revision,
    line: value.line,
    commandIndex: value.commandIndex,
    ordinal: value.ordinal
  };
  if (typeof value.commandId === "string") anchor.commandId = value.commandId;
  if (typeof value.label === "string") anchor.label = value.label;
  if (typeof value.stableId === "string") anchor.stableId = value.stableId;
  if (typeof value.fingerprint === "string") anchor.fingerprint = value.fingerprint;
  return anchor;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
