import { useState, type ButtonHTMLAttributes } from "react";
import type { GameplayState } from "@v-ronpa/gameplay";
import { ExplorationStage3D } from "@v-ronpa/r3f-adapter";
import { InspectorLite } from "@v-ronpa/ui-kit";
import { GameInteractionShell } from "../../../interaction/GameInteractionShell";
import { useGameFlowActor } from "../../../interaction/useGameFlowActor";
import { useOverlayPageAdapters } from "../../../interaction/useOverlayPageAdapters";
import { useVerticalSliceRuntimeAdapter, type PosePresetId, verticalSlicePosePresets } from "../../../interaction/useVerticalSliceRuntimeAdapter";
import { useVerticalSliceSaveAdapter } from "../../../interaction/useVerticalSliceSaveAdapter";
import { VnRuntimeDispatcher } from "../../../VnRuntimeDispatcher";

type DebugTabId = "runtime" | "inspector";

export function VerticalSliceScenario() {
  const flow = useGameFlowActor();
  const runtime = useVerticalSliceRuntimeAdapter(flow.mode);
  const save = useVerticalSliceSaveAdapter(runtime);
  const overlayPages = useOverlayPageAdapters({ flow, runtime, save });
  const [activeDebugTab, setActiveDebugTab] = useState<DebugTabId>("runtime");

  return (
    <main className="app-shell app-shell-harness">
      <section className="playfield" data-testid="playfield">
        <GameInteractionShell flow={flow} overlayPages={overlayPages} runtime={runtime}>
          <div className="scene-stack" data-testid="vertical-slice-shell">
            <ExplorationStage3D {...runtime.firstPersonBridge.explorationStageProps} />
            <VnRuntimeDispatcher
              active={runtime.storyRuntime.active}
              story={runtime.storyRuntime.state}
              storySession={runtime.storySession}
              formatSpeaker={displayStorySpeaker}
              onAdvance={runtime.advanceStory}
              onChoice={runtime.chooseStory}
              onCancel={() => runtime.closeStoryOverlay()}
            />
          </div>
        </GameInteractionShell>
        <div className="hud harness-hud vertical-slice-hud">
          <div className="objective-chip">
            <span data-testid="harness-scenario-id">vertical-slice</span>
            <strong data-testid="harness-scenario-title">Navi To VN Vertical Slice</strong>
            <small data-testid="harness-status">{flow.mode === "title" ? "标题界面" : runtime.storyRuntime.active ? "视觉小说覆盖层" : "Navi 探索"}</small>
          </div>
        </div>
      </section>
      <aside className="vertical-slice-sidebar" aria-label="Vertical slice debug sidebar" data-testid="vertical-slice-debug-sidebar">
        <div aria-label="Vertical slice debug panels" className="vertical-slice-debug-tabs" role="tablist">
          <DebugTabButton
            active={activeDebugTab === "runtime"}
            controls="vertical-slice-runtime-panel"
            id="vertical-slice-runtime-tab"
            label="Runtime"
            onSelect={() => setActiveDebugTab("runtime")}
            testId="vertical-slice-debug-tab-runtime"
          />
          <DebugTabButton
            active={activeDebugTab === "inspector"}
            controls="vertical-slice-inspector-panel"
            id="vertical-slice-inspector-tab"
            label="Inspector"
            onSelect={() => setActiveDebugTab("inspector")}
            testId="vertical-slice-debug-tab-inspector"
          />
        </div>
        <div className="vertical-slice-debug-panels">
          {activeDebugTab === "runtime" ? (
            <div
              aria-labelledby="vertical-slice-runtime-tab"
              className="vertical-slice-debug-panel vertical-slice-runtime-panel"
              data-testid="vertical-slice-debug-panel-runtime"
              id="vertical-slice-runtime-panel"
              role="tabpanel"
            >
              <VerticalSliceReadout
                activeInteractableId={runtime.navi.activeInteractableId ?? "none"}
                blockedReason={runtime.interactionView.blockedReason ?? "none"}
                canConfirm={String(runtime.interactionView.canConfirm)}
                evidence={formatEvidence(runtime.gameplay)}
                inputLock={runtime.navi.inputLock}
                inventory={formatInventory(runtime.gameplay)}
                lastAction={runtime.lastAction}
                lastOutcome={runtime.lastOutcome}
                mapId={runtime.navi.activeMapId ?? "none"}
                pointerLockStatus={runtime.firstPersonBridge.pointerLockStatus}
                route={String(runtime.storyRuntime.state.variables.route ?? "none")}
                substate={runtime.navi.substate}
              />
              <VerticalSliceRuntimeControls
                advanceDisabled={!runtime.storyRuntime.active}
                onAdvanceStory={runtime.advanceStory}
                onMoveToPreset={runtime.moveToPreset}
                onRequestInteract={runtime.firstPersonBridge.requestInteract}
                onReset={runtime.resetSlice}
                pointerLockTriggerProps={runtime.firstPersonBridge.pointerLockTriggerProps}
              />
            </div>
          ) : null}
          {activeDebugTab === "inspector" ? (
            <div
              aria-labelledby="vertical-slice-inspector-tab"
              className="vertical-slice-debug-panel"
              data-testid="vertical-slice-debug-panel-inspector"
              id="vertical-slice-inspector-panel"
              role="tabpanel"
            >
              <InspectorLite
                mode="navi"
                {...(runtime.navi.activeMapId ? { detail: runtime.navi.activeMapId } : {})}
                inputLock={runtime.navi.inputLock}
                naviSubstate={runtime.navi.substate}
                scriptPointer={runtime.storyRuntime.state.instructionPointer}
                variables={runtime.storyRuntime.state.variables}
                inventoryItems={runtime.gameplay.inventory.items}
                evidenceIds={runtime.gameplay.evidence.ownedEvidenceIds}
                presentationCommands={runtime.storyRuntime.state.presentationCommands}
              />
            </div>
          ) : null}
        </div>
      </aside>
    </main>
  );
}

