import { describe, expect, it } from "vitest";
import {
  assertValidNaniDiagnosticSpan,
  computeNaniDiagnostics,
  type NaniDiagnostic
} from "./diagnostics";

describe("diagnostics", () => {
  it("keeps a duplicate-label parser diagnostic on the duplicate label name", () => {
    const source = "#Start\n#Start";
    const diagnostic = requiredDiagnostic(
      computeNaniDiagnostics(source, "duplicate.nani"),
      (candidate) => candidate.message.includes("Duplicate label")
    );

    expect(diagnostic).toMatchObject({ source: "nani", code: "duplicate-label", severity: "error" });
    expectExactSlice(source, diagnostic, "Start", source.lastIndexOf("Start"));
  });

  it("keeps a missing-label parser diagnostic on the referenced label", () => {
    const source = "@goto #Missing";
    const diagnostic = requiredDiagnostic(
      computeNaniDiagnostics(source, "missing-label.nani"),
      (candidate) => candidate.message === "Missing local label reference: #Missing"
    );

    expect(diagnostic).toMatchObject({ source: "nani", code: "missing-local-label" });
    expectExactSlice(source, diagnostic, "#Missing");
  });

  it("keeps inline parser diagnostics on their precise offending lexemes", () => {
    const source = "Felix: Hello [bogus] and [< speed:fast]";
    const diagnostics = computeNaniDiagnostics(source, "inline-errors.nani");
    const unsupported = requiredDiagnostic(
      diagnostics,
      (candidate) => candidate.message.startsWith("Unsupported inline .nani command")
    );
    const invalidSpeed = requiredDiagnostic(
      diagnostics,
      (candidate) => candidate.message === "Inline print parameter speed expected decimal."
    );

    expectExactSlice(source, unsupported, "bogus");
    expectExactSlice(source, invalidSpeed, "fast");
    expect(unsupported.code).toBe("unsupported-inline-command");
    expect(invalidSpeed.code).toBe("invalid-inline-command-value");
  });

  it("projects quoted and escaped rich-text diagnostics back to the original value", () => {
    const source = String.raw`@print text:"She said \"hi\" <font color=not-a-color>bad</font>"`;
    const diagnostic = requiredDiagnostic(
      computeNaniDiagnostics(source, "quoted-rich-text.nani"),
      (candidate) => candidate.message.includes("Invalid rich text font color")
    );

    expect(diagnostic).toMatchObject({ source: "nani", code: "invalid-rich-text", severity: "warning" });
    expectExactSlice(source, diagnostic, "not-a-color");
  });

  it("keeps an unknown-command compiler diagnostic on the command name", () => {
    const source = "@bogus value";
    const diagnostic = requiredDiagnostic(
      computeNaniDiagnostics(source, "unknown-command.nani"),
      (candidate) => candidate.code === "unknown-command"
    );

    expect(diagnostic).toMatchObject({ source: "nani", code: "unknown-command", severity: "error" });
    expectExactSlice(source, diagnostic, "bogus");
  });

  it("keeps an invalid-value compiler diagnostic on the value", () => {
    const source = "@bgm Piano volume:fast";
    const diagnostic = requiredDiagnostic(
      computeNaniDiagnostics(source, "invalid-param.nani"),
      (candidate) => candidate.code === "invalid-command-param" && candidate.message.includes("expected decimal")
    );

    expect(diagnostic).toMatchObject({ source: "nani", severity: "error" });
    expectExactSlice(source, diagnostic, "fast");
  });

  it("uses original UTF-16 offsets across emoji and CRLF", () => {
    const source = "Narrator: 😀\r\n@bgm Piano volume:fast";
    const diagnostic = requiredDiagnostic(
      computeNaniDiagnostics(source, "utf16-crlf.nani"),
      (candidate) => candidate.code === "invalid-command-param" && candidate.message.includes("expected decimal")
    );

    expectExactSlice(source, diagnostic, "fast");
    expect(diagnostic.span.start).toBe(source.length - "fast".length);
  });

  it("does not confuse repeated command text with the offending occurrence", () => {
    const source = ["@bgm Piano volume:0.7", "@bgm Piano volume:fast"].join("\n");
    const diagnostic = requiredDiagnostic(
      computeNaniDiagnostics(source, "repeated-command.nani"),
      (candidate) => candidate.code === "invalid-command-param" && candidate.message.includes("expected decimal")
    );

    expectExactSlice(source, diagnostic, "fast", source.lastIndexOf("fast"));
  });

  it("does not report valid showUI or hideUI wait syntax", () => {
    expect(computeNaniDiagnostics("@hideUI commandBar wait!", "ui-wait.nani")).toEqual([]);
  });

  it("uses compiler-owned exact list-item spans for unsupported runtime UI targets", () => {
    const source = "@showUI uINames:dialog,hud,toastLayer wait!";
    const diagnostics = computeNaniDiagnostics(source, "invalid-ui-target.nani");
    const diagnostic = requiredDiagnostic(
      diagnostics,
      (candidate) => candidate.code === "unsupported-ui-target"
    );

    expect(diagnostic).toMatchObject({ source: "nani", severity: "warning" });
    expectExactSlice(source, diagnostic, "hud");
    expect(diagnostics.filter((candidate) => candidate.code === "unsupported-ui-target")).toHaveLength(1);
  });

  it("keeps the UI item warning when catalog validation rejects the same command", () => {
    const source = "@showUI target:dialog,hud wait!";
    const diagnostics = computeNaniDiagnostics(source, "invalid-ui-list.nani");

    expect(diagnostics.map(({ code }) => code)).toEqual([
      "invalid-command-param",
      "unsupported-ui-target"
    ]);
    expectExactSlice(
      source,
      requiredDiagnostic(diagnostics, (candidate) => candidate.code === "unsupported-ui-target"),
      "hud"
    );
  });

  it("uses the compiler-owned argument span for an ignored promoted primary", () => {
    const source = "@flash color:#ffffff time:0.05 wait!";
    const diagnostic = requiredDiagnostic(
      computeNaniDiagnostics(source, "ignored-primary.nani"),
      (candidate) => candidate.code === "ignored-promoted-primary"
    );

    expect(diagnostic).toMatchObject({ source: "nani", severity: "warning" });
    expectExactSlice(source, diagnostic, "time:0.05");
  });

  it("does not flag colon-form resource IDs as ignored primary values", () => {
    for (const source of ["@bgm bgm/main", "@sfx sfx/door", "@back bg/room"]) {
      expect(
        computeNaniDiagnostics(source, "resource-primary.nani").filter(
          (diagnostic) => diagnostic.code === "ignored-promoted-primary"
        )
      ).toEqual([]);
    }
  });

  it("preserves compiler diagnostic codes and exact command/argument spans", () => {
    const source = ["@voice voice/line", "@sfx sfx/door wait!"].join("\n");
    const diagnostics = computeNaniDiagnostics(source, "compat.nani");
    const declaredOnly = requiredDiagnostic(
      diagnostics,
      (candidate) => candidate.code === "declared-only-command"
    );
    const unsupportedParam = requiredDiagnostic(
      diagnostics,
      (candidate) => candidate.code === "unsupported-command-param"
    );

    expectExactSlice(source, declaredOnly, "voice");
    expectExactSlice(source, unsupportedParam, "wait!");
    expect(diagnostics.every((diagnostic) => diagnostic.source === "nani")).toBe(true);
  });

  it("rejects empty, fractional, and out-of-bounds spans before editor publication", () => {
    const diagnostic: NaniDiagnostic = {
      code: "invalid-command-param",
      message: "invalid",
      severity: "error",
      source: "nani",
      span: { start: 1, end: 2 }
    };

    expect(() => assertValidNaniDiagnosticSpan(diagnostic, 2)).not.toThrow();
    for (const span of [
      { start: 1, end: 1 },
      { start: -1, end: 1 },
      { start: 0.5, end: 1 },
      { start: 0, end: 3 }
    ]) {
      expect(() => assertValidNaniDiagnosticSpan({ ...diagnostic, span }, 2)).toThrow(
        /Invalid diagnostic span/u
      );
    }
  });
});

function requiredDiagnostic(
  diagnostics: NaniDiagnostic[],
  predicate: (diagnostic: NaniDiagnostic) => boolean
): NaniDiagnostic {
  const diagnostic = diagnostics.find(predicate);
  expect(diagnostic).toBeDefined();
  return diagnostic as NaniDiagnostic;
}

function expectExactSlice(
  source: string,
  diagnostic: NaniDiagnostic,
  expected: string,
  expectedStart = source.indexOf(expected)
): void {
  expect(source.slice(diagnostic.span.start, diagnostic.span.end)).toBe(expected);
  expect(diagnostic.span).toEqual({ start: expectedStart, end: expectedStart + expected.length });
}
