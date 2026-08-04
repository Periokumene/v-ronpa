import type { AssetRequirement } from "@v-ronpa/contracts";
import type { LayeredCharacterPreloadPlan } from "@v-ronpa/layered-character";
import type { TextSpan } from "@v-ronpa/nani-parser";
import type { NaniDiagnosticDisposition } from "@v-ronpa/nani-runtime-compiler";

/** Browser-safe protocol shared by the Vite server plugin and the DEV controller. */
export const NANI_DEVTOOLS_VITE_UPDATE_EVENT = "v-ronpa:nani-devtools-update" as const;
export const NANI_DEVTOOLS_VITE_CATALOG_DIRTY_EVENT = "v-ronpa:nani-devtools-catalog-dirty" as const;
export const NANI_DEVTOOLS_VITE_SNAPSHOT_MODULE_ID = "virtual:v-ronpa-nani-devtools-snapshot" as const;

export type NaniDevtoolsScope = "production" | "development" | "test";

export interface NaniDevtoolsViteDiagnostic {
  source: "parser" | "compiler" | "catalog" | "entry" | "discovery" | "bridge";
  severity: "info" | "warning" | "error";
  disposition: NaniDiagnosticDisposition;
  message: string;
  code?: string;
  lineNumber?: number;
  columnNumber?: number;
  /** Absolute half-open UTF-16 offsets into the candidate sourceText. */
  span?: TextSpan;
}

export interface NaniDevtoolsDiscoveredSource {
  scope: NaniDevtoolsScope;
  scriptPath: string;
  sourceText: string;
  semanticRevision: string;
  executionDisposition: "runnable" | "fatal";
  diagnostics: readonly NaniDevtoolsViteDiagnostic[];
  metadata?: {
    scriptRevision: string;
    requirements: readonly AssetRequirement[];
    characterPreloadPlan: LayeredCharacterPreloadPlan;
  };
}

export interface NaniDevtoolsViteSnapshot {
  generation: number;
  entry: {
    id: string;
    initialScriptPath: string;
    startLabel?: string;
  };
  scripts: readonly NaniDevtoolsDiscoveredSource[];
}

/** Internal browser handshake shape derived from one full snapshot source. */
export interface NaniDevtoolsViteSourceCandidate {
  entryId: string;
  scope: NaniDevtoolsScope;
  scriptPath: string;
  sourceText: string;
  serverRevision: string | null;
  executionDisposition: "runnable" | "fatal";
  diagnostics: readonly NaniDevtoolsViteDiagnostic[];
}

export interface NaniDevtoolsViteUpdate extends NaniDevtoolsViteSourceCandidate {
  updateId: number;
}

export interface NaniDevtoolsViteCatalogDirty {
  generation: number;
  reason: "add" | "unlink" | "rename";
}
