import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { InspectorLite } from "./InspectorLite";

describe("InspectorLite", () => {
  it("labels the Story backlog metric without presenting it as a command count", () => {
    const text = collectText(InspectorLite({
      mode: "vn",
      scriptPointer: 8,
      variables: {},
      inventoryItems: {},
      evidenceIds: [],
      backlogCount: 4
    }));

    expect(text).toContain("Backlog4");
    expect(text).not.toContain("Commands");
  });
});

function collectText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return collectText(node.props.children);
}
