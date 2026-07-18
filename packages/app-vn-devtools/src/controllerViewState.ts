import {
  resolveVnDebugAnchor,
  type VnDebugEntryInspection,
  type VnDebugTargetAnchor
} from "@v-ronpa/app-vn-runtime/debug";
import { vnDebugAnchorsEqual } from "./controllerSafety";
import {
  canPreviewVnDevtoolsLine,
  clampVnDevtoolsPanelHeight,
  type VnDevtoolsLayoutState,
  type VnDevtoolsSourceLine
} from "./types";

export interface ResolveVnDevtoolsSelectionInput {
  inspection: VnDebugEntryInspection;
  lines: readonly VnDevtoolsSourceLine[];
  anchorsByLineId: ReadonlyMap<string, VnDebugTargetAnchor>;
  previousAnchor?: VnDebugTargetAnchor;
}

export interface VnDevtoolsResolvedSelection {
  lineId?: string;
  anchor?: VnDebugTargetAnchor;
}

/**
 * Rematch a selection semantically. A stale line number is never used as a
 * fallback: current, pinned, then the first previewable line are authoritative.
 */
export function resolveVnDevtoolsSelection({
  inspection,
  lines,
  anchorsByLineId,
  previousAnchor
}: ResolveVnDevtoolsSelectionInput): VnDevtoolsResolvedSelection {
  const resolvedAnchor = previousAnchor ? resolveVnDebugAnchor(inspection, previousAnchor) : undefined;
  const rematchedLineId = resolvedAnchor
    ? findLineIdForAnchor(anchorsByLineId, resolvedAnchor)
    : undefined;
  const fallbackLine = lines.find((line) => line.current)
    ?? lines.find((line) => line.pinned)
    ?? lines.find(canPreviewVnDevtoolsLine);
  const lineId = rematchedLineId ?? fallbackLine?.id;
  const anchor = lineId ? anchorsByLineId.get(lineId) : undefined;
  return {
    ...(lineId ? { lineId } : {}),
    ...(anchor ? { anchor } : {})
  };
}

export function mergeVnDevtoolsLayout(
  current: VnDevtoolsLayoutState,
  patch: Partial<VnDevtoolsLayoutState>
): VnDevtoolsLayoutState {
  return {
    ...current,
    ...patch,
    bottomPanelHeight: clampVnDevtoolsPanelHeight(
      patch.bottomPanelHeight ?? current.bottomPanelHeight
    )
  };
}

function findLineIdForAnchor(
  anchorsByLineId: ReadonlyMap<string, VnDebugTargetAnchor>,
  target: VnDebugTargetAnchor
): string | undefined {
  for (const [lineId, anchor] of anchorsByLineId) {
    if (vnDebugAnchorsEqual(anchor, target)) return lineId;
  }
  return undefined;
}
