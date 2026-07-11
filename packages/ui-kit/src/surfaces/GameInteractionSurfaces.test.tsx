import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultSettingsSnapshot } from "@v-ronpa/contracts";
import { paginateSaveLoadSlotIds, SettingsOverlay, VnCommandBar } from "./GameInteractionSurfaces";

describe("VnCommandBar", () => {
  it("renders VM-provided commands without deriving state from broader capabilities", () => {
    const onAction = vi.fn();
    const element = VnCommandBar({
      commands: [
        {
          action: "toggle-skip",
          label: "SKIP",
          enabled: true,
          active: true,
          testId: "vn-command-skip",
          toggle: true
        },
        {
          action: "open-save",
          label: "SAVE",
          enabled: false,
          testId: "vn-command-save",
          toggle: false
        }
      ],
      onAction
    });

    const ids = collectPropValues(element, "data-testid", "testId");
    const skip = findElementByProp(element, "data-testid", "vn-command-skip");
    const save = findElementByProp(element, "data-testid", "vn-command-save");

    expect(ids).toEqual(expect.arrayContaining(["vn-command-bar", "vn-command-skip", "vn-command-save"]));
    expect(skip?.props).toMatchObject({ "aria-pressed": true, disabled: false });
    expect(save?.props).toMatchObject({ disabled: true });
    expect((save?.props as Record<string, unknown>)["aria-pressed"]).toBeUndefined();
    (skip?.props as { onClick: () => void }).onClick();
    expect(onAction).toHaveBeenCalledWith("toggle-skip");
  });
});

describe("SaveLoadOverlay pagination", () => {
  it("uses fixed five-slot pages for fallback save/load surfaces", () => {
    const slotIds = Array.from({ length: 40 }, (_, index) => `slot:${index + 1}`);

    expect(paginateSaveLoadSlotIds(slotIds, 0)).toEqual({
      pageCount: 8,
      pageIndex: 0,
      pageSlotIds: ["slot:1", "slot:2", "slot:3", "slot:4", "slot:5"]
    });
    expect(paginateSaveLoadSlotIds(slotIds, 7)).toMatchObject({
      pageCount: 8,
      pageIndex: 7,
      pageSlotIds: ["slot:36", "slot:37", "slot:38", "slot:39", "slot:40"]
    });
    expect(paginateSaveLoadSlotIds(slotIds, 99)).toMatchObject({ pageIndex: 7 });
    expect(paginateSaveLoadSlotIds(slotIds, Number.NaN)).toMatchObject({
      pageIndex: 0,
      pageSlotIds: ["slot:1", "slot:2", "slot:3", "slot:4", "slot:5"]
    });
  });
});

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
    expect(ids).toContain("settings-sound-bleep");
    expect(ids).toContain("settings-automation-auto-speed");
    expect(ids).not.toContain("vn-dialog-text");
    expect(typeNames).not.toContain("VnDialogSurface");
    expect(typeNames.some((typeName) => /draft|preview|subtitle/i.test(typeName))).toBe(false);
    expect(text.toLowerCase()).not.toContain("preview");

    const opacityControl = findElementByProp(element, "testId", "settings-display-textbox-opacity");
    expect(opacityControl).toBeDefined();
    (opacityControl?.props as { onChange: (value: number) => void }).onChange(0.42);
    expect(onPatchSettings).toHaveBeenCalledWith({ display: { textboxOpacity: 0.42 } });

    const bleepControl = findElementByProp(element, "testId", "settings-sound-bleep");
    expect(bleepControl).toBeDefined();
    (bleepControl?.props as { onChange: (value: number) => void }).onChange(0.35);
    expect(onPatchSettings).toHaveBeenCalledWith({ sound: { bleepVolume: 0.35 } });
  });

  it("renders embedded pause content without a second overlay close header", () => {
    const element = SettingsOverlay({
      embedded: true,
      onClose: vi.fn(),
      onPatchSettings: vi.fn(),
      onResetSettings: vi.fn(),
      settings: createDefaultSettingsSnapshot()
    });
    expect(element.type).toBe("div");
    expect((element.props as Record<string, unknown>)["data-testid"]).toBe("settings-overlay");
    expect(collectPropValues(element, "aria-label")).not.toContain("Close Settings");
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
