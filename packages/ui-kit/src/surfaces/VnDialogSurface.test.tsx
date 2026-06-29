import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useId: () => "vn-dialog-test-id"
  };
});

import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { VnDialogSurface } from "./VnDialogSurface";

describe("VnDialogSurface", () => {
  it("renders the provided visible text without owning reveal state", () => {
    const onAdvance = vi.fn();
    const element = VnDialogSurface({
      speaker: "Felix",
      text: "Part",
      onAdvance
    });

    const text = findElementByTestId(element, "vn-dialog-text");
    const advance = findElementByTestId(element, "vn-dialog-advance");
    const root = findElementByTestId(element, "vn-dialog-surface");

    expect(collectText(text).join("")).toBe("Part");

    (advance?.props as { onClick?: () => void }).onClick?.();
    expect(onAdvance).toHaveBeenCalledTimes(1);

    (root?.props as { onKeyDown?: (event: { key: string; currentTarget: unknown; target: unknown; preventDefault: () => void }) => void })
      .onKeyDown?.({
        key: "Enter",
        currentTarget: root,
        target: root,
        preventDefault: vi.fn()
      });
    expect(onAdvance).toHaveBeenCalledTimes(2);
  });

  it("renders dialog and choice rich text spans with plain text fallback", () => {
    const element = VnDialogSurface({
      speaker: "Felix",
      text: "Bold choice",
      richText: { text: "Bold choice", runs: [{ start: 0, end: 4, style: { bold: true, color: "#ff5577" } }] },
      choices: [
        {
          text: "Inspect",
          enabled: true,
          richText: { text: "Inspect", runs: [{ start: 0, end: 7, style: { italic: true } }] }
        }
      ]
    });

    const text = findElementByTestId(element, "vn-dialog-text");
    const choice = findElementByTestId(element, "vn-dialog-choice-0");
    const richRuns = findElementsByProp(element, "data-rich-text-run", "");

    expect(collectText(text).join("")).toBe("Bold choice");
    expect(collectText(choice).join("")).toBe("Inspect");
    expect(richRuns.length).toBeGreaterThanOrEqual(2);
    expect((richRuns[0]?.props as { style?: Record<string, unknown> }).style).toMatchObject({ color: "#ff5577", fontWeight: 700 });
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
