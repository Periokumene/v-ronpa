import type {
  VnEntryDef,
  VnRuntimeScriptCatalog,
  VnRuntimeScriptSource
} from "@v-ronpa/contracts";
import {
  inspectVnDebugEntry,
  type VnDebugEntryInspection
} from "@v-ronpa/app-vn-runtime/debug";
import { linkRuntimeScriptCatalog } from "@v-ronpa/nani-runtime-compiler";

export interface VnDevtoolsScriptCandidate {
  entry: VnEntryDef;
  catalog: VnRuntimeScriptCatalog;
  source: VnRuntimeScriptSource;
}

export type VnDevtoolsCandidateCatalogValidation =
  | { ok: true }
  | {
      ok: false;
      code: "invalid-source" | "revision-mismatch" | "catalog-link-error";
      message: string;
    };

export function createVnDevtoolsScriptCandidate(
  entry: VnEntryDef,
  catalog: VnRuntimeScriptCatalog,
  scriptPath: string
): VnDevtoolsScriptCandidate | undefined {
  const source = catalog.find((candidate) => candidate.scriptPath === scriptPath);
  return source ? { entry, catalog, source } : undefined;
}

export function replaceVnDevtoolsCandidateSource(
  candidate: VnDevtoolsScriptCandidate,
  source: VnRuntimeScriptSource
): VnDevtoolsScriptCandidate {
  const replaced = candidate.catalog.some((item) => item.scriptPath === source.scriptPath);
  const catalog = replaced
    ? candidate.catalog.map((item) => item.scriptPath === source.scriptPath ? source : item)
    : [...candidate.catalog, source];
  return { entry: candidate.entry, catalog, source };
}

export function candidateFromVnDebugInspection(
  installed: VnDevtoolsScriptCandidate,
  inspection: VnDebugEntryInspection
): VnDevtoolsScriptCandidate {
  return replaceVnDevtoolsCandidateSource(installed, inspection.source);
}

/**
 * Browser-side mutation guard for the complete candidate catalog. A script is
 * never adopted merely because its isolated parser/compiler inspection passed:
 * every record revision and every static cross-script endpoint must agree at
 * the same transaction boundary.
 */
export async function validateVnDevtoolsCandidateCatalog(
  candidate: VnDevtoolsScriptCandidate
): Promise<VnDevtoolsCandidateCatalogValidation> {
  const inspections = await Promise.all(
    candidate.catalog.map((source) => inspectVnDebugEntry(candidate.entry, source))
  );
  const invalid = inspections.find((inspection) => !inspection.canMaterialize);
  if (invalid) {
    return {
      ok: false,
      code: "invalid-source",
      message: `Candidate catalog script '${invalid.source.scriptPath}' contains parser or compiler errors.`
    };
  }
  const revisionMismatch = inspections.find((inspection) => !inspection.declaredRevisionMatches);
  if (revisionMismatch) {
    return {
      ok: false,
      code: "revision-mismatch",
      message: `Candidate catalog script '${revisionMismatch.source.scriptPath}' does not match its declared semantic revision.`
    };
  }
  const linked = linkRuntimeScriptCatalog(candidate.entry, inspections.map((inspection) => inspection.script));
  const diagnostic = linked.diagnostics[0];
  return diagnostic
    ? { ok: false, code: "catalog-link-error", message: diagnostic.message }
    : { ok: true };
}
