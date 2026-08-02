import type { TextSpan } from "@v-ronpa/nani-parser";
import type { VnDebugMaterializationMode } from "@v-ronpa/app-vn-runtime/debug";

export const VN_DEVTOOLS_DEFAULT_WIDTH = 504;
export const VN_DEVTOOLS_MIN_WIDTH = 320;
export const VN_DEVTOOLS_MAX_WIDTH = 720;
export const VN_DEVTOOLS_DEFAULT_PANEL_HEIGHT = 180;
export const VN_DEVTOOLS_MIN_PANEL_HEIGHT = 120;
export const VN_DEVTOOLS_MAX_PANEL_HEIGHT = 360;

export type VnDevtoolsPanelId = "problems" | "state";

export interface VnDevtoolsLayoutState {
  bottomPanelOpen: boolean;
  activePanel: VnDevtoolsPanelId;
  bottomPanelHeight: number;
}

export type VnDevtoolsDiagnosticSeverity = "info" | "warning" | "error";

export interface VnDevtoolsDiagnostic {
  id: string;
  severity: VnDevtoolsDiagnosticSeverity;
  message: string;
  code?: string;
  lineId?: string;
  lineNumber?: number;
  columnNumber?: number;
  /** Absolute half-open UTF-16 offsets into the inspected source. */
  span?: TextSpan;
  /** Half-open UTF-16 offsets relative to sourceText for this visible line. */
  sourceRange?: TextSpan;
}

export type VnDevtoolsLinePreviewability =
  | "previewable"
  | "decision-required"
  | "degraded"
  | "blocked"
  | "no-stable-result";

export interface VnDevtoolsSourceLine {
  id: string;
  lineNumber: number;
  sourceText: string;
  label?: string;
  command?: string;
  previewability: VnDevtoolsLinePreviewability;
  current?: boolean;
  pinned?: boolean;
  diagnostics?: readonly VnDevtoolsDiagnostic[];
}

export type VnDevtoolsStatusPhase =
  | "idle"
  | "inspecting"
  | "ready"
  | "updating"
  | "materializing"
  | "decision-required"
  | "blocked"
  | "error";

export interface VnDevtoolsStatus {
  phase: VnDevtoolsStatusPhase;
  message?: string;
  updateId?: number;
  degraded?: boolean;
  recovered?: boolean;
  cancellable?: boolean;
}

export type VnDevtoolsSummaryTone = "neutral" | "accent" | "warning" | "error";

export interface VnDevtoolsSummaryItem {
  label: string;
  value: string | number | boolean | null;
  tone?: VnDevtoolsSummaryTone;
}

export interface VnDevtoolsRuntimeSummaries {
  story: readonly VnDevtoolsSummaryItem[];
  pixi: readonly VnDevtoolsSummaryItem[];
  ui: readonly VnDevtoolsSummaryItem[];
  media: readonly VnDevtoolsSummaryItem[];
}

export interface VnDevtoolsChoiceDecisionOption {
  id: string;
  label: string;
  enabled: boolean;
  detail?: string;
}

export interface VnDevtoolsChoiceDecision {
  kind: "choice";
  id: string;
  prompt: string;
  options: readonly VnDevtoolsChoiceDecisionOption[];
  selectedOptionId?: string;
}

export interface VnDevtoolsInputDecision {
  kind: "input";
  id: string;
  prompt: string;
  variableName: string;
  inputType: "text" | "number" | "boolean";
  defaultValue?: string;
  validationMessage?: string;
}

export type VnDevtoolsDecision = VnDevtoolsChoiceDecision | VnDevtoolsInputDecision;

export type VnDevtoolsDecisionSubmission =
  | { kind: "choice"; decisionId: string; optionId: string }
  | { kind: "input"; decisionId: string; value: string | number | boolean };

export interface VnDevtoolsSourceLocation {
  scriptPath: string;
  lineNumber: number;
}

export interface VnDevtoolsActions {
  selectScript: (scriptPath: string) => void;
  selectLine: (lineId: string) => void;
  previewLine: (lineId: string) => void;
  pinCurrent: () => void;
  unpin: () => void;
  setCollapsed: (collapsed: boolean) => void;
  resize: (width: number) => void;
  updateLayout: (patch: Partial<VnDevtoolsLayoutState>) => void;
  search: (query: string) => void;
  submitDecision: (submission: VnDevtoolsDecisionSubmission) => void;
  cancelDecision: () => void;
  cancelCandidate: () => void;
  copyLocation: (location: VnDevtoolsSourceLocation) => void;
  setMaterializationMode: (mode: VnDebugMaterializationMode) => void;
  refreshCatalog: () => void;
}

export interface VnDevtoolsScriptItem {
  scriptPath: string;
  revision: string;
  scope: "production" | "development" | "test";
  executionDisposition: "runnable" | "fatal";
  viewed: boolean;
  runtime: boolean;
  hasUpdateBadge?: boolean;
}

export interface VnDevtoolsController {
  entryId: string;
  viewedScriptPath: string;
  runtimeScriptPath: string;
  scripts: readonly VnDevtoolsScriptItem[];
  lines: readonly VnDevtoolsSourceLine[];
  selectedLineId?: string;
  searchQuery: string;
  collapsed: boolean;
  width: number;
  layout: VnDevtoolsLayoutState;
  status: VnDevtoolsStatus;
  materializationMode: VnDebugMaterializationMode;
  materializationModeLocked: boolean;
  diagnostics: readonly VnDevtoolsDiagnostic[];
  summaries: VnDevtoolsRuntimeSummaries;
  decision?: VnDevtoolsDecision;
  hasUpdateBadge?: boolean;
  catalogDirty: boolean;
  actions: VnDevtoolsActions;
}

export interface VnDevtoolsDockProps {
  controller: VnDevtoolsController;
  className?: string;
}

export function clampVnDevtoolsWidth(width: number): number {
  if (!Number.isFinite(width)) return VN_DEVTOOLS_DEFAULT_WIDTH;
  return Math.min(VN_DEVTOOLS_MAX_WIDTH, Math.max(VN_DEVTOOLS_MIN_WIDTH, Math.round(width)));
}

export function clampVnDevtoolsPanelHeight(height: number): number {
  if (!Number.isFinite(height)) return VN_DEVTOOLS_DEFAULT_PANEL_HEIGHT;
  return Math.min(
    VN_DEVTOOLS_MAX_PANEL_HEIGHT,
    Math.max(VN_DEVTOOLS_MIN_PANEL_HEIGHT, Math.round(height))
  );
}

export function canPreviewVnDevtoolsLine(line: VnDevtoolsSourceLine): boolean {
  return line.previewability !== "blocked" && line.previewability !== "no-stable-result";
}