function DebugTabButton({
  active,
  controls,
  id,
  label,
  onSelect,
  testId
}: {
  active: boolean;
  controls: string;
  id: string;
  label: string;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <button
      aria-controls={controls}
      aria-selected={active}
      className="vertical-slice-debug-tab"
      data-testid={testId}
      id={id}
      onClick={onSelect}
      role="tab"
      type="button"
    >
      {label}
    </button>
  );
}

function VerticalSliceRuntimeControls({
  advanceDisabled,
  onAdvanceStory,
  onMoveToPreset,
  onRequestInteract,
  onReset,
  pointerLockTriggerProps
}: {
  advanceDisabled: boolean;
  onAdvanceStory: () => void;
  onMoveToPreset: (id: PosePresetId) => void;
  onRequestInteract: () => void;
  onReset: () => void;
  pointerLockTriggerProps: ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <section aria-label="Runtime debug controls" className="vertical-slice-runtime-controls" data-testid="harness-commands">
      <header>
        <span>Runtime Controls</span>
        <strong>debug</strong>
      </header>
      <div className="vertical-slice-runtime-controls-grid">
        {verticalSlicePosePresets.map((preset) => (
          <button
            key={preset.id}
            data-testid={`vertical-slice-move-${preset.id}`}
            type="button"
            onClick={() => onMoveToPreset(preset.id)}
          >
            移至：{preset.label}
          </button>
        ))}
        <button {...pointerLockTriggerProps} data-testid="vertical-slice-pointer-lock" type="button">
          鼠标视角
        </button>
        <button data-testid="vertical-slice-confirm" type="button" onClick={onRequestInteract}>
          确认交互
        </button>
        <button data-testid="vertical-slice-advance" type="button" onClick={onAdvanceStory} disabled={advanceDisabled}>
          推进剧情
        </button>
        <button data-testid="vertical-slice-reset" type="button" onClick={onReset}>
          重置
        </button>
      </div>
    </section>
  );
}

function formatInventory(gameplay: GameplayState): string {
  const entries = Object.entries(gameplay.inventory.items);
  return entries.length > 0 ? entries.map(([id, quantity]) => `${id}:${quantity}`).join(", ") : "empty";
}

function formatEvidence(gameplay: GameplayState): string {
  return gameplay.evidence.ownedEvidenceIds.length > 0 ? gameplay.evidence.ownedEvidenceIds.join(", ") : "empty";
}

function displayStorySpeaker(speaker: string): string {
  const labels: Record<string, string> = {
    Felix: "菲利克斯",
    Mira: "米拉",
    Ren: "莲",
    Narrator: "旁白"
  };
  return labels[speaker] ?? speaker;
}

function VerticalSliceReadout({
  activeInteractableId,
  blockedReason,
  canConfirm,
  evidence,
  inputLock,
  inventory,
  lastAction,
  lastOutcome,
  mapId,
  pointerLockStatus,
  route,
  substate
}: {
  activeInteractableId: string;
  blockedReason: string;
  canConfirm: string;
  evidence: string;
  inputLock: string;
  inventory: string;
  lastAction: string;
  lastOutcome: string;
  mapId: string;
  pointerLockStatus: string;
  route: string;
  substate: string;
}) {
  return (
    <section aria-label="Vertical slice readout" className="vertical-slice-readout">
      <header>
        <span>Runtime Readout</span>
        <strong>{substate}</strong>
      </header>
      <div className="vertical-slice-readout-grid">
        <Readout label="Map" testId="vertical-slice-map" value={mapId} />
        <Readout label="Substate" testId="vertical-slice-substate" value={substate} />
        <Readout label="Input" testId="vertical-slice-input-lock" value={inputLock} />
        <Readout label="Pointer Lock" testId="vertical-slice-pointer-lock-status" value={pointerLockStatus} />
        <Readout label="Active" testId="vertical-slice-active-interactable" value={activeInteractableId} />
        <Readout label="Can" testId="vertical-slice-can-confirm" value={canConfirm} />
        <Readout label="Block" testId="vertical-slice-blocked-reason" value={blockedReason} />
        <Readout label="Inventory" testId="vertical-slice-inventory" value={inventory} />
        <Readout label="Evidence" testId="vertical-slice-evidence" value={evidence} />
        <Readout label="Route" testId="vertical-slice-route" value={route} />
        <Readout label="Outcome" testId="vertical-slice-last-outcome" value={lastOutcome} wide />
        <Readout label="Action" testId="vertical-slice-last-action" value={lastAction} wide />
      </div>
    </section>
  );
}

function Readout({ label, testId, value, wide = false }: { label: string; testId: string; value: string; wide?: boolean }) {
  return (
    <p className={wide ? "vertical-slice-readout-row vertical-slice-readout-row-wide" : "vertical-slice-readout-row"}>
      <span>{label}</span>
      <strong data-testid={testId}>{value}</strong>
    </p>
  );
}
