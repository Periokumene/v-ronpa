import type { RuntimeScript, VnEntryDef, VnRuntimeScriptCatalog, VnRuntimeScriptSource } from "@v-ronpa/contracts";
import { createVnSession, type VnSessionState } from "@v-ronpa/app-vn-session";
import {
  classifyNaniDiagnosticDisposition,
  linkRuntimeScriptCatalog,
  type NaniSourceDiagnosticPolicy,
  type RuntimeScriptCatalogDiagnostic
} from "@v-ronpa/nani-runtime-compiler";

export interface CompiledVnRuntimeScriptRecord {
  source: VnRuntimeScriptSource;
  script: RuntimeScript;
  bootSession: VnSessionState;
  hasFatalSourceDiagnostics: boolean;
}

export interface CompiledVnRuntimeCatalog {
  records: readonly CompiledVnRuntimeScriptRecord[];
  recordsByPath: ReadonlyMap<string, CompiledVnRuntimeScriptRecord>;
  diagnostics: readonly RuntimeScriptCatalogDiagnostic[];
}

export function compileVnRuntimeCatalog(
  entry: Pick<VnEntryDef, "initialScriptPath" | "startLabel">,
  catalog: VnRuntimeScriptCatalog,
  sourceDiagnosticPolicy: NaniSourceDiagnosticPolicy
): CompiledVnRuntimeCatalog {
  const records = catalog.map((source) => {
    const boot = createVnSession({
      scriptPath: source.scriptPath,
      sourceText: source.sourceText,
      ...(source.scriptPath === entry.initialScriptPath && entry.startLabel
        ? { startLabel: entry.startLabel }
        : {})
    });
    const hasFatalSourceDiagnostics = [
      ...boot.session.diagnostics.parser.map((diagnostic) => ({ source: "parser" as const, ...diagnostic })),
      ...boot.session.diagnostics.compiler.map((diagnostic) => ({ source: "compiler" as const, ...diagnostic }))
    ].some((diagnostic) =>
      classifyNaniDiagnosticDisposition(diagnostic, sourceDiagnosticPolicy) === "fatal"
    );
    return { source, script: boot.session.script, bootSession: boot.session, hasFatalSourceDiagnostics };
  });
  const linked = linkRuntimeScriptCatalog(entry, records.map((record) => record.script));
  const recordsByPath = new Map<string, CompiledVnRuntimeScriptRecord>();
  for (const record of records) {
    if (!recordsByPath.has(record.source.scriptPath)) recordsByPath.set(record.source.scriptPath, record);
  }
  return { records, recordsByPath, diagnostics: linked.diagnostics };
}
