import type { AssetRegistryDiagnostic } from "@v-ronpa/asset-registry";
import type {
  MediaRuntimeDiagnostic,
  UiRuntimeDiagnostic,
  VnRuntimeTransactionDiagnostic
} from "@v-ronpa/app-vn-dispatch";
import type { VnSessionDiagnostics } from "@v-ronpa/app-vn-session";
import type { RuntimeScript } from "@v-ronpa/contracts";
import type { TextSpan } from "@v-ronpa/nani-parser";
import type { StoryStepperDiagnostic } from "@v-ronpa/story-engine";

export type VnRuntimeDiagnosticSource = "parser" | "compiler" | "story" | "transaction" | "media" | "ui" | "asset";

export interface VnRuntimeDiagnostic {
  source: VnRuntimeDiagnosticSource;
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  loc?: string;
  span?: TextSpan;
  commandId?: string;
}

type VnRuntimeParserDiagnostic = VnSessionDiagnostics["parser"][number];
type VnRuntimeCompilerDiagnostic = VnSessionDiagnostics["compiler"][number];

export interface CollectVnRuntimeDiagnosticsInput {
  mediaDiagnostics?: MediaRuntimeDiagnostic[];
  storyDiagnostics?: StoryStepperDiagnostic[];
  transactionDiagnostics?: VnRuntimeTransactionDiagnostic[];
  uiDiagnostics?: UiRuntimeDiagnostic[];
}

export const MAX_VN_RUNTIME_DIAGNOSTICS = 50;
export const INVALID_VN_START_LABEL_DIAGNOSTIC_CODE = "invalid-start-label";

export function createInitialVnRuntimeDiagnostics(
  parserDiagnostics: readonly VnRuntimeParserDiagnostic[],
  compilerDiagnostics: readonly VnRuntimeCompilerDiagnostic[]
): VnRuntimeDiagnostic[] {
  return limitVnRuntimeDiagnostics([
    ...parserDiagnostics.map(toVnParserDiagnostic),
    ...compilerDiagnostics.map(toVnCompilerDiagnostic)
  ]);
}

export function createVnRuntimeStartLabelDiagnostics(
  script: Pick<RuntimeScript, "labels" | "scriptPath">,
  startLabel?: string
): VnRuntimeDiagnostic[] {
  const normalized = normalizeVnRuntimeStartLabel(startLabel);
  if (!normalized || script.labels[normalized] !== undefined) return [];

  return [
    {
      source: "story",
      code: INVALID_VN_START_LABEL_DIAGNOSTIC_CODE,
      severity: "error",
      message: `VN start label "${normalized}" was not found in ${script.scriptPath}.`
    }
  ];
}

export function collectVnRuntimeDiagnostics({
  mediaDiagnostics = [],
  storyDiagnostics = [],
  transactionDiagnostics = [],
  uiDiagnostics = []
}: CollectVnRuntimeDiagnosticsInput): VnRuntimeDiagnostic[] {
  return [
    ...storyDiagnostics.map(toVnStoryDiagnostic),
    ...transactionDiagnostics.map(toVnTransactionDiagnostic),
    ...mediaDiagnostics.map(toVnMediaDiagnostic),
    ...uiDiagnostics.map(toVnUiDiagnostic)
  ];
}

export function limitVnRuntimeDiagnostics(
  diagnostics: VnRuntimeDiagnostic[],
  maxDiagnostics = MAX_VN_RUNTIME_DIAGNOSTICS
): VnRuntimeDiagnostic[] {
  return diagnostics.slice(-maxDiagnostics);
}

export function createVnRuntimeAssetDiagnostic(
  diagnostic: Pick<AssetRegistryDiagnostic, "message"> & {
    code?: string;
    severity?: "info" | "warning" | "error";
    id?: string;
    assetId?: string;
    capability?: string;
  }
): VnRuntimeDiagnostic {
  const assetId = diagnostic.assetId ?? diagnostic.id;
  const detail = [assetId, diagnostic.capability].filter(Boolean).join(" ");
  return {
    source: "asset",
    code: diagnostic.code ?? "asset-unresolved",
    severity: diagnostic.severity ?? "error",
    message: detail ? `${diagnostic.message} (${detail})` : diagnostic.message
  };
}

export function createVnMediaHandleMissingDiagnostic(message: string): VnRuntimeDiagnostic {
  return { source: "media", code: "media-handle-missing", severity: "info", message };
}

export function createVnMediaPortErrorDiagnostic(message: string): VnRuntimeDiagnostic {
  return { source: "media", code: "media-port-error", severity: "warning", message };
}

function toVnParserDiagnostic(diagnostic: VnRuntimeParserDiagnostic): VnRuntimeDiagnostic {
  return {
    source: "parser",
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    loc: formatDiagnosticLocation(diagnostic.loc),
    span: diagnostic.span
  };
}

function normalizeVnRuntimeStartLabel(startLabel: string | undefined): string {
  if (!startLabel) return "";
  const trimmed = startLabel.trim();
  const withoutPrefix = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return withoutPrefix.trim();
}

function toVnCompilerDiagnostic(diagnostic: VnRuntimeCompilerDiagnostic): VnRuntimeDiagnostic {
  return {
    source: "compiler",
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    loc: formatDiagnosticLocation(diagnostic.loc),
    span: diagnostic.span
  };
}

function toVnStoryDiagnostic(diagnostic: StoryStepperDiagnostic): VnRuntimeDiagnostic {
  return {
    source: "story",
    code: diagnostic.code,
    severity: diagnostic.severity ?? "warning",
    message: diagnostic.message
  };
}

function toVnTransactionDiagnostic(diagnostic: VnRuntimeTransactionDiagnostic): VnRuntimeDiagnostic {
  return {
    source: "transaction",
    code: diagnostic.code,
    severity: diagnostic.code === "normalized-pixi-params" ? "warning" : "error",
    message: diagnostic.message,
    commandId: diagnostic.commandId
  };
}

function toVnMediaDiagnostic(diagnostic: MediaRuntimeDiagnostic): VnRuntimeDiagnostic {
  return {
    source: "media",
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    commandId: diagnostic.commandId
  };
}

function toVnUiDiagnostic(diagnostic: UiRuntimeDiagnostic): VnRuntimeDiagnostic {
  return {
    source: "ui",
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    commandId: diagnostic.commandId
  };
}

function formatDiagnosticLocation(loc: { scriptPath: string; line: number; column: number }): string {
  return `${loc.scriptPath}:${loc.line}:${loc.column}`;
}
