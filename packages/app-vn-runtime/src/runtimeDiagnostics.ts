import type { AssetRegistryDiagnostic } from "@v-ronpa/asset-registry";
import type {
  MediaRuntimeDiagnostic,
  UiRuntimeDiagnostic,
  VnRuntimeTransactionDiagnostic
} from "@v-ronpa/app-vn-dispatch";
import type { StoryStepperDiagnostic } from "@v-ronpa/story-engine";

export type VnRuntimeDiagnosticSource = "parser" | "compiler" | "story" | "transaction" | "media" | "ui" | "asset";

export interface VnRuntimeDiagnostic {
  source: VnRuntimeDiagnosticSource;
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  loc?: string;
  commandId?: string;
}

export interface VnRuntimeParserDiagnosticLike {
  severity: "info" | "warning" | "error";
  message: string;
  loc?: { scriptPath: string; line: number; column: number };
}

export interface VnRuntimeCompilerDiagnosticLike {
  code: string;
  severity?: "info" | "warning" | "error";
  message: string;
}

export interface CollectVnRuntimeDiagnosticsInput {
  mediaDiagnostics?: MediaRuntimeDiagnostic[];
  storyDiagnostics?: StoryStepperDiagnostic[];
  transactionDiagnostics?: VnRuntimeTransactionDiagnostic[];
  uiDiagnostics?: UiRuntimeDiagnostic[];
}

export const MAX_VN_RUNTIME_DIAGNOSTICS = 50;

export function createInitialVnRuntimeDiagnostics(
  parserDiagnostics: VnRuntimeParserDiagnosticLike[],
  compilerDiagnostics: VnRuntimeCompilerDiagnosticLike[]
): VnRuntimeDiagnostic[] {
  return limitVnRuntimeDiagnostics([
    ...parserDiagnostics.map(toVnParserDiagnostic),
    ...compilerDiagnostics.map(toVnCompilerDiagnostic)
  ]);
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
    kind?: string;
  }
): VnRuntimeDiagnostic {
  const assetId = diagnostic.assetId ?? diagnostic.id;
  const detail = [assetId, diagnostic.kind].filter(Boolean).join(" ");
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

function toVnParserDiagnostic(diagnostic: VnRuntimeParserDiagnosticLike): VnRuntimeDiagnostic {
  return {
    source: "parser",
    code: "parser-diagnostic",
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.loc ? { loc: formatDiagnosticLocation(diagnostic.loc) } : {})
  };
}

function toVnCompilerDiagnostic(diagnostic: VnRuntimeCompilerDiagnosticLike): VnRuntimeDiagnostic {
  return {
    source: "compiler",
    code: diagnostic.code,
    severity: diagnostic.severity ?? "warning",
    message: diagnostic.message
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
    severity: "error",
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

function formatDiagnosticLocation(loc: NonNullable<VnRuntimeParserDiagnosticLike["loc"]>): string {
  return `${loc.scriptPath}:${loc.line}:${loc.column}`;
}
