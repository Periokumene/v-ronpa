import { Code } from "@phosphor-icons/react";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { WorkbenchCommandStrip, WorkbenchFileBar } from "./WorkbenchChrome";
import { WorkbenchSourceView } from "./WorkbenchSourceView";
import { WorkbenchSymbols } from "./WorkbenchSymbols";
import { WorkbenchToolPanel } from "./WorkbenchToolPanel";
import { createVnDevtoolsFindResult } from "./sourceViewModel";
import {
  VN_DEVTOOLS_MAX_WIDTH,
  VN_DEVTOOLS_MIN_WIDTH,
  canPreviewVnDevtoolsLine,
  clampVnDevtoolsWidth,
  type VnDevtoolsController,
  type VnDevtoolsDockProps,
  type VnDevtoolsSourceLine
} from "./types";
import "./VnDevtoolsDock.css";

const statusLabels = {
  idle: "Idle",
  inspecting: "Inspecting",
  ready: "Ready",
  updating: "Source update",
  materializing: "Materializing",
  "decision-required": "Decision required",
  blocked: "Blocked",
  error: "Error"
} as const;

export function VnDevtoolsDock({ controller, className }: VnDevtoolsDockProps) {
  const width = clampVnDevtoolsWidth(controller.width);
  const selectedLine = controller.lines.find((line) => line.id === controller.selectedLineId);
  const findResult = createVnDevtoolsFindResult(controller.lines, controller.searchQuery);
  const matchesByLineId = new Map(findResult.matches.map((match) => [match.lineId, match]));
  const errorCount = controller.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = controller.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;

  if (controller.collapsed) {
    return (
      <button
        type="button"
        className="vn-devtools-collapsed-button"
        data-testid="vn-devtools-collapsed-button"
        data-game-input-boundary="escape"
        data-status={controller.status.phase}
        aria-label={`Open Nani Workbench. ${statusLabels[controller.status.phase]}. ${errorCount} errors, ${warningCount} warnings.`}
        title="Open Nani Workbench"
        onClick={() => controller.actions.setCollapsed(false)}
      >
        <Code size={18} weight="bold" aria-hidden="true" />
        {(controller.hasUpdateBadge || errorCount > 0 || warningCount > 0) && (
          <span
            className={errorCount > 0 ? "vn-devtools-collapsed-badge is-error" : "vn-devtools-collapsed-badge"}
            aria-hidden="true"
          />
        )}
      </button>
    );
  }

  const style = { "--vn-devtools-width": `${width}px` } as CSSProperties;
  const rootClassName = ["vn-devtools-dock", className].filter(Boolean).join(" ");

  return (
    <aside
      ref={createGlobalShortcutRef(controller)}
      className={rootClassName}
      style={style}
      aria-label="Nani Workbench"
      data-testid="vn-devtools-dock"
      data-game-input-boundary="escape"
      tabIndex={-1}
      onKeyDownCapture={(event) => handleDockKeyboard(event, controller, selectedLine)}
    >
      <div
        className="vn-devtools-resizer"
        role="separator"
        aria-label="Resize Nani Workbench"
        aria-orientation="vertical"
        aria-valuemin={VN_DEVTOOLS_MIN_WIDTH}
        aria-valuemax={VN_DEVTOOLS_MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        data-testid="vn-devtools-resizer"
        onPointerDown={(event) => startResize(event, width)}
        onPointerMove={(event) => continueResize(event, controller.actions.resize)}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onKeyDown={(event) => resizeWithKeyboard(event, width, controller.actions.resize)}
      />

      <WorkbenchFileBar controller={controller} />
      {controller.catalogDirty && (
        <div className="vn-devtools-catalog-dirty" data-testid="vn-devtools-catalog-dirty" role="status">
          <span>Catalog changed. Refresh to rescan; preview and adoption are frozen.</span>
          <button type="button" onClick={controller.actions.refreshCatalog}>Refresh</button>
        </div>
      )}
      <WorkbenchCommandStrip controller={controller} findResult={findResult} />
      <WorkbenchSymbols controller={controller} />
      <WorkbenchSourceView
        controller={controller}
        matchesByLineId={matchesByLineId}
        {...(findResult.currentMatch ? { currentMatchLineId: findResult.currentMatch.lineId } : {})}
      />
      <WorkbenchToolPanel controller={controller} />
    </aside>
  );
}

function createGlobalShortcutRef(controller: VnDevtoolsController) {
  return (root: HTMLElement | null) => {
    if (!root) return undefined;
    const handleGlobalShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLocaleLowerCase();
      if (key === "f") {
        event.preventDefault();
        event.stopPropagation();
        focusFind(root);
        root.ownerDocument.defaultView?.requestAnimationFrame(() => focusFind(root));
      } else if (event.shiftKey && key === "o") {
        event.preventDefault();
        event.stopPropagation();
        focusSymbols(root);
        root.ownerDocument.defaultView?.requestAnimationFrame(() => focusSymbols(root));
      } else if (key === "j") {
        event.preventDefault();
        event.stopPropagation();
        controller.actions.updateLayout({ bottomPanelOpen: !controller.layout.bottomPanelOpen });
      }
    };
    window.addEventListener("keydown", handleGlobalShortcut, true);
    return () => window.removeEventListener("keydown", handleGlobalShortcut, true);
  };
}

