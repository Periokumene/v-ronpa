import { describe, expect, it } from "vitest";
import { createSaveLoadOverlayModel, overlayKindForUiAction } from "./useOverlayPageAdapters";

describe("overlay page adapter helpers", () => {
  it("maps shared UI actions to shell overlays without redefining overlay ids", () => {
    expect(overlayKindForUiAction("open-load", "title")).toBe("title-load");
    expect(overlayKindForUiAction("open-load", "navi")).toBe("vn-load");
    expect(overlayKindForUiAction("open-settings", "title")).toBe("title-settings");
    expect(overlayKindForUiAction("open-settings", "navi")).toBe("vn-settings");
    expect(overlayKindForUiAction("open-save", "navi")).toBe("vn-save");
    expect(overlayKindForUiAction("open-backlog", "navi")).toBe("vn-backlog");
    expect(overlayKindForUiAction("open-pause-menu", "navi")).toBe("pause-menu");
    expect(overlayKindForUiAction("toggle-auto", "navi")).toBeUndefined();
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
      createSaveLoadOverlayModel({
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
      createSaveLoadOverlayModel({
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
      createSaveLoadOverlayModel({
        canSave: true,
        overlay: "vn-backlog",
        pendingLoadSlot: undefined,
        slotIds,
        slots
      })
    ).toBeUndefined();
  });
});
