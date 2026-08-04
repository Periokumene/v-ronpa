import { describe, expect, it } from "vitest";
import { scanCommandParts } from "./commandScanner";
import { parseScenario } from "./index";
import { spanForSourcedRange } from "./sourcedText";
import type { CommandIR } from "./types";

describe("command syntax provenance", () => {
  it("shields quoted colons while preserving legacy cooked lists and flags", () => {
    const source = [
      '@print "speaker: text"',
      '@print "https://example.test/a:b"',
      '@print "Hello, world"',
      '@print text:"A:B,C"',
      '@print "wow!"',
      '@print "!wow"',
      "@print {foo:bar}",
      '@print "{a,b}"',
      '@set value:"{foo:bar}"'
    ].join("\n");
    const result = parseScenario({ sourceText: source, scriptPath: "quoted-structure.nani" });
    const commands = result.scenario.statements as CommandIR[];

    expect(result.diagnostics).toEqual([]);
    expect(commands[0]?.primary).toEqual({ type: "string", value: "speaker: text" });
    expect(commands[1]?.primary).toEqual({ type: "string", value: "https://example.test/a:b" });
    expect(commands[2]?.primary).toEqual({
      type: "list",
      value: [
        { type: "string", value: "Hello" },
        { type: "string", value: " world" }
      ]
    });
    expect(commands[2]?.args[0]).toMatchObject({
      kind: "value",
      value: { type: "list" }
    });
    expect(commands[3]?.params.text).toEqual({
      type: "list",
      value: [
        { type: "string", value: "A:B" },
        { type: "string", value: "C" }
      ]
    });
    expect(commands[3]?.args[0]).toMatchObject({ kind: "param", key: "text" });
    expect(commands[4]?.primary).toBeUndefined();
    expect(commands[4]?.flags).toEqual({ wow: true });
    expect(commands[5]?.primary).toBeUndefined();
    expect(commands[5]?.flags).toEqual({ wow: false });
    expect(commands[6]?.primary).toEqual({ type: "expression", source: "foo:bar" });
    expect(commands[7]?.primary).toEqual({ type: "expression", source: "a,b" });
    expect(commands[8]?.params.value).toEqual({ type: "expression", source: "foo:bar" });
    expect(
      source.slice(
        result.sourceMap.statements[8]?.command?.arguments[0]?.valueSpan?.start,
        result.sourceMap.statements[8]?.command?.arguments[0]?.valueSpan?.end
      )
    ).toBe("{foo:bar}");

    const quotedListSource = result.sourceMap.statements[2]?.command?.arguments[0];
    const quotedParamSource = result.sourceMap.statements[3]?.command?.arguments[0];
    expect(quotedListSource?.itemSpans.map((span) => source.slice(span.start, span.end))).toEqual(["Hello", "world"]);
    expect(quotedParamSource?.itemSpans.map((span) => source.slice(span.start, span.end))).toEqual(["A:B", "C"]);
    expect(source.slice(quotedParamSource?.valueSpan?.start, quotedParamSource?.valueSpan?.end)).toBe("A:B,C");
  });

  it("preserves structural lists and multi-colon named metadata", () => {
    const source = [
      "@char Ema.Happy,ArmL1,ArmR2",
      "@inback variant:framed-room:night",
      '@showUI uINames:"dialog, inventory,toastLayer"'
    ].join("\n");
    const result = parseScenario({ sourceText: source, scriptPath: "structural-list.nani" });
    const char = result.scenario.statements[0] as CommandIR;
    const background = result.scenario.statements[1] as CommandIR;
    const showUi = result.scenario.statements[2] as CommandIR;

    expect(result.diagnostics).toEqual([]);
    expect(char.primary).toEqual({
      type: "list",
      value: [
        { type: "string", value: "Ema.Happy" },
        { type: "string", value: "ArmL1" },
        { type: "string", value: "ArmR2" }
      ]
    });
    expect(result.sourceMap.statements[0]?.command?.arguments[0]?.itemSpans.map((span) => source.slice(span.start, span.end)))
      .toEqual(["Ema.Happy", "ArmL1", "ArmR2"]);
    expect(background.params).toEqual({
      variant: { type: "string", value: "framed-room:night" }
    });
    expect(showUi.params.uINames).toEqual({
      type: "list",
      value: [
        { type: "string", value: "dialog" },
        { type: "string", value: " inventory" },
        { type: "string", value: "toastLayer" }
      ]
    });
    expect(result.sourceMap.statements[2]?.command?.arguments[0]?.itemSpans.map((span) => source.slice(span.start, span.end)))
      .toEqual(["dialog", "inventory", "toastLayer"]);
    expect("assets" in result.scenario).toBe(false);
  });

  it("maps escaped quotes and backslashes to their complete raw escape spans", () => {
    const source = 'text:"say \\"hi\\" at C:\\\\temp"';
    const scan = scanCommandParts(source, { start: 0, end: source.length });
    const part = scan.parts[0];
    if (!part) throw new Error("Expected one scanned command part.");

    expect(scan.diagnostics).toEqual([]);
    expect(part.value.text).toBe('text:say "hi" at C:\\temp');
    expect(part.structuralColonOffset).toBe(4);

    const quoteOffset = part.value.text.indexOf('"');
    const slashOffset = part.value.text.indexOf("\\", quoteOffset + 1);
    const quoteSpan = spanForSourcedRange(part.value, quoteOffset, quoteOffset + 1);
    const slashSpan = spanForSourcedRange(part.value, slashOffset, slashOffset + 1);
    expect(source.slice(quoteSpan.start, quoteSpan.end)).toBe('\\"');
    expect(source.slice(slashSpan.start, slashSpan.end)).toBe("\\\\");
  });
});
