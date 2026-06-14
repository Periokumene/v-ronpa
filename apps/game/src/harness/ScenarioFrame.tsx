import type { ReactNode } from "react";
import type { HarnessLogEntry } from "./types";

export function ScenarioFrame({
  scenarioId,
  title,
  description,
  status,
  commands,
  log,
  children
}: {
  scenarioId: string;
  title: string;
  description: string;
  status: string;
  commands?: ReactNode;
  log?: HarnessLogEntry[];
  children: ReactNode;
}) {
  return (
    <main className="app-shell app-shell-harness">
      <section className="playfield" data-testid="playfield">
        <div className="harness-stage" data-testid={`scenario-stage-${scenarioId}`}>
          {children}
        </div>
        <div className="hud harness-hud">
          <div className="objective-chip">
            <span data-testid="harness-scenario-id">{scenarioId}</span>
            <strong data-testid="harness-scenario-title">{title}</strong>
            <small data-testid="harness-status">{status}</small>
          </div>
          <div className="command-strip" data-testid="harness-commands">
            {commands ?? <span className="harness-muted">No commands wired yet.</span>}
          </div>
        </div>
      </section>
      <aside className="inspector" aria-label="Harness Inspector" data-testid="harness-inspector">
        <header>
          <span>Harness Scenario</span>
          <strong>{scenarioId}</strong>
        </header>
        <section>
          <h2>Intent</h2>
          <pre>{description}</pre>
        </section>
        <section>
          <h2>Event Log</h2>
          <pre data-testid="harness-event-log">
            {(log ?? [{ id: "boot", label: "Boot", value: "Scenario shell ready" }])
              .map((entry) => `${entry.label}: ${entry.value}`)
              .join("\n")}
          </pre>
        </section>
      </aside>
    </main>
  );
}