function focusSymbols(root: HTMLElement) {
  const details = root.querySelector<HTMLDetailsElement>("[data-testid='vn-devtools-symbols']");
  if (details) details.open = true;
  details?.querySelector<HTMLInputElement>("[data-testid='vn-devtools-symbol-search']")?.focus();
}

function handleDockKeyboard(
  event: KeyboardEvent<HTMLElement>,
  controller: VnDevtoolsController,
  selectedLine: VnDevtoolsSourceLine | undefined
) {
  const commandKey = event.metaKey || event.ctrlKey;
  if (commandKey && event.key === "Enter") {
    if (controller.decision) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.querySelector<HTMLElement>("[data-testid='vn-devtools-decision'] input:not(:disabled)")?.focus();
    } else if (selectedLine && canPreviewVnDevtoolsLine(selectedLine) && !isBusy(controller)) {
      event.preventDefault();
      event.stopPropagation();
      controller.actions.previewLine(selectedLine.id);
    }
    return;
  }

  if (commandKey && event.key.toLocaleLowerCase() === "f") {
    event.preventDefault();
    event.stopPropagation();
    focusFind(event.currentTarget);
    return;
  }

  if (commandKey && event.shiftKey && event.key.toLocaleLowerCase() === "o") {
    event.preventDefault();
    event.stopPropagation();
    const details = event.currentTarget.querySelector<HTMLDetailsElement>("[data-testid='vn-devtools-symbols']");
    if (details) details.open = true;
    details?.querySelector<HTMLInputElement>("[data-testid='vn-devtools-symbol-search']")?.focus();
    return;
  }

  if (commandKey && event.key.toLocaleLowerCase() === "j") {
    event.preventDefault();
    event.stopPropagation();
    controller.actions.updateLayout({ bottomPanelOpen: !controller.layout.bottomPanelOpen });
    return;
  }

  if (event.key === "/" && !isTextEntryTarget(event.target)) {
    event.preventDefault();
    event.stopPropagation();
    focusFind(event.currentTarget);
    return;
  }

  if (event.key !== "Escape") return;
  event.stopPropagation();
  if (controller.decision) {
    event.preventDefault();
    controller.actions.cancelDecision();
    return;
  }
  const openSymbols = event.currentTarget.querySelector<HTMLDetailsElement>("[data-testid='vn-devtools-symbols'][open]");
  if (openSymbols) {
    event.preventDefault();
    openSymbols.open = false;
    openSymbols.querySelector<HTMLElement>("summary")?.focus();
    return;
  }
  const find = event.currentTarget.querySelector<HTMLElement>("[data-testid='vn-devtools-find']");
  const findHasFocus = Boolean(find?.contains(typeof document === "undefined" ? null : document.activeElement));
  if (controller.searchQuery.length > 0 || findHasFocus) {
    event.preventDefault();
    controller.actions.search("");
    find?.classList.remove("is-open");
    find?.querySelector<HTMLInputElement>("input")?.blur();
    event.currentTarget.focus();
    return;
  }
  if (isBusy(controller) && controller.status.cancellable) {
    event.preventDefault();
    controller.actions.cancelCandidate();
  }
}

function focusFind(root: HTMLElement) {
  const find = root.querySelector<HTMLElement>("[data-testid='vn-devtools-find']");
  find?.classList.add("is-open");
  find?.querySelector<HTMLInputElement>("[data-testid='vn-devtools-search']")?.focus();
}

function isBusy(controller: VnDevtoolsController): boolean {
  return controller.status.phase === "inspecting"
    || controller.status.phase === "updating"
    || controller.status.phase === "materializing";
}

function startResize(event: ReactPointerEvent<HTMLDivElement>, width: number) {
  event.preventDefault();
  event.currentTarget.dataset.resizeStartX = String(event.clientX);
  event.currentTarget.dataset.resizeStartWidth = String(width);
  event.currentTarget.setPointerCapture(event.pointerId);
}

function continueResize(event: ReactPointerEvent<HTMLDivElement>, resize: (width: number) => void) {
  const startX = Number(event.currentTarget.dataset.resizeStartX);
  const startWidth = Number(event.currentTarget.dataset.resizeStartWidth);
  if (!Number.isFinite(startX) || !Number.isFinite(startWidth)) return;
  resize(clampVnDevtoolsWidth(startWidth + startX - event.clientX));
}

function finishResize(event: ReactPointerEvent<HTMLDivElement>) {
  delete event.currentTarget.dataset.resizeStartX;
  delete event.currentTarget.dataset.resizeStartWidth;
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>, width: number, resize: (width: number) => void) {
  const step = event.shiftKey ? 48 : 16;
  let nextWidth: number | undefined;
  if (event.key === "ArrowLeft") nextWidth = width + step;
  if (event.key === "ArrowRight") nextWidth = width - step;
  if (event.key === "Home") nextWidth = VN_DEVTOOLS_MIN_WIDTH;
  if (event.key === "End") nextWidth = VN_DEVTOOLS_MAX_WIDTH;
  if (nextWidth === undefined) return;
  event.preventDefault();
  resize(clampVnDevtoolsWidth(nextWidth));
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as { matches?: unknown }).matches !== "function") return false;
  return (target as Element).matches("input, textarea, select, [contenteditable='true']");
}
