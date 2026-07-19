import { describe, expect, it } from "vitest";
import { parseScenario } from "@v-ronpa/nani-parser";
import { compileRuntimeScript } from "@v-ronpa/nani-runtime-compiler";
import {
  INVALID_VN_START_LABEL_DIAGNOSTIC_CODE,
  createInitialVnRuntimeDiagnostics,
  collectVnRuntimeDiagnostics,
  createVnRuntimeStartLabelDiagnostics
} from "./runtimeDiagnostics";

describe("VN runtime diagnostics", () => {
  it("preserves exact parser/compiler diagnostic identities and provenance", () => {
    const parserSource = "Felix: bad|#|";
    const parserResult = parseScenario({ sourceText: parserSource, scriptPath: "parser.nani" });
    const compilerSource = "@bgm Piano volume:fast";
    const compilerParsed = parseScenario({ sourceText: compilerSource, scriptPath: "compiler.nani" });
    const compilerResult = compileRuntimeScript(compilerParsed);

    expect(createInitialVnRuntimeDiagnostics(parserResult.diagnostics, compilerResult.diagnostics)).toEqual([
      {
        source: "parser",
        code: "invalid-text-id",
        severity: "error",
        message: "Invalid textId marker: (empty)",
        loc: "parser.nani:1:1",
        span: { start: 10, end: 13 }
      },
      {
        source: "compiler",
        code: "invalid-command-param",
        severity: "error",
        message: "@bgm parameter volume expected decimal.",
        loc: "compiler.nani:1:1",
        span: { start: 18, end: 22 }
      }
    ]);
  });

  it("does not report diagnostics for an existing start label", () => {
    expect(
      createVnRuntimeStartLabelDiagnostics(
        {
          scriptPath: "opening.nani",
          labels: { Start: 0, DBG_RAIN: 3 }
        },
        "DBG_RAIN"
      )
    ).toEqual([]);
  });

  it("reports an invalid start label without parser or compiler diagnostics", () => {
    expect(
      createVnRuntimeStartLabelDiagnostics(
        {
          scriptPath: "opening.nani",
          labels: { Start: 0 }
        },
        "#DBG_RAIN"
      )
    ).toEqual([
      {
        source: "story",
        code: INVALID_VN_START_LABEL_DIAGNOSTIC_CODE,
        severity: "error",
        message: 'VN start label "DBG_RAIN" was not found in opening.nani.'
      }
    ]);
  });

  it("treats deterministic Pixi normalization as degraded warning while unresolved projection stays fatal", () => {
    expect(collectVnRuntimeDiagnostics({
      transactionDiagnostics: [
        { code: "normalized-pixi-params", commandId: "rain", message: "clamped" },
        { code: "unresolved-runtime-expression", commandId: "rain", message: "unresolved" }
      ]
    })).toMatchObject([
      { code: "normalized-pixi-params", severity: "warning" },
      { code: "unresolved-runtime-expression", severity: "error" }
    ]);
  });
});
