import type { CSSProperties, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  VN_DEVTOOLS_MAX_WIDTH,
  VN_DEVTOOLS_MIN_WIDTH,
  canPreviewVnDevtoolsLine,
  clampVnDevtoolsWidth,
  filterVnDevtoolsLines,
  type VnDevtoolsController,
  type VnDevtoolsDecision,
  type VnDevtoolsDiagnostic,
  type VnDevtoolsDockProps,
  type VnDevtoolsSourceLine,
  type VnDevtoolsSummaryItem
} from "./types";
import "./VnDevtoolsDock.css";

const summarySections = [
  ["story", "Story"],
  ["pixi", "Pixi"],
  ["ui", "UI"],
  ["media", "Media"]
] as const;

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

const previewabilityLabels = {
  previewable: "Stable",
  "decision-required": "Decision",
  degraded: "Degraded",
  blocked: "Blocked",
  "no-stable-result": "No stable result"
} as const;

export function VnDevtoolsDock({ controller, className }: VnDevtoolsDockProps) {
  const width = clampVnDevtoolsWidth(controller.width);
  const selectedLine = controller.lines.find((line) => line.id === controller.selectedLineId);
  const visibleLines = filterVnDevtoolsLines(controller.lines, controller.searchQuery);
  const labelLines = controller.lines.filter((line) => line.label !== undefined);
  const errorCount = controller.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = controller.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const selectAndRevealLine = (lineId: string) => {
    controller.actions.selectLine(lineId);
    if (controller.searchQuery) controller.actions.search("");
    if (typeof document === "undefined") return;
    const schedule = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
    schedule(() => {
      const target = [...document.querySelectorAll<HTMLElement>(".vn-devtools-dock [data-line-id]")]
        .find((element) => element.dataset.lineId === lineId);
      target?.scrollIntoView({ block: "nearest" });
    });
  };

  if (controller.collapsed) {
    return (
      <button
        type="button"
        className="vn-devtools-collapsed-button"
        data-testid="vn-devtools-collapsed-button"
        data-game-input-boundary="escape"
        data-status={controller.status.phase}
        aria-label={`Open Nani Workbench. ${statusLabels[controller.status.phase]}. ${errorCount} errors, ${warningCount} warnings.`}
        onClick={() => controller.actions.setCollapsed(false)}
      >
        <span aria-hidden="true">N</span>
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
      className={rootClassName}
      style={style}
      aria-label="Nani Workbench"
      data-testid="vn-devtools-dock"
      data-game-input-boundary="escape"
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

      <header className="vn-devtools-header">
        <div className="vn-devtools-title-block">
          <span className="vn-devtools-kicker">DEV · {controller.entryId}</span>
          <h1>Nani Workbench</h1>
          <span className="vn-devtools-script-path" title={controller.scriptPath}>
            {controller.scriptPath}
          </span>
        </div>
        <button
          type="button"
          className="vn-devtools-icon-button"
          aria-label="Collapse Nani Workbench"
          title="Collapse"
          onClick={() => controller.actions.setCollapsed(true)}
        >
          →
        </button>
      </header>

      <section className="vn-devtools-status" data-phase={controller.status.phase} aria-live="polite">
        <div>
          <span className="vn-devtools-status-dot" aria-hidden="true" />
          <strong>{statusLabels[controller.status.phase]}</strong>
          {controller.status.degraded && <span className="vn-devtools-status-tag">degraded</span>}
        </div>
        {controller.status.message && <p>{controller.status.message}</p>}
        <span className="vn-devtools-revision">
          {controller.scriptRevision ? `rev ${controller.scriptRevision.slice(0, 12)}` : "revision unavailable"}
          {controller.status.updateId !== undefined ? ` · update ${controller.status.updateId}` : ""}
        </span>
      </section>

      <div className="vn-devtools-toolbar" role="toolbar" aria-label="Nani preview actions">
        <button type="button" onClick={controller.actions.pinCurrent}>
          Pin current
        </button>
        <button type="button" onClick={controller.actions.unpin}>
          Unpin
        </button>
        <button
          type="button"
          disabled={selectedLine === undefined}
          onClick={() => {
            if (selectedLine) {
              controller.actions.copyLocation({ scriptPath: controller.scriptPath, lineNumber: selectedLine.lineNumber });
            }
          }}
        >
          Copy path:line
        </button>
      </div>

      <label className="vn-devtools-search">
        <span className="vn-devtools-visually-hidden">Search Nani source</span>
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={controller.searchQuery}
          placeholder="Search source, label, command…"
          data-testid="vn-devtools-search"
          onChange={(event) => controller.actions.search(event.currentTarget.value)}
        />
        {controller.searchQuery.length > 0 && (
          <button type="button" aria-label="Clear search" onClick={() => controller.actions.search("")}>
            ×
          </button>
        )}
      </label>

      {labelLines.length > 0 && (
        <nav className="vn-devtools-outline" aria-label="Nani labels">
          <span>Labels</span>
          <div>
            {labelLines.map((line) => (
              <button key={line.id} type="button" onClick={() => selectAndRevealLine(line.id)}>
                {line.label}
                <small>{line.lineNumber}</small>
              </button>
            ))}
          </div>
        </nav>
      )}

      <section className="vn-devtools-source-panel" aria-label="Nani source">
        <div className="vn-devtools-panel-heading">
          <h2>Source</h2>
          <span>{visibleLines.length === controller.lines.length ? `${controller.lines.length} lines` : `${visibleLines.length}/${controller.lines.length}`}</span>
        </div>
        {visibleLines.length === 0 ? (
          <p className="vn-devtools-empty">No source lines match this search.</p>
        ) : (
          <ol className="vn-devtools-source-list" data-testid="vn-devtools-source-list">
            {visibleLines.map((line) => (
              <SourceLine
                key={line.id}
                line={line}
                selected={line.id === controller.selectedLineId}
                onSelect={controller.actions.selectLine}
                onPreview={controller.actions.previewLine}
              />
            ))}
          </ol>
        )}
      </section>

      {controller.decision && (
        <DecisionPanel
          decision={controller.decision}
          onCancel={controller.actions.cancelDecision}
          onSubmit={controller.actions.submitDecision}
        />
      )}

      <DiagnosticsPanel diagnostics={controller.diagnostics} onSelectLine={selectAndRevealLine} />

      <section className="vn-devtools-runtime-state" aria-label="Runtime state summaries">
        <div className="vn-devtools-panel-heading">
          <h2>Stable state</h2>
          <span>read-only</span>
        </div>
        <div className="vn-devtools-summary-grid">
          {summarySections.map(([key, label]) => (
            <SummarySection key={key} label={label} items={controller.summaries[key]} defaultOpen={key === "story"} />
          ))}
        </div>
      </section>

      <footer className="vn-devtools-footer">
        <span><kbd>⌘/Ctrl</kbd> + <kbd>Enter</kbd> preview</span>
        <span><kbd>/</kbd> search · <kbd>Esc</kbd> cancel</span>
      </footer>
    </aside>
  );
}

interface SourceLineProps {
  line: VnDevtoolsSourceLine;
  selected: boolean;
  onSelect: (lineId: string) => void;
  onPreview: (lineId: string) => void;
}

function SourceLine({ line, selected, onSelect, onPreview }: SourceLineProps) {
  const previewable = canPreviewVnDevtoolsLine(line);
  const classes = [
    "vn-devtools-source-line",
    selected && "is-selected",
    line.current && "is-current",
    line.pinned && "is-pinned"
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      className={classes}
      data-line-id={line.id}
      data-previewability={line.previewability}
      data-testid={`vn-devtools-line-${line.id}`}
      aria-current={line.current ? "step" : undefined}
    >
      <button
        type="button"
        className="vn-devtools-line-select"
        aria-label={`Select line ${line.lineNumber}${line.label ? `, label ${line.label}` : ""}`}
        onClick={() => onSelect(line.id)}
      >
        <span className="vn-devtools-line-number">{line.lineNumber}</span>
        <span className="vn-devtools-line-markers">
          {line.current && <span title="Current runtime position" aria-label="Current runtime position">▶</span>}
          {line.pinned && <span title="Pinned preview target" aria-label="Pinned preview target">◆</span>}
        </span>
        <code>{line.sourceText.length > 0 ? line.sourceText : "\u00a0"}</code>
      </button>
      <span className="vn-devtools-line-meta">
        {line.command && <span className="vn-devtools-command">{line.command}</span>}
        <span className={`vn-devtools-previewability is-${line.previewability}`}>
          {previewabilityLabels[line.previewability]}
        </span>
        {(line.diagnostics?.length ?? 0) > 0 && (
          <span className="vn-devtools-line-diagnostic" title={`${line.diagnostics?.length ?? 0} diagnostics`}>
            {line.diagnostics?.length}
          </span>
        )}
      </span>
      <button
        type="button"
        className="vn-devtools-preview-button"
        disabled={!previewable}
        aria-label={`Preview stable result through line ${line.lineNumber}`}
        title={previewable ? "Execute this line and show its stable result" : previewabilityLabels[line.previewability]}
        onClick={() => onPreview(line.id)}
      >
        Preview
      </button>
    </li>
  );
}

interface DecisionPanelProps {
  decision: VnDevtoolsDecision;
  onSubmit: VnDevtoolsController["actions"]["submitDecision"];
  onCancel: () => void;
}

function DecisionPanel({ decision, onSubmit, onCancel }: DecisionPanelProps) {
  return (
    <section className="vn-devtools-decision" aria-label="Preview decision" data-testid="vn-devtools-decision">
      <div className="vn-devtools-panel-heading">
        <h2>Decision required</h2>
        <span>{decision.kind}</span>
      </div>
      <p>{decision.prompt}</p>
      <form onSubmit={(event) => submitDecisionForm(event, decision, onSubmit)}>
        {decision.kind === "choice" ? (
          <fieldset>
            <legend>Choose a branch</legend>
            {decision.options.map((option) => (
              <label key={option.id} className="vn-devtools-decision-option">
                <input
                  type="radio"
                  name="optionId"
                  value={option.id}
                  disabled={!option.enabled}
                  defaultChecked={option.id === decision.selectedOptionId}
                  required
                />
                <span>
                  <strong>{option.label}</strong>
                  {option.detail && <small>{option.detail}</small>}
                </span>
              </label>
            ))}
          </fieldset>
        ) : decision.inputType === "boolean" ? (
          <fieldset>
            <legend>{decision.variableName}</legend>
            <label className="vn-devtools-decision-option">
              <input
                type="radio"
                name="value"
                value="true"
                defaultChecked={decision.defaultValue === "true"}
                required
              />
              <span>True</span>
            </label>
            <label className="vn-devtools-decision-option">
              <input
                type="radio"
                name="value"
                value="false"
                defaultChecked={decision.defaultValue === "false"}
                required
              />
              <span>False</span>
            </label>
          </fieldset>
        ) : (
          <label className="vn-devtools-decision-input">
            <span>{decision.variableName}</span>
            <input
              name="value"
              type={decision.inputType === "number" ? "number" : "text"}
              defaultValue={decision.defaultValue}
              required
              autoFocus
            />
          </label>
        )}
        {decision.kind === "input" && decision.validationMessage && (
          <p className="vn-devtools-validation">{decision.validationMessage}</p>
        )}
        <div className="vn-devtools-decision-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="is-primary">Continue preview</button>
        </div>
      </form>
    </section>
  );
}

function DiagnosticsPanel({
  diagnostics,
  onSelectLine
}: {
  diagnostics: readonly VnDevtoolsDiagnostic[];
  onSelectLine: (lineId: string) => void;
}) {
  return (
    <section className="vn-devtools-diagnostics" aria-label="Nani diagnostics">
      <div className="vn-devtools-panel-heading">
        <h2>Diagnostics</h2>
        <span>{diagnostics.length}</span>
      </div>
      {diagnostics.length === 0 ? (
        <p className="vn-devtools-empty is-compact">No diagnostics.</p>
      ) : (
        <ul>
          {diagnostics.map((diagnostic) => (
            <li key={diagnostic.id} data-severity={diagnostic.severity}>
              <button
                type="button"
                disabled={diagnostic.lineId === undefined}
                onClick={() => {
                  if (diagnostic.lineId) onSelectLine(diagnostic.lineId);
                }}
              >
                <span className="vn-devtools-diagnostic-code">
                  {diagnostic.code ?? diagnostic.severity}
                  {diagnostic.lineNumber !== undefined ? ` · ${diagnostic.lineNumber}` : ""}
                </span>
                <span>{diagnostic.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SummarySection({
  label,
  items,
  defaultOpen
}: {
  label: string;
  items: readonly VnDevtoolsSummaryItem[];
  defaultOpen: boolean;
}) {
  return (
    <details open={defaultOpen}>
      <summary>
        {label}<span>{items.length}</span>
      </summary>
      {items.length === 0 ? (
        <p className="vn-devtools-empty is-compact">No stable state.</p>
      ) : (
        <dl>
          {items.map((item, index) => (
            <div key={`${item.label}:${index}`} data-tone={item.tone ?? "neutral"}>
              <dt>{item.label}</dt>
              <dd>{formatSummaryValue(item.value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </details>
  );
}

function handleDockKeyboard(
  event: KeyboardEvent<HTMLElement>,
  controller: VnDevtoolsController,
  selectedLine: VnDevtoolsSourceLine | undefined
) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    if (selectedLine && canPreviewVnDevtoolsLine(selectedLine)) {
      event.preventDefault();
      event.stopPropagation();
      controller.actions.previewLine(selectedLine.id);
    }
    return;
  }

  if (event.key === "/" && !isTextEntryTarget(event.target)) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.querySelector<HTMLInputElement>("[data-testid='vn-devtools-search']")?.focus();
    return;
  }

  if (event.key === "Escape") {
    event.stopPropagation();
    if (controller.decision) {
      event.preventDefault();
      controller.actions.cancelDecision();
    } else if (controller.searchQuery.length > 0) {
      event.preventDefault();
      controller.actions.search("");
    } else if (["inspecting", "updating", "materializing"].includes(controller.status.phase)) {
      event.preventDefault();
      controller.actions.cancelCandidate();
    }
  }
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

function submitDecisionForm(
  event: FormEvent<HTMLFormElement>,
  decision: VnDevtoolsDecision,
  submit: VnDevtoolsController["actions"]["submitDecision"]
) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  if (decision.kind === "choice") {
    const optionId = formData.get("optionId");
    if (typeof optionId === "string") submit({ kind: "choice", decisionId: decision.id, optionId });
    return;
  }

  const rawValue = formData.get("value");
  if (typeof rawValue !== "string") return;
  if (decision.inputType === "number") {
    const numberValue = Number(rawValue);
    if (Number.isFinite(numberValue)) submit({ kind: "input", decisionId: decision.id, value: numberValue });
    return;
  }
  if (decision.inputType === "boolean") {
    submit({ kind: "input", decisionId: decision.id, value: rawValue === "true" });
    return;
  }
  submit({ kind: "input", decisionId: decision.id, value: rawValue });
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as { matches?: unknown }).matches !== "function") return false;
  return (target as Element).matches("input, textarea, select, [contenteditable='true']");
}

function formatSummaryValue(value: VnDevtoolsSummaryItem["value"]): string {
  if (value === null) return "none";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
