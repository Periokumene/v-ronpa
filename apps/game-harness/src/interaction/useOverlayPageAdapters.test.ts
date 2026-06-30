import { describe, expect, it } from "vitest";
import { createVnSaveLoadOverlayModel, overlayKindForVnShellAction } from "@v-ronpa/app-vn-shell";

describe("overlay page adapter helpers", () => {
  it("maps shared UI actions to shell overlays without redefining overlay ids", () => {
    expect(overlayKindForVnShellAction("open-load", "title")).toBe("title-load");
    expect(overlayKindForVnShellAction("open-load", "navi")).toBe("vn-load");
    expect(overlayKindForVnShellAction("open-settings", "title")).toBe("title-settings");
    expect(overlayKindForVnShellAction("open-settings", "navi")).toBe("vn-settings");
    expect(overlayKindForVnShellAction("open-save", "navi")).toBe("vn-save");
    expect(overlayKindForVnShellAction("open-backlog", "navi")).toBe("vn-backlog");
    expect(overlayKindForVnShellAction("open-pause-menu", "navi")).toBe("pause-menu");
    expect(overlayKindForVnShellAction("toggle-auto", "navi")).toBeUndefined();
  });

  it("builds save/load view models from app adapter slots instead of ui-kit defaults", () => {
    const slotIds = ["project:save:alpha", "project:save:beta"];
    const slots = [
      {
        id: "project:save:alpha",
        label: "Alpha",
        savedAt: "2026-06-20T00:00:00.000Z",
        mode: "navi" as const,
        speaker: "Felix",
        text: "Custom slot id."
      }
    ];

    expect(
      createVnSaveLoadOverlayModel({
        canSave: true,
        overlay: "vn-save",
        pendingLoadSlot: undefined,
        slotIds,
        slots
      })
    ).toEqual({
      canSave: true,
      mode: "save",
      pendingLoadSlot: undefined,
      slotIds,
      slots
    });

    expect(
      createVnSaveLoadOverlayModel({
        canSave: true,
        overlay: "title-load",
        pendingLoadSlot: slots[0],
        slotIds,
        slots
      })
    ).toMatchObject({
      canSave: false,
      mode: "load",
      pendingLoadSlot: slots[0],
      slotIds
    });

    expect(
      createVnSaveLoadOverlayModel({
        canSave: true,
        overlay: "vn-backlog",
        pendingLoadSlot: undefined,
        slotIds,
        slots
      })
    ).toBeUndefined();
  });
});
