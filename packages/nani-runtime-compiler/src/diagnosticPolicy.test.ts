import { describe, expect, it } from "vitest";
import { classifyNaniDiagnosticDisposition } from "./diagnosticPolicy";

describe("classifyNaniDiagnosticDisposition", () => {
  it("allows only the two compiler command errors under the development policy", () => {
    for (const code of ["unknown-command", "invalid-command-param"]) {
      expect(classifyNaniDiagnosticDisposition(
        { source: "compiler", code, severity: "error" },
        "allow-recoverable-command-errors"
      )).toBe("recoverable");
    }
  });

  it("keeps the same command errors fatal under strict policy", () => {
    expect(classifyNaniDiagnosticDisposition(
      { source: "compiler", code: "unknown-command", severity: "error" },
      "strict"
    )).toBe("fatal");
  });

  it("defaults new, parser, catalog, and entry errors to fatal", () => {
    for (const diagnostic of [
      { source: "compiler", code: "future-error", severity: "error" },
      { source: "parser", code: "invalid-command-param", severity: "error" },
      { source: "catalog", code: "endpoint-script-missing", severity: "error" },
      { source: "entry", code: "invalid-start-label", severity: "error" }
    ] as const) {
      expect(classifyNaniDiagnosticDisposition(
        diagnostic,
        "allow-recoverable-command-errors"
      )).toBe("fatal");
    }
  });

  it("classifies every non-error diagnostic as advisory", () => {
    expect(classifyNaniDiagnosticDisposition(
      { source: "compiler", code: "unknown-command", severity: "warning" },
      "strict"
    )).toBe("advisory");
  });
});
