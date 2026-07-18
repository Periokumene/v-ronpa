/** Browser-safe protocol shared by the Vite server plugin and the DEV controller. */
export const NANI_DEVTOOLS_VITE_UPDATE_EVENT = "v-ronpa:nani-devtools-update" as const;
export const NANI_DEVTOOLS_VITE_INITIAL_MODULE_ID = "virtual:v-ronpa-nani-devtools-initial" as const;

export interface NaniDevtoolsViteDiagnostic {
  source: "parser" | "compiler" | "bridge";
  severity: "info" | "warning" | "error";
  message: string;
  code?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface NaniDevtoolsViteCandidate {
  entryId: string;
  scriptPath: string;
  sourceText: string;
  serverRevision: string | null;
  diagnostics: readonly NaniDevtoolsViteDiagnostic[];
}

/** Server-authored source snapshot used to authorize the first browser install. */
export type NaniDevtoolsViteInitialCandidate = NaniDevtoolsViteCandidate;

export interface NaniDevtoolsViteUpdate extends NaniDevtoolsViteCandidate {
  updateId: number;
}
