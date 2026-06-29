import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { VnChoiceOverlay } from "./VnChoiceOverlay";

describe("VnChoiceOverlay", () => {
  it("does not render without pending choices", () => {
    expect(VnChoiceOverlay({ choices: [] })).toBeNull();
  });

  it("renders choices in an independent overlay and reports selection", () => {
    const onChoice = vi.fn();
    const element = VnChoiceOverlay({
      choices: [
        {
          text: "Inspect",
          enabled: true,
          richText: { text: "Inspect", runs: [{ start: 0, end: 7, style: { italic: true } }] }
        },
        { text: "Leave", enabled: true }
      ],
      onChoice
    });

    const overlay = findElementByTestId(element, "vn-choice-overlay");
    const first = findElementByTestId(element, "vn-choice-0");
    const second = findElementByTestId(element, "vn-choice-1");
    const richRuns = findElementsByProp(element, "data-rich-text-run", "");

    expect(overlay).toBeDefined();
    expect(overlay?.props).not.toHaveProperty("onKeyDown");
    expect(collectText(first).join("")).toBe("Inspect");
    expect(collectText(second).join("")).toBe("Leave");
    expect(richRuns.length).toBeGreaterThanOrEqual(1);

    (first?.props as { onClick?: () => void }).onClick?.();
    expect(onChoice).toHaveBeenCalledWith(0, expect.objectContaining({ text: "Inspect" }));
  });

  it("keeps disabled choices as a no-op", () => {
    const onChoice = vi.fn();
    const element = VnChoiceOverlay({
      choices: [{ text: "Locked", enabled: false }],
      onChoice
    });

    const locked = findElementByTestId(element, "vn-choice-0");

    expect((locked?.props as { disabled?: boolean })?.disabled).toBe(true);
    (locked?.props as { onClick?: () => void }).onClick?.();
    expect(onChoice).not.toHaveBeenCalled();
  });
});

function findElementByTestId(node: ReactNode, testId: string): ReactElement | undefined {
  let match: ReactElement | undefined;
  visit(node, (current) => {
    if (match || !isValidElement(current)) return;
    const props = current.props as Record<string, unknown>;
    if (props["data-testid"] === testId) match = current;
  });
  return match;
}

function findElementsByProp(node: ReactNode, prop: string, value: unknown): ReactElement[] {
  const matches: ReactElement[] = [];
  visit(node, (current) => {
    if (!isValidElement(current)) return;
    const props = current.props as Record<string, unknown>;
    if (props[prop] === value) matches.push(current);
  });
  return matches;
}

function collectText(node: ReactNode): string[] {
  const values: string[] = [];
  visit(node, (current) => {
    if (typeof current === "string") values.push(current);
  });
  return values;
}

function visit(node: ReactNode, visitor: (node: ReactNode) => void) {
  visitor(node);
  if (!isValidElement(node)) return;
  if (typeof node.type === "function") {
    const renderFunctionComponent = node.type as (props: unknown) => ReactNode;
    visit(renderFunctionComponent(node.props), visitor);
    return;
  }
  Children.forEach((node.props as { children?: ReactNode }).children, (child) => visit(child, visitor));
}
