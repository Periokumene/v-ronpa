import {
  Bug,
  CaretDown,
  CaretRight,
  GitBranch,
  Info,
  ListBullets,
  Prohibit,
  WarningCircle
} from "@phosphor-icons/react";
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode
} from "react";
import {
  clampVnDevtoolsPanelHeight,
  VN_DEVTOOLS_MAX_PANEL_HEIGHT,
  VN_DEVTOOLS_MIN_PANEL_HEIGHT,
  type VnDevtoolsController,
  type VnDevtoolsDecision,
  type VnDevtoolsDiagnostic,
  type VnDevtoolsPanelId,
  type VnDevtoolsSummaryItem
} from "./types";

type InternalPanelId = VnDevtoolsPanelId | "branch";

const panelDescriptors = [
  { id: "problems", label: "Problems", icon: Bug },
  { id: "state", label: "State", icon: ListBullets },
  { id: "branch", label: "Branch", icon: GitBranch, transient: true }
] as const satisfies ReadonlyArray<{
  id: InternalPanelId;
  label: string;
  icon: typeof Bug;
  transient?: true;
}>;

const summarySections = [
  ["story", "Story"],
  ["pixi", "Pixi"],
  ["ui", "UI"],
  ["media", "Media"]
] as const;

export function WorkbenchToolPanel({ controller }: { controller: VnDevtoolsController }) {
  const forcedBranch = controller.decision !== undefined;
  const activePanel: InternalPanelId = forcedBranch ? "branch" : controller.layout.activePanel;
  const panelOpen = forcedBranch || controller.layout.bottomPanelOpen;
  const errorCount = controller.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = controller.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const style = {
    "--vn-devtools-bottom-panel-height": `${controller.layout.bottomPanelHeight}px`
  } as CSSProperties;

  return (
    <section
      className={`vn-devtools-bottom-panel${panelOpen ? " is-open" : ""}`}
      style={style}
      data-testid="vn-devtools-bottom-panel"
      data-active-panel={activePanel}
      aria-label="Workbench tools"
    >
      {panelOpen && !forcedBranch && (
        <div
          className="vn-devtools-panel-resizer"
          role="separator"
          aria-label="Resize bottom panel"
          aria-orientation="horizontal"
          aria-valuemin={VN_DEVTOOLS_MIN_PANEL_HEIGHT}
          aria-valuemax={VN_DEVTOOLS_MAX_PANEL_HEIGHT}
          aria-valuenow={controller.layout.bottomPanelHeight}
          tabIndex={0}
          data-testid="vn-devtools-panel-resizer"
          onPointerDown={(event) => startPanelResize(event, controller.layout.bottomPanelHeight)}
          onPointerMove={(event) => continuePanelResize(event, controller.actions.updateLayout)}
          onPointerUp={finishPanelResize}
          onPointerCancel={finishPanelResize}
          onKeyDown={(event) => resizePanelWithKeyboard(
            event,
            controller.layout.bottomPanelHeight,
            controller.actions.updateLayout
          )}
        />
      )}
      <div className="vn-devtools-panel-tabs" role="tablist" aria-label="Workbench panels">
        {panelDescriptors.map((descriptor) => {
          const transient = "transient" in descriptor && descriptor.transient;
          if (transient && !forcedBranch) return null;
          const Icon = descriptor.icon;
          const selected = descriptor.id === activePanel;
          const badge = descriptor.id === "problems" ? errorCount + warningCount : undefined;
          return (
            <button
              key={descriptor.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`vn-devtools-panel-${descriptor.id}`}
              disabled={forcedBranch && descriptor.id !== "branch"}
              data-panel-id={descriptor.id}
              onClick={() => {
                if (descriptor.id === "branch") return;
                controller.actions.updateLayout({
                  activePanel: descriptor.id,
                  bottomPanelOpen: selected ? !panelOpen : true
                });
              }}
            >
              <Icon size={14} weight={selected ? "fill" : "regular"} aria-hidden="true" />
              <span>{descriptor.label}</span>
              {badge !== undefined && badge > 0 && (
                <span className={errorCount > 0 ? "vn-devtools-tab-badge is-error" : "vn-devtools-tab-badge"}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
        <span className="vn-devtools-panel-spacer" />
        <span className="vn-devtools-panel-height" aria-hidden="true">
          {panelOpen && !forcedBranch ? `${controller.layout.bottomPanelHeight}px` : ""}
        </span>
      </div>
      {panelOpen && (
        <div
          id={`vn-devtools-panel-${activePanel}`}
          className="vn-devtools-panel-content"
          role="tabpanel"
          data-testid={`vn-devtools-panel-${activePanel}`}
        >
          {activePanel === "problems" && <ProblemsPanel controller={controller} />}
          {activePanel === "state" && <StatePanel controller={controller} />}
          {activePanel === "branch" && controller.decision && (
            <BranchPanel
              decision={controller.decision}
              onCancel={controller.actions.cancelDecision}
              onSubmit={controller.actions.submitDecision}
            />
          )}
        </div>
      )}
    </section>
  );
}

function ProblemsPanel({ controller }: { controller: VnDevtoolsController }) {
  const operationProblem = controller.status.phase === "blocked" || controller.status.phase === "error"
    ? controller.status
    : undefined;
  if (!operationProblem && controller.diagnostics.length === 0) {
    return <p className="vn-devtools-empty is-compact">No problems detected.</p>;
  }
  return (
    <ul className="vn-devtools-problem-list" aria-label="Nani diagnostics">
      {operationProblem && (
        <li data-severity={operationProblem.phase === "error" ? "error" : "warning"}>
          <ProblemIcon severity={operationProblem.phase === "error" ? "error" : "warning"} />
          <div>
            <strong>{operationProblem.phase === "error" ? "Operation failed" : "Operation blocked"}</strong>
            <span>{operationProblem.message ?? "The operation could not complete."}</span>
          </div>
        </li>
      )}
      {controller.diagnostics.map((diagnostic) => (
        <li key={diagnostic.id} data-severity={diagnostic.severity}>
          <ProblemIcon severity={diagnostic.severity} />
          <button
            type="button"
            disabled={diagnostic.lineId === undefined}
            onClick={() => {
              if (diagnostic.lineId) selectAndRevealLine(controller, diagnostic.lineId);
            }}
          >
            <strong>
              {diagnostic.code ?? diagnostic.severity}
              {diagnostic.lineNumber !== undefined
                ? ` · Ln ${diagnostic.lineNumber}${diagnostic.columnNumber !== undefined
                  ? `, Col ${diagnostic.columnNumber}`
                  : ""}`
                : ""}
            </strong>
            <span>{diagnostic.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ProblemIcon({ severity }: { severity: VnDevtoolsDiagnostic["severity"] }) {
  if (severity === "error") return <Prohibit size={15} weight="fill" aria-label="Error" />;
  if (severity === "warning") return <WarningCircle size={15} weight="fill" aria-label="Warning" />;
  return <Info size={15} weight="fill" aria-label="Information" />;
}

function StatePanel({ controller }: { controller: VnDevtoolsController }) {
  return (
    <div className="vn-devtools-state-tree" aria-label="Stable state summaries">
      {summarySections.map(([key, label]) => (
        <SummarySection
          key={key}
          label={label}
          items={controller.summaries[key]}
          defaultOpen={key === "story" || key === "pixi"}
        />
      ))}
    </div>
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
        <CaretRight className="vn-devtools-summary-chevron" size={12} weight="bold" aria-hidden="true" />
        <CaretDown className="vn-devtools-summary-chevron-open" size={12} weight="bold" aria-hidden="true" />
        <span>{label}</span>
        <small>{items.length}</small>
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

function BranchPanel({
  decision,
  onSubmit,
  onCancel
}: {
  decision: VnDevtoolsDecision;
  onSubmit: VnDevtoolsController["actions"]["submitDecision"];
  onCancel: () => void;
}) {
  return (
    <div className="vn-devtools-branch" data-testid="vn-devtools-decision">
      <header>
        <GitBranch size={18} weight="bold" aria-hidden="true" />
        <div>
          <strong>Resolve preview path</strong>
          <span>{decision.prompt}</span>
        </div>
      </header>
      <form onSubmit={(event) => submitDecisionForm(event, decision, onSubmit)}>
        {decision.kind === "choice" ? (
          <fieldset>
            <legend>Choose a branch</legend>
            <div className="vn-devtools-quick-pick">
              {decision.options.map((option) => (
                <label key={option.id}>
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
            </div>
          </fieldset>
        ) : decision.inputType === "boolean" ? (
          <fieldset>
            <legend>{decision.variableName}</legend>
            <div className="vn-devtools-quick-pick is-boolean">
              {["true", "false"].map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="value"
                    value={value}
                    defaultChecked={decision.defaultValue === value}
                    required
                  />
                  <span>{value === "true" ? "True" : "False"}</span>
                </label>
              ))}
            </div>
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
    </div>
  );
}

function startPanelResize(event: ReactPointerEvent<HTMLDivElement>, height: number) {
  event.preventDefault();
  event.currentTarget.dataset.resizeStartY = String(event.clientY);
  event.currentTarget.dataset.resizeStartHeight = String(height);
  event.currentTarget.setPointerCapture(event.pointerId);
}

function continuePanelResize(
  event: ReactPointerEvent<HTMLDivElement>,
  updateLayout: VnDevtoolsController["actions"]["updateLayout"]
) {
  const startY = Number(event.currentTarget.dataset.resizeStartY);
  const startHeight = Number(event.currentTarget.dataset.resizeStartHeight);
  if (!Number.isFinite(startY) || !Number.isFinite(startHeight)) return;
  updateLayout({ bottomPanelHeight: clampVnDevtoolsPanelHeight(startHeight + startY - event.clientY) });
}

function finishPanelResize(event: ReactPointerEvent<HTMLDivElement>) {
  delete event.currentTarget.dataset.resizeStartY;
  delete event.currentTarget.dataset.resizeStartHeight;
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

function resizePanelWithKeyboard(
  event: KeyboardEvent<HTMLDivElement>,
  height: number,
  updateLayout: VnDevtoolsController["actions"]["updateLayout"]
) {
  const step = event.shiftKey ? 48 : 16;
  let nextHeight: number | undefined;
  if (event.key === "ArrowUp") nextHeight = height + step;
  if (event.key === "ArrowDown") nextHeight = height - step;
  if (event.key === "Home") nextHeight = VN_DEVTOOLS_MIN_PANEL_HEIGHT;
  if (event.key === "End") nextHeight = VN_DEVTOOLS_MAX_PANEL_HEIGHT;
  if (nextHeight === undefined) return;
  event.preventDefault();
  updateLayout({ bottomPanelHeight: clampVnDevtoolsPanelHeight(nextHeight) });
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

function selectAndRevealLine(controller: VnDevtoolsController, lineId: string) {
  controller.actions.selectLine(lineId);
  scheduleRevealLine(lineId);
}

function scheduleRevealLine(lineId: string) {
  if (typeof document === "undefined") return;
  const schedule = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
  schedule(() => {
    const target = [...document.querySelectorAll<HTMLElement>(".vn-devtools-dock [data-line-id]")]
      .find((element) => element.dataset.lineId === lineId);
    target?.scrollIntoView({ block: "center" });
  });
}

function formatSummaryValue(value: VnDevtoolsSummaryItem["value"]): ReactNode {
  if (value === null) return <span className="is-null">none</span>;
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
