import { describe, expect, it } from "vitest";
import type { SaveSlotSummary } from "@v-ronpa/contracts";
import {
  createVnSaveLoadOverlayModel,
  overlayKindForVnShellAction,
  shouldStopVnShellAutomationForAction
} from "./vnShellActions";

describe("VN shell action helpers", () => {
  it("maps title and VN command bar actions to shell overlays", () => {
    expect(overlayKindForVnShellAction("open-load", "title")).toBe("title-load");
    expect(overlayKindForVnShellAction("open-load", "vn")).toBe("vn-load");
    expect(overlayKindForVnShellAction("open-settings", "title")).toBe("title-settings");
    expect(overlayKindForVnShellAction("open-settings", "vn")).toBe("vn-settings");
    expect(overlayKindForVnShellAction("open-save", "vn")).toBe("vn-save");
    expect(overlayKindForVnShellAction("open-backlog", "vn")).toBe("vn-backlog");
    expect(overlayKindForVnShellAction("open-pause-menu", "vn")).toBe("pause-menu");
    expect(overlayKindForVnShellAction("toggle-auto", "vn")).toBeUndefined();
    expect(overlayKindForVnShellAction("toggle-skip", "vn")).toBeUndefined();
    expect(overlayKindForVnShellAction("quick-save", "vn")).toBeUndefined();
    expect(overlayKindForVnShellAction("quick-load", "vn")).toBeUndefined();
  });

  it("stops story automation only when an action opens an overlay", () => {
    expect(shouldStopVnShellAutomationForAction("open-save", "vn")).toBe(true);
    expect(shouldStopVnShellAutomationForAction("open-settings", "vn")).toBe(true);
    expect(shouldStopVnShellAutomationForAction("toggle-auto", "vn")).toBe(false);
    expect(shouldStopVnShellAutomationForAction("quick-load", "vn")).toBe(false);
    expect(shouldStopVnShellAutomationForAction("new-game", "title")).toBe(false);
  });

  it("derives save/load overlay models without owning app-specific save data", () => {
    const slot: SaveSlotSummary = {
      id: "slot:1",
      label: "Slot 1",
      savedAt: "2026-01-01T00:00:00.000Z",
      mode: "vn",
      text: "Saved"
    };

    expect(
      createVnSaveLoadOverlayModel({
        canSave: true,
        overlay: "vn-save",
        pendingLoadSlot: undefined,
        slotIds: ["slot:1"],
        slots: [slot]
      })
    ).toEqual({ mode: "save", canSave: true, pendingLoadSlot: undefined, slotIds: ["slot:1"], slots: [slot] });
    expect(
      createVnSaveLoadOverlayModel({
        canSave: true,
        overlay: "title-load",
        pendingLoadSlot: slot,
        slotIds: ["slot:1"],
        slots: [slot]
      })
    ).toEqual({ mode: "load", canSave: false, pendingLoadSlot: slot, slotIds: ["slot:1"], slots: [slot] });
    expect(
      createVnSaveLoadOverlayModel({
        canSave: true,
        overlay: "vn-backlog",
        pendingLoadSlot: undefined,
        slotIds: ["slot:1"],
        slots: [slot]
      })
    ).toBeUndefined();
  });
});
