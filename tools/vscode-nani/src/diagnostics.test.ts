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

  it("does not report showUI or hideUI wait as an unsupported compiler param", () => {
    const diagnostics = computeNaniDiagnostics("@hideUI commandBar wait!", "ui-wait.nani");

    expect(diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "nani-compiler",
          code: "unsupported-command-param",
          message: expect.stringContaining("@hideUI accepts wait!:boolean")
        })
      ])
    );
    expect(diagnostics).toEqual([]);
  });

  it("reports invalid runtime UI targets with VSCode-only semantic diagnostics", () => {
    const source = "@hideUI hud wait!";
    const diagnostics = computeNaniDiagnostics(source, "invalid-ui-target.nani");

    expect(diagnostics).toEqual([
      {
        source: "vscode-nani",
        code: "unsupported-ui-target",
        severity: "warning",
        message: "@hideUI target hud is not a v1 runtime UI surface; wait! will not create a UI presentation wait.",
        range: {
          start: { line: 0, character: source.indexOf("hud") },
          end: { line: 0, character: source.indexOf("hud") + "hud".length }
        }
      }
    ]);
  });

  it("reports only invalid entries in comma-list UI target params", () => {
    const source = "@showUI uINames:dialog,hud wait!";
    const diagnostics = computeNaniDiagnostics(source, "invalid-ui-target-list.nani");

    expect(diagnostics).toEqual([
      expect.objectContaining({
        source: "vscode-nani",
        code: "unsupported-ui-target",
        message: "@showUI target hud is not a v1 runtime UI surface; wait! will not create a UI presentation wait.",
        range: {
          start: { line: 0, character: source.indexOf("hud") },
          end: { line: 0, character: source.indexOf("hud") + "hud".length }
        }
      })
    ]);
  });

  it("still extracts invalid comma-list entries when target also has compiler type diagnostics", () => {
    const source = "@showUI target:dialog,hud wait!";
    const diagnostics = computeNaniDiagnostics(source, "invalid-ui-target-string-list.nani");

    expect(diagnostics.filter((diagnostic) => diagnostic.source === "vscode-nani")).toEqual([
      expect.objectContaining({
        source: "vscode-nani",
        code: "unsupported-ui-target",
        message: "@showUI target hud is not a v1 runtime UI surface; wait! will not create a UI presentation wait.",
        range: {
          start: { line: 0, character: source.indexOf("hud") },
          end: { line: 0, character: source.indexOf("hud") + "hud".length }
        }
      })
    ]);
  });

  it("skips UI target semantic diagnostics for expression targets", () => {
    const diagnostics = computeNaniDiagnostics("@showUI target:{uiTarget} wait!", "expression-ui-target.nani");

    expect(diagnostics.filter((diagnostic) => diagnostic.source === "vscode-nani")).toEqual([]);
  });
});
