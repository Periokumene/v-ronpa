import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultSettingsSnapshot } from "@v-ronpa/contracts";
import { paginateSaveLoadSlotIds, SettingsOverlay, VnCommandBar } from "./GameInteractionSurfaces";

const interactionSurfaceSource = readFileSync(new URL("./GameInteractionSurfaces.tsx", import.meta.url), "utf8");

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
    expect(ids).not.toContain("settings-display-textbox-opacity");
    expect(ids).toContain("settings-sound-bleep");
    expect(ids).toContain("settings-automation-auto-speed");
    expect(ids).not.toContain("vn-dialog-text");
    expect(typeNames).not.toContain("VnDialogSurface");
    expect(typeNames.some((typeName) => /draft|preview|subtitle/i.test(typeName))).toBe(false);
    expect(text.toLowerCase()).not.toContain("preview");

    const bleepControl = findElementByProp(element, "testId", "settings-sound-bleep");
    expect(bleepControl).toBeDefined();
    (bleepControl?.props as { onChange: (value: number) => void }).onChange(0.35);
    expect(onPatchSettings).toHaveBeenCalledWith({ sound: { bleepVolume: 0.35 } });

    const languageControl = findElementByProp(element, "testId", "settings-system-language");
    (languageControl?.props as { onChange: (value: string) => void }).onChange("en");
    expect(onPatchSettings).toHaveBeenCalledWith({ system: { language: "en" } });

    const fullscreenControl = findElementByProp(element, "testId", "settings-system-fullscreen");
    (fullscreenControl?.props as { onChange: (value: boolean) => void }).onChange(true);
    expect(onPatchSettings).toHaveBeenCalledWith({ system: { preferFullscreen: true } });
  });

  it("uses explicit settings controls instead of native select, checkbox, or range appearance", () => {
    expect(interactionSurfaceSource).not.toMatch(/<select\b/u);
    expect(interactionSurfaceSource).not.toMatch(/type="checkbox"/u);
    expect(interactionSurfaceSource).not.toMatch(/type="range"/u);
    expect(interactionSurfaceSource).toContain("<Slider.Root");
    expect(interactionSurfaceSource).toContain("<Switch.Root");
    expect(interactionSurfaceSource).toContain("function SettingsOptionStepper");
  });

  it("drives Slider and Switch through stable value semantics", () => {
    const onPatchSettings = vi.fn();
    const element = SettingsOverlay({
      onClose: vi.fn(),
      onPatchSettings,
      onResetSettings: vi.fn(),
      settings: createDefaultSettingsSnapshot()
    });

    const slider = renderFunctionElement(findElementByProp(element, "testId", "settings-display-text-speed"));
    const sliderRoot = findElementByProp(slider, "data-control-id", "settings-display-text-speed");
    expect(sliderRoot?.props).toMatchObject({ max: 100, min: 0, step: 1, value: [50] });
    (sliderRoot?.props as { onValueChange: (values: number[]) => void }).onValueChange([100]);
    expect(onPatchSettings).toHaveBeenCalledWith({ display: { textSpeed: 1 } });
    (sliderRoot?.props as { onValueChange: (values: number[]) => void }).onValueChange([0]);
    expect(onPatchSettings).toHaveBeenCalledWith({ display: { textSpeed: 0 } });

    const toggle = renderFunctionElement(findElementByProp(element, "testId", "settings-system-fullscreen"));
    const switchRoot = findElementByProp(toggle, "data-testid", "settings-system-fullscreen");
    expect(switchRoot?.props).toMatchObject({ checked: false, "data-value": "off" });
    (switchRoot?.props as { onCheckedChange: (checked: boolean) => void }).onCheckedChange(true);
    expect(onPatchSettings).toHaveBeenCalledWith({ system: { preferFullscreen: true } });
  });

  it("moves enum steppers normally and disables their boundary buttons", () => {
    const onPatchSettings = vi.fn();
    const model = createDefaultSettingsSnapshot();
    const element = SettingsOverlay({ onClose: vi.fn(), onPatchSettings, onResetSettings: vi.fn(), settings: model });
    const textSize = renderFunctionElement(findElementByProp(element, "testId", "settings-display-text-size"));
    const current = findElementByProp(textSize, "data-testid", "settings-display-text-size");
    expect(current?.props).toMatchObject({ "data-value": "medium", role: "group" });
    (findElementByProp(textSize, "data-testid", "settings-display-text-size-next")?.props as { onClick: () => void }).onClick();
    expect(onPatchSettings).toHaveBeenCalledWith({ display: { textSize: "large" } });
    (findElementByProp(textSize, "data-testid", "settings-display-text-size-previous")?.props as { onClick: () => void }).onClick();
    expect(onPatchSettings).toHaveBeenCalledWith({ display: { textSize: "small" } });

    model.display.textSize = "small";
    const minimum = renderFunctionElement(findElementByProp(
      SettingsOverlay({ onClose: vi.fn(), onPatchSettings, onResetSettings: vi.fn(), settings: model }),
      "testId",
      "settings-display-text-size"
    ));
    expect((findElementByProp(minimum, "data-testid", "settings-display-text-size-previous")?.props as Record<string, unknown>).disabled).toBe(true);

    model.display.textSize = "large";
    const maximum = renderFunctionElement(findElementByProp(
      SettingsOverlay({ onClose: vi.fn(), onPatchSettings, onResetSettings: vi.fn(), settings: model }),
      "testId",
      "settings-display-text-size"
    ));
    expect((findElementByProp(maximum, "data-testid", "settings-display-text-size-next")?.props as Record<string, unknown>).disabled).toBe(true);
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

function renderFunctionElement(element: ReactElement | undefined): ReactElement {
  if (!element || typeof element.type !== "function") throw new Error("Expected a function component element.");
  const render = element.type as unknown as (props: unknown) => ReactElement;
  return render(element.props);
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
