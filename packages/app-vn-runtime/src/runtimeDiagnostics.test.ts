import { describe, expect, it } from "vitest";
import {
  INVALID_VN_START_LABEL_DIAGNOSTIC_CODE,
  createVnRuntimeStartLabelDiagnostics
} from "./runtimeDiagnostics";

describe("VN runtime diagnostics", () => {
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
});
