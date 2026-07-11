import { describe, expect, it } from "vitest";
import type { SaveSlotSummary } from "@v-ronpa/contracts";
import {
  createVnSaveLoadOverlayModel,
  resolveVnShellNavigation,
  selectDefaultPauseSection,
  shouldStopVnShellAutomationForAction
} from "./vnShellActions";

describe("VN shell action helpers", () => {
  it("maps title actions to overlays and playable actions to pause sections", () => {
    expect(resolveVnShellNavigation("open-load", "title")).toEqual({ kind: "overlay", overlay: "title-load" });
    expect(resolveVnShellNavigation("open-settings", "title")).toEqual({ kind: "overlay", overlay: "title-settings" });
    expect(resolveVnShellNavigation("open-load", "vn")).toEqual({ kind: "pause", section: "load" });
    expect(resolveVnShellNavigation("open-save", "navi")).toEqual({ kind: "pause", section: "save" });
    expect(resolveVnShellNavigation("open-backlog", "trial")).toEqual({ kind: "pause", section: "backlog" });
    expect(resolveVnShellNavigation("open-pause", "vn")).toEqual({ kind: "pause", section: undefined });
    expect(resolveVnShellNavigation("toggle-auto", "vn")).toBeUndefined();
  });

  it("chooses the first available default pause section", () => {
    const capabilities = {
      canStartNewGame: false,
      canSave: true,
      canLoad: true,
      canOpenSettings: true,
      canOpenBacklog: true,
      canOpenPause: true,
      canAuto: false,
      canSkip: false,
      canReturnTitle: true
    };
    expect(selectDefaultPauseSection(capabilities)).toBe("backlog");
    expect(selectDefaultPauseSection({ ...capabilities, canOpenBacklog: false })).toBe("save");
    expect(selectDefaultPauseSection({ ...capabilities, canOpenBacklog: false, canSave: false })).toBe("load");
    expect(selectDefaultPauseSection({ ...capabilities, canOpenBacklog: false, canSave: false, canLoad: false })).toBe("settings");
    expect(selectDefaultPauseSection(capabilities, { "open-backlog": false, "open-save": false })).toBe("load");
  });

  it("stops story automation only for shell navigation", () => {
    expect(shouldStopVnShellAutomationForAction("open-save", "vn")).toBe(true);
    expect(shouldStopVnShellAutomationForAction("open-settings", "title")).toBe(true);
    expect(shouldStopVnShellAutomationForAction("quick-load", "vn")).toBe(false);
  });

  it("derives save/load page models without owning app-specific save data", () => {
    const slot: SaveSlotSummary = {
      id: "slot:1",
      label: "Slot 1",
      savedAt: "2026-01-01T00:00:00.000Z",
      mode: "vn",
      text: "Saved"
    };
    expect(createVnSaveLoadOverlayModel({
      canSave: true,
      page: "save",
      pendingLoadSlot: undefined,
      slotIds: ["slot:1"],
      slots: [slot]
    })).toMatchObject({ mode: "save", canSave: true, busy: false });
    expect(createVnSaveLoadOverlayModel({
      canSave: true,
      page: "title-load",
      pendingLoadSlot: slot,
      slotIds: ["slot:1"],
      slots: [slot]
    })).toMatchObject({ mode: "load", canSave: false, pendingLoadSlot: slot });
  });
});
