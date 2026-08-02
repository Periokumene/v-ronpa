export type NaniDiagnosticDisposition = "advisory" | "recoverable" | "fatal";

export type NaniSourceDiagnosticPolicy =
  | "strict"
  | "allow-recoverable-command-errors";

export type NaniDiagnosticSource = "parser" | "compiler" | "catalog" | "entry" | "discovery";

export interface NaniDiagnosticClassificationInput {
  source: NaniDiagnosticSource;
  code: string;
  severity: "info" | "warning" | "error";
}

const recoverableCompilerErrorCodes = new Set([
  "unknown-command",
  "invalid-command-param"
]);

/**
 * The one authority for deciding whether a Nani source diagnostic may still
 * produce executable runtime content. Unknown and newly added error codes are
 * deliberately fatal until a regression test explicitly promotes them.
 */
export function classifyNaniDiagnosticDisposition(
  diagnostic: NaniDiagnosticClassificationInput,
  policy: NaniSourceDiagnosticPolicy
): NaniDiagnosticDisposition {
  if (diagnostic.severity !== "error") return "advisory";
  if (
    policy === "allow-recoverable-command-errors"
    && diagnostic.source === "compiler"
    && recoverableCompilerErrorCodes.has(diagnostic.code)
  ) {
    return "recoverable";
  }
  return "fatal";
}

export function hasFatalNaniDiagnostics(
  diagnostics: readonly NaniDiagnosticClassificationInput[],
  policy: NaniSourceDiagnosticPolicy
): boolean {
  return diagnostics.some(
    (diagnostic) => classifyNaniDiagnosticDisposition(diagnostic, policy) === "fatal"
  );
}

export function hasRecoverableNaniDiagnostics(
  diagnostics: readonly NaniDiagnosticClassificationInput[],
  policy: NaniSourceDiagnosticPolicy
): boolean {
  return diagnostics.some(
    (diagnostic) => classifyNaniDiagnosticDisposition(diagnostic, policy) === "recoverable"
  );
}
