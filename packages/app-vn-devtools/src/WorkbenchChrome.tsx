import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  CircleNotch,
  Copy,
  GitBranch,
  MagnifyingGlass,
  Play,
  PushPin,
  SidebarSimple,
  WarningCircle,
  X,
  XCircle
} from "@phosphor-icons/react";
import { stepVnDevtoolsFindMatch, type VnDevtoolsFindResult } from "./sourceViewModel";
import { canPreviewVnDevtoolsLine, type VnDevtoolsController } from "./types";

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

export function WorkbenchFileBar({ controller }: { controller: VnDevtoolsController }) {
  const errorCount = controller.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = controller.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const fileLabel = formatFileLabel(controller.scriptPath);
  return (
    <header className="vn-devtools-file-bar" data-testid="vn-devtools-file-bar">
      <div className="vn-devtools-file-identity" title={controller.scriptPath}>
        <span>DEV · VN:{controller.entryId}</span>
        <strong>{fileLabel}</strong>
      </div>
      <div className="vn-devtools-file-status" data-phase={controller.status.phase}>
        <StatusIcon controller={controller} />
        <span>{statusLabels[controller.status.phase]}</span>
        {controller.status.degraded && <span className="vn-devtools-degraded-label">Degraded</span>}
        {warningCount > 0 && <span className="vn-devtools-diagnostic-count is-warning">{warningCount}</span>}
        {errorCount > 0 && <span className="vn-devtools-diagnostic-count is-error">{errorCount}</span>}
      </div>
      <button
        type="button"
        className="vn-devtools-icon-button"
        aria-label="Collapse Nani Workbench"
        title="Collapse workbench"
        onClick={() => controller.actions.setCollapsed(true)}
      >
        <SidebarSimple size={17} weight="bold" aria-hidden="true" />
      </button>
    </header>
  );
}

export function WorkbenchCommandStrip({
  controller,
  findResult
}: {
  controller: VnDevtoolsController;
  findResult: VnDevtoolsFindResult;
}) {
  const selectedLine = controller.lines.find((line) => line.id === controller.selectedLineId);
  const primary = resolvePrimaryAction(controller, selectedLine);
  return (
    <div className="vn-devtools-command-strip" role="toolbar" aria-label="Nani preview actions" data-testid="vn-devtools-command-strip">
      <button
        type="button"
        className="vn-devtools-primary-action"
        disabled={primary.disabled}
        aria-label={primary.label}
        title={primary.title}
        data-testid="vn-devtools-primary-action"
        onClick={primary.onClick}
      >
        <primary.Icon size={15} weight="fill" aria-hidden="true" />
        <span>{primary.label}</span>
      </button>
      <span className="vn-devtools-command-divider" aria-hidden="true" />
      <ToolButton label="Pin current" onClick={controller.actions.pinCurrent} Icon={PushPin} />
      <ToolButton label="Clear fixed point" onClick={controller.actions.unpin} Icon={XCircle} />
      <ToolButton
        label="Copy location"
        disabled={!selectedLine}
        onClick={() => {
          if (selectedLine) {
            controller.actions.copyLocation({
              scriptPath: controller.scriptPath,
              lineNumber: selectedLine.lineNumber
            });
          }
        }}
        Icon={Copy}
      />
      <FindControl controller={controller} result={findResult} />
    </div>
  );
}

export function WorkbenchStatusBar({ controller }: { controller: VnDevtoolsController }) {
  const current = controller.lines.find((line) => line.current);
  const pinned = controller.lines.find((line) => line.pinned);
  return (
    <footer className="vn-devtools-status-bar" data-testid="vn-devtools-status-bar" aria-live="polite">
      <span title={controller.scriptRevision}>
        {controller.scriptRevision ? `rev ${controller.scriptRevision.slice(0, 10)}` : "revision unavailable"}
      </span>
      <span>current {current ? `Ln ${current.lineNumber}` : "–"}</span>
      <span>pin {pinned ? `Ln ${pinned.lineNumber}` : "–"}</span>
      {controller.status.updateId !== undefined && <span>update {controller.status.updateId}</span>}
      <span className="vn-devtools-status-message" title={controller.status.message}>
        {controller.status.message ?? statusLabels[controller.status.phase]}
      </span>
      <span className="vn-devtools-shortcut-hint">Ctrl+Enter · Ctrl+J</span>
    </footer>
  );
}

