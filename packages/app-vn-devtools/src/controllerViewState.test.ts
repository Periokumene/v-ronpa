import { describe, expect, it } from "vitest";
import type { VnDebugEntryInspection, VnDebugTargetAnchor } from "@v-ronpa/app-vn-runtime/debug";
import { mergeVnDevtoolsLayout, resolveVnDevtoolsSelection } from "./controllerViewState";
import type { VnDevtoolsSourceLine } from "./types";

const rematchedAnchor: VnDebugTargetAnchor = {
  kind: "command",
  scriptPath: "game-a/opening.nani",
  revision: "sha256:new",
  line: 18,
  commandIndex: 4,
  ordinal: 1,
  commandId: "print",
  stableId: "print:intro"
};

const inspection = {
  entry: { id: "opening", scriptPath: "game-a/opening.nani" },
  revision: "sha256:new",
  commands: [{ anchor: rematchedAnchor }],
  labels: []
} as unknown as VnDebugEntryInspection;

describe("VN devtools controller view state", () => {
  it("rematches a selected source target by stable anchor after an HMR line move", () => {
    const lines = createLines();
    const anchors = new Map([["line:new", rematchedAnchor]]);
    const result = resolveVnDevtoolsSelection({
      inspection,
      lines,
      anchorsByLineId: anchors,
      previousAnchor: { ...rematchedAnchor, revision: "sha256:old", line: 7, commandIndex: 2 }
    });
    expect(result).toEqual({ lineId: "line:new", anchor: rematchedAnchor });
  });

  it("never guesses the stale line number and falls back current, pinned, then previewable", () => {
    const staleAnchor: VnDebugTargetAnchor = {
      ...rematchedAnchor,
      revision: "sha256:old",
      stableId: "print:deleted",
      fingerprint: "deleted-context",
      line: 2
    };
    const currentAnchor = { ...rematchedAnchor, stableId: "print:current", line: 40 };
    const pinnedAnchor = { ...rematchedAnchor, stableId: "print:pinned", line: 50 };
    const previewAnchor = { ...rematchedAnchor, stableId: "print:first", line: 60 };
    const anchors = new Map<string, VnDebugTargetAnchor>([
      ["line:current", currentAnchor],
      ["line:pinned", pinnedAnchor],
      ["line:first", previewAnchor]
    ]);

    expect(resolveVnDevtoolsSelection({
      inspection,
      lines: createLines(),
      anchorsByLineId: anchors,
      previousAnchor: staleAnchor
    }).lineId).toBe("line:current");
    expect(resolveVnDevtoolsSelection({
      inspection,
      lines: createLines().map((line) => ({ ...line, current: false })),
      anchorsByLineId: anchors,
      previousAnchor: staleAnchor
    }).lineId).toBe("line:pinned");
    expect(resolveVnDevtoolsSelection({
      inspection,
      lines: createLines().map((line) => ({ ...line, current: false, pinned: false })),
      anchorsByLineId: anchors,
      previousAnchor: staleAnchor
    }).lineId).toBe("line:current");
  });

  it("returns no selection when no stable semantic fallback exists", () => {
    expect(resolveVnDevtoolsSelection({
      inspection,
      lines: [{ id: "line:blocked", lineNumber: 2, sourceText: "@end", previewability: "blocked" }],
      anchorsByLineId: new Map()
    })).toEqual({});
  });

  it("merges and clamps persisted panel layout through one helper", () => {
    const initial = { bottomPanelOpen: true, activePanel: "state" as const, bottomPanelHeight: 180 };
    expect(mergeVnDevtoolsLayout(initial, { activePanel: "problems", bottomPanelHeight: 999 })).toEqual({
      bottomPanelOpen: true,
      activePanel: "problems",
      bottomPanelHeight: 360
    });
    expect(mergeVnDevtoolsLayout(initial, { bottomPanelOpen: false, bottomPanelHeight: 1 })).toEqual({
      bottomPanelOpen: false,
      activePanel: "state",
      bottomPanelHeight: 120
    });
  });
});

function createLines(): VnDevtoolsSourceLine[] {
  return [
    { id: "line:current", lineNumber: 40, sourceText: "nar: current", previewability: "previewable", current: true },
    { id: "line:pinned", lineNumber: 50, sourceText: "nar: pinned", previewability: "previewable", pinned: true },
    { id: "line:first", lineNumber: 60, sourceText: "nar: first", previewability: "previewable" }
  ];
}
