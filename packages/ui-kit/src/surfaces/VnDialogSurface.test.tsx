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
  Children.forEach((node.props as { children?: ReactNode }).children, (child) => visit(child, visitor));
}
