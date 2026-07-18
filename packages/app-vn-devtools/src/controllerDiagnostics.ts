import type { VnDevtoolsDiagnostic } from "./types";

/** Keeps one visible diagnostic when server and browser inspection report the same issue. */
export function mergeVnDevtoolsDiagnostics(
  ...groups: readonly (readonly VnDevtoolsDiagnostic[])[]
): VnDevtoolsDiagnostic[] {
  const seen = new Set<string>();
  const merged: VnDevtoolsDiagnostic[] = [];
  for (const diagnostic of groups.flat()) {
    const identity = JSON.stringify([
      diagnostic.severity,
      diagnostic.code ?? null,
      diagnostic.lineNumber ?? null,
      diagnostic.message
    ]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    merged.push(diagnostic);
  }
  return merged;
}
