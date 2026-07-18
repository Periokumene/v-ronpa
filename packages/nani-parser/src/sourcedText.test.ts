import { describe, expect, it } from "vitest";
import { scanCommandParts } from "./commandScanner";
import { parseScenario, type TextIR } from "./index";
import {
  appendSourcedUnit,
  concatSourcedText,
  emptySourcedText,
  identitySourcedText,
  removeSourcedRanges,
  sliceSourcedText,
  spanForSourcedRange
} from "./sourcedText";

describe("sourced text projection", () => {
  it("keeps identity text in one segment across emoji and combining characters", () => {
    const text = "A😀e\u0301Z";
    const source = `--${text}++`;
    const projected = identitySourcedText(source, { start: 2, end: 2 + text.length });
    const emojiStart = text.indexOf("😀");
    const combiningStart = text.indexOf("e\u0301");

    expect(projected.text).toBe(text);
    expect(projected.segments).toEqual([{
      outputStart: 0,
      outputEnd: text.length,
      sourceStart: 2,
      sourceEnd: 2 + text.length,
      kind: "identity"
    }]);
    expect(spanForSourcedRange(projected, emojiStart, emojiStart + "😀".length)).toEqual({
      start: 2 + emojiStart,
      end: 2 + emojiStart + "😀".length
    });
    expect(spanForSourcedRange(projected, combiningStart, combiningStart + "e\u0301".length)).toEqual({
      start: 2 + combiningStart,
      end: 2 + combiningStart + "e\u0301".length
    });
    expect(sliceSourcedText(projected, emojiStart, emojiStart + "😀".length)).toMatchObject({
      text: "😀",
      span: { start: 2 + emojiStart, end: 2 + emojiStart + "😀".length },
      segments: [{
        outputStart: 0,
        outputEnd: "😀".length,
        sourceStart: 2 + emojiStart,
        sourceEnd: 2 + emojiStart + "😀".length,
        kind: "identity"
      }]
    });
  });

  it("maps escaped command content back to the full escape sequence", () => {
    const source = String.raw`print "say \"hi\"" tail`;
    const scan = scanCommandParts(source, { start: 0, end: source.length });
    const quoted = scan.parts[1]?.value;
    const firstEscapedQuote = source.indexOf(String.raw`\"`);

    expect(scan.diagnostics).toEqual([]);
    expect(scan.parts.map((part) => part.value.text)).toEqual(["print", 'say "hi"', "tail"]);
    expect(quoted).toBeDefined();
    expect(spanForSourcedRange(quoted!, quoted!.text.indexOf('"'), quoted!.text.indexOf('"') + 1)).toEqual({
      start: firstEscapedQuote,
      end: firstEscapedQuote + 2
    });
    expect(quoted!.segments.length).toBeLessThan(quoted!.text.length);
  });

  it("batches long command runs while preserving quote and brace whitespace semantics", () => {
    const longValue = "x".repeat(4_096);
    const source = `command ${longValue} "quoted value" expr:{left > right}`;
    const scan = scanCommandParts(source, { start: 0, end: source.length });
    const longPart = scan.parts[1];

    expect(scan.diagnostics).toEqual([]);
    expect(scan.parts.map((part) => part.value.text)).toEqual([
      "command",
      longValue,
      "quoted value",
      "expr:{left > right}"
    ]);
    expect(longPart?.value.segments).toHaveLength(1);
    expect(longPart?.value.span).toEqual({ start: "command ".length, end: "command ".length + longValue.length });
  });

  it("keeps escaped inline brackets cooked while later diagnostics retain original offsets", () => {
    const source = String.raw`Narrator: before \[literal\] <font color=not-a-color>x</font>[>]`;
    const result = parseScenario({ sourceText: source, scriptPath: "escaped-inline.nani" });
    const text = result.scenario.statements[0] as TextIR;
    const diagnostic = result.diagnostics.find((candidate) => candidate.code === "invalid-rich-text");
    const invalidColorStart = source.indexOf("not-a-color");

    expect(text.tokens[0]).toEqual({
      kind: "text",
      text: "before [literal] <font color=not-a-color>x</font>"
    });
    expect(diagnostic?.span).toEqual({
      start: invalidColorStart,
      end: invalidColorStart + "not-a-color".length
    });
  });

  it("retains collapsed mappings when one output value represents a wider source span", () => {
    const projected = emptySourcedText(4);
    appendSourcedUnit(projected, "😀", { start: 4, end: 8 });

    expect(projected.segments).toEqual([{
      outputStart: 0,
      outputEnd: 2,
      sourceStart: 4,
      sourceEnd: 8,
      kind: "span"
    }]);
    expect(spanForSourcedRange(projected, 0, 1)).toEqual({ start: 4, end: 8 });
    expect(spanForSourcedRange(projected, 1, 2)).toEqual({ start: 4, end: 8 });
  });

  it("coalesces contiguous concatenation and preserves non-contiguous joins", () => {
    const source = "ab--cd";
    const contiguous = concatSourcedText([
      identitySourcedText(source, { start: 0, end: 1 }),
      identitySourcedText(source, { start: 1, end: 2 })
    ]);
    const joined = concatSourcedText([
      identitySourcedText(source, { start: 0, end: 2 }),
      identitySourcedText(source, { start: 4, end: 6 })
    ]);
    const acrossJoin = sliceSourcedText(joined, 1, 3);

    expect(contiguous.text).toBe("ab");
    expect(contiguous.segments).toHaveLength(1);
    expect(joined.text).toBe("abcd");
    expect(joined.segments).toHaveLength(2);
    expect(spanForSourcedRange(joined, 1, 3)).toEqual({ start: 1, end: 5 });
    expect(acrossJoin.text).toBe("bc");
    expect(spanForSourcedRange(acrossJoin, 0, 1)).toEqual({ start: 1, end: 2 });
    expect(spanForSourcedRange(acrossJoin, 1, 2)).toEqual({ start: 4, end: 5 });
  });

  it("preserves exact anchors and gaps after source-range removal", () => {
    const source = "hello|#id|world";
    const projected = identitySourcedText(source, { start: 0, end: source.length });
    const withoutMarker = removeSourcedRanges(projected, [{ start: 5, end: 10 }]);
    const empty = removeSourcedRanges(projected, [{ start: 0, end: source.length }]);

    expect(withoutMarker.text).toBe("helloworld");
    expect(withoutMarker.segments).toHaveLength(2);
    expect(spanForSourcedRange(withoutMarker, 4, 6)).toEqual({ start: 4, end: 11 });
    expect(spanForSourcedRange(withoutMarker, 5, 5)).toEqual({ start: 10, end: 10 });
    expect(empty).toMatchObject({
      text: "",
      span: { start: 0, end: source.length },
      segments: []
    });
  });
});