function FindControl({
  controller,
  result
}: {
  controller: VnDevtoolsController;
  result: VnDevtoolsFindResult;
}) {
  return (
    <div
      className={`vn-devtools-find${controller.searchQuery ? " has-query" : ""}`}
      data-current-match={result.currentMatchIndex}
      data-testid="vn-devtools-find"
    >
      <button
        type="button"
        className="vn-devtools-find-trigger"
        aria-label="Find in source"
        title="Find in source (Cmd/Ctrl+F)"
        onClick={(event) => {
          const find = event.currentTarget.closest<HTMLElement>(".vn-devtools-find");
          find?.classList.add("is-open");
          find?.querySelector<HTMLInputElement>("input")?.focus();
        }}
      >
        <MagnifyingGlass size={15} weight="bold" aria-hidden="true" />
      </button>
      <div className="vn-devtools-find-input-row">
        <MagnifyingGlass size={14} aria-hidden="true" />
        <input
          type="search"
          value={controller.searchQuery}
          placeholder="Find"
          aria-label="Find in Nani source"
          data-testid="vn-devtools-search"
          onChange={(event) => controller.actions.search(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              stepFind(event.currentTarget.closest(".vn-devtools-find"), controller, result, event.shiftKey ? -1 : 1);
            }
          }}
        />
        <span className="vn-devtools-find-count" data-testid="vn-devtools-find-count">
          {result.matches.length > 0 ? `${result.currentMatchIndex + 1} / ${result.matches.length}` : "0 / 0"}
        </span>
        <button
          type="button"
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          disabled={result.matches.length === 0}
          onClick={(event) => stepFind(event.currentTarget.closest(".vn-devtools-find"), controller, result, -1)}
        >
          <ArrowUp size={13} weight="bold" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Next match"
          title="Next match (Enter)"
          disabled={result.matches.length === 0}
          onClick={(event) => stepFind(event.currentTarget.closest(".vn-devtools-find"), controller, result, 1)}
        >
          <ArrowDown size={13} weight="bold" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Close find"
          title="Close find"
          onClick={(event) => {
            controller.actions.search("");
            const find = event.currentTarget.closest<HTMLElement>(".vn-devtools-find");
            find?.classList.remove("is-open");
            find?.querySelector<HTMLInputElement>("input")?.blur();
            event.currentTarget.blur();
            find?.closest<HTMLElement>("[data-testid='vn-devtools-dock']")?.focus();
          }}
        >
          <X size={13} weight="bold" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  Icon
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  Icon: typeof PushPin;
}) {
  return (
    <button
      type="button"
      className="vn-devtools-tool-button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={15} weight="bold" aria-hidden="true" />
      <span className="vn-devtools-tool-label">{label}</span>
    </button>
  );
}

function resolvePrimaryAction(
  controller: VnDevtoolsController,
  selectedLine: VnDevtoolsController["lines"][number] | undefined
) {
  if (controller.decision) {
    return {
      label: "Resolve decision",
      title: "Focus the Branch panel to continue",
      Icon: GitBranch,
      disabled: false,
      onClick: () => focusBranchPanel()
    };
  }
  const busy = controller.status.phase === "inspecting"
    || controller.status.phase === "updating"
    || controller.status.phase === "materializing";
  if (busy && controller.status.cancellable) {
    return {
      label: "Cancel",
      title: "Cancel this side-effect-free workbench task",
      Icon: X,
      disabled: false,
      onClick: controller.actions.cancelCandidate
    };
  }
  if (busy) {
    return {
      label: "Finishing…",
      title: "The host accepted the checkpoint; restore is finishing",
      Icon: CircleNotch,
      disabled: true,
      onClick: () => undefined
    };
  }
  const previewable = selectedLine !== undefined && canPreviewVnDevtoolsLine(selectedLine);
  const title = selectedLine === undefined
    ? "Select a source line to preview"
    : previewable
      ? "Execute through the selected line and install its stable result"
      : selectedLine.previewability === "no-stable-result"
        ? "The selected line has no stable result"
        : "The selected target cannot be previewed";
  return {
    label: "Preview selected line",
    title,
    Icon: Play,
    disabled: !previewable,
    onClick: () => {
      if (selectedLine && previewable) controller.actions.previewLine(selectedLine.id);
    }
  };
}

function StatusIcon({ controller }: { controller: VnDevtoolsController }) {
  if (controller.status.phase === "ready" || controller.status.phase === "idle") {
    return <CheckCircle size={15} weight="fill" aria-hidden="true" />;
  }
  if (controller.status.phase === "blocked" || controller.status.phase === "decision-required") {
    return <WarningCircle size={15} weight="fill" aria-hidden="true" />;
  }
  if (controller.status.phase === "error") return <XCircle size={15} weight="fill" aria-hidden="true" />;
  return <CircleNotch className="vn-devtools-busy-icon" size={15} weight="bold" aria-hidden="true" />;
}

function stepFind(
  root: Element | null,
  controller: VnDevtoolsController,
  result: VnDevtoolsFindResult,
  direction: 1 | -1
) {
  if (!root || result.matches.length === 0) return;
  const current = Number((root as HTMLElement).dataset.currentMatch);
  const next = stepVnDevtoolsFindMatch(Number.isFinite(current) ? current : result.currentMatchIndex, result.matches.length, direction);
  const match = result.matches[next];
  if (!match) return;
  (root as HTMLElement).dataset.currentMatch = String(next);
  root.querySelector<HTMLElement>("[data-testid='vn-devtools-find-count']")!.textContent = `${next + 1} / ${result.matches.length}`;
  const dock = root.closest(".vn-devtools-dock");
  dock?.querySelectorAll<HTMLElement>("[data-find-current]").forEach((line) => line.removeAttribute("data-find-current"));
  const line = [...(dock?.querySelectorAll<HTMLElement>("[data-line-id]") ?? [])]
    .find((candidate) => candidate.dataset.lineId === match.lineId);
  line?.setAttribute("data-find-current", "true");
  line?.scrollIntoView({ block: "center" });
  controller.actions.selectLine(match.lineId);
}

function focusBranchPanel() {
  if (typeof document === "undefined") return;
  document.querySelector<HTMLElement>("[data-testid='vn-devtools-decision'] input:not(:disabled)")?.focus();
}

function formatFileLabel(scriptPath: string): string {
  const parts = scriptPath.split("/").filter(Boolean);
  if (parts.length < 2) return scriptPath;
  return `${parts.at(-2)} / ${parts.at(-1)}`;
}
