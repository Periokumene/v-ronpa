import type { InspectorLiteProps } from "./types";

export function InspectorLite({
  mode,
  detail,
  inputLock,
  naviSubstate,
  trialPresentation,
  scriptPointer,
  variables,
  inventoryItems,
  evidenceIds,
  trialSegmentId,
  runtimeCommandCount,
  diagnosticCount = 0,
  latestDiagnostic,
  onGrantItem,
  onGrantEvidence,
  onJumpLabel,
  onForceOutcome
}: InspectorLiteProps) {
  return (
    <aside className="inspector" aria-label="Inspector Lite" data-testid="inspector-lite">
      <header>
        <span>Inspector Lite</span>
        <strong>{detail ? `${mode}:${detail}` : mode}</strong>
      </header>
      <dl>
        <div>
          <dt>Navi</dt>
          <dd>{naviSubstate ?? "none"}</dd>
        </div>
        <div>
          <dt>Trial View</dt>
          <dd>{trialPresentation ?? "none"}</dd>
        </div>
        <div>
          <dt>Input</dt>
          <dd>{inputLock ?? "none"}</dd>
        </div>
        <div>
          <dt>Pointer</dt>
          <dd>{scriptPointer}</dd>
        </div>
        <div>
          <dt>Trial</dt>
          <dd>{trialSegmentId ?? "none"}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>{evidenceIds.length}</dd>
        </div>
        <div>
          <dt>Commands</dt>
          <dd>{runtimeCommandCount}</dd>
        </div>
        <div>
          <dt>Diagnostics</dt>
          <dd data-testid="inspector-diagnostics-count">{diagnosticCount}</dd>
        </div>
      </dl>
      <section data-testid="inspector-diagnostics">
        <h2>Diagnostics</h2>
        <pre>{latestDiagnostic ?? "none"}</pre>
      </section>
      <section>
        <h2>Variables</h2>
        <pre>{JSON.stringify(variables, null, 2)}</pre>
      </section>
      <section>
        <h2>Inventory</h2>
        <pre>{JSON.stringify(inventoryItems, null, 2)}</pre>
      </section>
      <div className="inspector-actions">
        <button onClick={() => onGrantItem?.("gift:coffee")}>Grant item</button>
        <button onClick={() => onGrantEvidence?.("evidence:keycard")}>Grant evidence</button>
        <button onClick={() => onJumpLabel?.("Start")}>Jump Start</button>
        <button onClick={() => onForceOutcome?.("correct")}>Force correct</button>
      </div>
    </aside>
  );
}
