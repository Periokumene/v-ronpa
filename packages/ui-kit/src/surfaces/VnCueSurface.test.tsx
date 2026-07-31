import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { VnCueSurface } from "./VnCueSurface";

describe("VnCueSurface", () => {
  it("renders centered borderless rich text without a visible author label", () => {
    const element = VnCueSurface({
      author: "Narrator",
      text: "Do not turn around.",
      richText: {
        text: "Do not turn around.",
        runs: [{ start: 0, end: 19, style: { bold: true } }]
      },
      displaySettings: { textSize: "large", textSpeed: 0.8 },
      presentation: { targetVisible: false, mounted: true, opacity: 0.4, phase: "hiding" }
    });
    const root = findElementByTestId(element, "vn-cue-surface");
    const text = findElementByTestId(element, "vn-cue-text");

    expect(root?.props).toMatchObject({
      "aria-label": "演出文本：Narrator",
      "data-author": "Narrator",
      "data-text-size": "large",
      "data-ui-phase": "hiding"
    });
    expect((root?.props as { style?: Record<string, unknown> }).style).toMatchObject({
      display: "grid",
      placeItems: "center",
      border: 0,
      background: "none",
      boxShadow: "none",
      pointerEvents: "none",
      opacity: 0.4
    });
    expect(collectText(text).join("")).toBe("Do not turn around.");
    expect(collectText(element)).not.toContain("Narrator");
  });
});

function findElementByTestId(node: ReactNode, testId: string): ReactElement | undefined {
  let match: ReactElement | undefined;
  visit(node, (current) => {
    if (match || !isValidElement(current)) return;
    if ((current.props as Record<string, unknown>)["data-testid"] === testId) match = current;
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
  if (typeof node.type === "function") {
    visit((node.type as (props: unknown) => ReactNode)(node.props), visitor);
    return;
  }
  Children.forEach((node.props as { children?: ReactNode }).children, (child) => visit(child, visitor));
}
