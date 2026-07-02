import { describe, expect, it } from "vitest";
import { approximateCompilerDiagnosticRange, computeNaniDiagnostics, type CommandLoc } from "./diagnostics";

describe("diagnostics", () => {
  it("maps parser diagnostics using parser source locations", () => {
    const diagnostics = computeNaniDiagnostics("#Start\n#Start", "duplicate.nani");
    const duplicate = diagnostics.find((diagnostic) => diagnostic.message.includes("Duplicate label"));

    expect(duplicate).toMatchObject({
      source: "nani-parser",
      severity: "error",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 6 }
      }
    });
  });

  it("reports parser label reference diagnostics", () => {
    const diagnostics = computeNaniDiagnostics("@goto #Missing", "missing-label.nani");

    expect(diagnostics.some((diagnostic) => diagnostic.message === "Missing local label reference: #Missing")).toBe(
      true
    );
  });

  it("maps compiler diagnostics to the likely command line", () => {
    const diagnostics = computeNaniDiagnostics("@bogus value", "unknown-command.nani");
    const unknown = diagnostics.find((diagnostic) => diagnostic.source === "nani-compiler");

    expect(unknown).toMatchObject({
      code: "unknown-command",
      severity: "error",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: "@bogus value".length }
      }
    });
  });

  it("maps compiler parameter diagnostics to the likely command line", () => {
    const diagnostics = computeNaniDiagnostics("@bgm Piano volume:fast", "invalid-param.nani");
    const invalidParam = diagnostics.find((diagnostic) => diagnostic.message.includes("expected decimal"));

    expect(invalidParam).toMatchObject({
      source: "nani-compiler",
      code: "invalid-command-param",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: "@bgm Piano volume:fast".length }
      }
    });
  });

  it("falls back to the first line when compiler diagnostics cannot be matched", () => {
    const commandLocs: CommandLoc[] = [];
    const range = approximateCompilerDiagnosticRange({ message: "Unmapped compiler diagnostic." }, commandLocs, [""]);

    expect(range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 }
    });
  });

  it("surfaces high-signal parser diagnostics for command spacing and inline commands", () => {
    const diagnostics = computeNaniDiagnostics(
      ["@bgm Piano volume :0.8", "Felix: Hello [bogus] and [< speed:fast]"].join("\n"),
      "parser-diagnostics.nani"
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "nani-parser",
          severity: "warning",
          message: 'Parameter volume has whitespace before ":"; use volume:<value> so it is parsed as a parameter.'
        }),
        expect.objectContaining({
          source: "nani-parser",
          severity: "error",
          message: "Unsupported inline .nani command: [bogus]. Inline commands currently support [>] and [< speed:<decimal>]."
        }),
        expect.objectContaining({
          source: "nani-parser",
          severity: "error",
          message: "Inline print parameter speed expected decimal."
        })
      ])
    );
  });
});
