import { describe, expect, it } from "vitest";
import { createInitialUiRuntimeState } from "@v-ronpa/app-vn-dispatch";
import { vnVisualRuntimeDriverKey } from "./runtimeUtils";

describe("VN visual runtime driver key", () => {
  it("stays stable while one transition advances and changes for a consecutive wait transition", () => {
    const initial = createInitialUiRuntimeState();
    const first = {
      ...initial,
      surfaces: {
        ...initial.surfaces,
        dialog: {
          ...initial.surfaces.dialog,
          phase: "hiding" as const,
          transition: {
            startedAtMs: 100,
            durationMs: 200,
            fromOpacity: 1,
            toOpacity: 0,
            targetVisible: false
          }
        }
      }
    };
    const progressed = {
      ...first,
      surfaces: {
        ...first.surfaces,
        dialog: { ...first.surfaces.dialog, opacity: 0.5 }
      }
    };
    const second = {
      ...initial,
      surfaces: {
        ...initial.surfaces,
        commandBar: {
          ...initial.surfaces.commandBar,
          phase: "hiding" as const,
          transition: {
            startedAtMs: 300,
            durationMs: 200,
            fromOpacity: 1,
            toOpacity: 0,
            targetVisible: false
          }
        }
      }
    };

    expect(vnVisualRuntimeDriverKey(undefined, progressed)).toBe(vnVisualRuntimeDriverKey(undefined, first));
    expect(vnVisualRuntimeDriverKey(undefined, second)).not.toBe(vnVisualRuntimeDriverKey(undefined, first));
  });
});
