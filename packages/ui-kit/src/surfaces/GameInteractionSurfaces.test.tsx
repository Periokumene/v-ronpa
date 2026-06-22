import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultSettingsSnapshot } from "@v-ronpa/contracts";
import { SettingsOverlay } from "./GameInteractionSurfaces";

describe("SettingsOverlay", () => {
  it("is a controlled settings surface without subtitle preview rendering", () => {
    const onPatchSettings = vi.fn();
    const element = SettingsOverlay({
      onClose: vi.fn(),
      onPatchSettings,
      onResetSettings: vi.fn(),
      settings: createDefaultSettingsSnapshot()
    });
    const ids = collectPropValues(element, "data-testid", "testId");
    const typeNames = collectElementTypeNames(element);
    const text = collectText(element).join(" ");

    expect(ids).toContain("settings-overlay");
    expect(ids).toContain("settings-display-textbox-opacity");
    expect(ids).toContain("settings-automation-auto-speed");
    expect(ids).not.toContain("vn-dialog-text");
    expect(typeNames).not.toContain("VnDialogSurface");
    expect(typeNames.some((typeName) => /draft|preview|subtitle/i.test(typeName))).toBe(false);
    expect(text.toLowerCase()).not.toContain("preview");

    const opacityControl = findElementByProp(element, "testId", "settings-display-textbox-opacity");
    expect(opacityControl).toBeDefined();
    (opacityControl?.props as { onChange: (value: number) => void }).onChange(0.42);
    expect(onPatchSettings).toHaveBeenCalledWith({ display: { textboxOpacity: 0.42 } });
  });
});

function findElementByProp(node: ReactNode, propName: string, propValue: string): ReactElement | undefined {
  let match: ReactElement | undefined;
  visit(node, (current) => {
    if (match || !isValidElement(current)) return;
    const props = current.props as Record<string, unknown>;
    if (props[propName] === propValue) match = current;
  });
  return match;
}

function collectPropValues(node: ReactNode, ...propNames: string[]): string[] {
  const values: string[] = [];
  visit(node, (current) => {
    if (!isValidElement(current)) return;
    const props = current.props as Record<string, unknown>;
    for (const propName of propNames) {
      const value = props[propName];
      if (typeof value === "string") values.push(value);
    }
  });
  return values;
}

function collectText(node: ReactNode): string[] {
  const values: string[] = [];
  visit(node, (current) => {
    if (typeof current === "string") values.push(current);
  });
  return values;
}

function collectElementTypeNames(node: ReactNode): string[] {
  const values: string[] = [];
  visit(node, (current) => {
    if (!isValidElement(current)) return;
    const type = current.type;
    if (typeof type === "string") {
      values.push(type);
      return;
    }

    const namedType = type as { displayName?: string; name?: string };
    values.push(namedType.displayName ?? namedType.name ?? "anonymous");
  });
  return values;
}

function visit(node: ReactNode, visitor: (node: ReactNode) => void) {
  visitor(node);
  if (!isValidElement(node)) return;
  Children.forEach((node.props as { children?: ReactNode }).children, (child) => visit(child, visitor));
}
