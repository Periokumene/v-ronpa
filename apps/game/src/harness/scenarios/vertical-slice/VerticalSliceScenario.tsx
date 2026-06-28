import { useCallback, useMemo, useState, type ButtonHTMLAttributes } from "react";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { GameplayState } from "@v-ronpa/gameplay";
import type { AudioHandle, AudioHandleFinishReason, AudioPort } from "@v-ronpa/media-save";
import type { PixiPresentationTaskSnapshot } from "@v-ronpa/pixi-presenter";
import { ExplorationStage3D, TrialRoundTableStage } from "@v-ronpa/r3f-adapter";
import { InspectorLite } from "@v-ronpa/ui-kit";
import { GameInteractionShell } from "../../../interaction/GameInteractionShell";
import { useGameFlowActor } from "../../../interaction/useGameFlowActor";
import {
  settingsToDialogDisplaySettings,
  settingsToStoryPlayTimingPolicy,
  settingsToVoiceRuntimeSettings,
  useGameSettingsAdapter
} from "../../../interaction/useGameSettingsAdapter";
import { useOverlayPageAdapters } from "../../../interaction/useOverlayPageAdapters";
import {
  useVerticalSliceRuntimeAdapter,
  type PosePresetId,
  type VerticalSliceRuntimeDiagnostic,
  verticalSlicePosePresets
} from "../../../interaction/useVerticalSliceRuntimeAdapter";
import { useVerticalSliceSaveAdapter } from "../../../interaction/useVerticalSliceSaveAdapter";
import { VnRuntimeDispatcher } from "../../../VnRuntimeDispatcher";
import { harnessContentManifest } from "../../contentManifest";

type DebugTabId = "runtime" | "inspector";
type VoiceSmokeAudioMode = "fast" | "fail";
const FAST_VOICE_SMOKE_DURATION_MS = 1500;

export function VerticalSliceScenario() {
  const flow = useGameFlowActor();
  const settings = useGameSettingsAdapter();
  const assetRegistry = useMemo(() => createAssetRegistry(harnessContentManifest), []);
  const storyPlayTiming = useMemo(() => settingsToStoryPlayTimingPolicy(settings.settings), [settings.settings]);
  const dialogDisplay = useMemo(() => settingsToDialogDisplaySettings(settings.settings), [settings.settings]);
  const dialogRevealSettings = useMemo(() => ({ textSpeed: dialogDisplay.textSpeed }), [dialogDisplay.textSpeed]);
  const voiceSettings = useMemo(() => settingsToVoiceRuntimeSettings(settings.settings), [settings.settings]);
  const smokeAudioPort = useMemo(() => {
    const mode = selectVoiceSmokeAudioMode();
    return mode ? createVoiceSmokeAudioPort(mode) : undefined;
  }, []);
  const enterTrialMode = useCallback(() => flow.send({ type: "ENTER_TRIAL" }), [flow.send]);
  const enterNaviMode = useCallback(() => flow.send({ type: "ENTER_NAVI" }), [flow.send]);
  const runtime = useVerticalSliceRuntimeAdapter(flow.mode, {
    ...(smokeAudioPort ? { audioPort: smokeAudioPort } : {}),
    assetResolver: assetRegistry,
    dialogRevealSettings,
    storyPlayTiming,
    voiceSettings,
    onEnterTrial: enterTrialMode,
    onEnterNavi: enterNaviMode
  });
  const save = useVerticalSliceSaveAdapter(runtime);
  const overlayPages = useOverlayPageAdapters({ flow, runtime, save, settings });
  const [activeDebugTab, setActiveDebugTab] = useState<DebugTabId>("runtime");

  return (
    <main className="app-shell app-shell-harness">
      <section className="playfield" data-testid="playfield">
        <GameInteractionShell dialogDisplay={dialogDisplay} flow={flow} formatStorySpeaker={displayStorySpeaker} overlayPages={overlayPages} runtime={runtime}>
          <div className="scene-stack" data-testid="vertical-slice-shell">
            {flow.mode === "trial" && runtime.trialRuntime.state ? (
              <TrialRoundTableStage
                focusedSpeakerId={runtime.trialRuntime.state.selectedEvidenceId ? "character:ren" : "character:felix"}
                inputLock={runtime.trialRuntime.state.inputLock}
                presentationProfile={runtime.trialRuntime.state.presentation}
                speakers={["character:felix", "character:mira", "character:ren"]}
              />
            ) : (
              <ExplorationStage3D {...runtime.firstPersonBridge.explorationStageProps} />
            )}
            <VnRuntimeDispatcher
              active={flow.mode !== "trial" && runtime.storyRuntime.active}
              assetResolver={assetRegistry}
              pixiAnimate={runtime.pixiStageRuntime.animate}
              pixiHintSequence={runtime.pixiStageRuntime.hintSequence}
              pixiHints={runtime.pixiStageRuntime.hints}
              pixiPresentationTasks={runtime.pixiStageRuntime.presentationTasks}
              pixiStage={runtime.pixiStageRuntime.snapshot}
              storySession={runtime.storySession}
              onPixiDiagnostic={runtime.observeAssetDiagnostic}
              onPixiTasksChanged={runtime.updatePixiPresentationTasks}
            />
          </div>
        </GameInteractionShell>
        <div className="hud harness-hud vertical-slice-hud">
          <div className="objective-chip">
            <span data-testid="harness-scenario-id">vertical-slice</span>
            <strong data-testid="harness-scenario-title">Navi To VN Vertical Slice</strong>
            <small data-testid="harness-status">{flow.mode === "title" ? "标题界面" : flow.mode === "trial" ? "Trial 模式" : runtime.storyRuntime.active ? "视觉小说覆盖层" : "Navi 探索"}</small>
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
                assetDiagnosticCount={String(countAssetDiagnostics(runtime.runtimeDiagnostics))}
                blockedReason={runtime.interactionView.blockedReason ?? "none"}
                canConfirm={String(runtime.interactionView.canConfirm)}
                diagnosticCount={String(runtime.runtimeDiagnostics.length)}
                evidence={formatEvidence(runtime.gameplay)}
                inputLock={runtime.navi.inputLock}
                inventory={formatInventory(runtime.gameplay)}
                lastAction={runtime.lastAction}
                latestDiagnostic={formatLatestDiagnostic(runtime.runtimeDiagnostics)}
                lastOutcome={runtime.lastOutcome}
                mapId={runtime.navi.activeMapId ?? "none"}
                mode={flow.mode}
                pixiBackground={runtime.pixiStageRuntime.snapshot.backgroundsById.MainBackground?.appearance ?? "none"}
                pixiCharacters={formatPixiStageCharacters(runtime.pixiStageRuntime.snapshot)}
                pixiRevision={String(runtime.pixiStageRuntime.snapshot.revision)}
                pixiTasks={formatPixiPresentationTasks(runtime.pixiStageRuntime.presentationTasks)}
                pointerLockStatus={runtime.firstPersonBridge.pointerLockStatus}
                route={String(runtime.storyRuntime.state.variables.route ?? "none")}
                substate={runtime.navi.substate}
                trialInputLock={runtime.trialRuntime.state?.inputLock ?? "none"}
                trialKeywords={formatTrialKeywordStates(runtime.trialRuntime.state?.keywordStates)}
                trialOutcome={runtime.trialRuntime.lastOutcome}
                trialPresentation={runtime.trialRuntime.state?.presentation ?? "none"}
                trialSegment={runtime.trialRuntime.state?.currentSegmentId ?? "none"}
              />
              <VerticalSliceRuntimeControls
                advanceDisabled={!runtime.storyRuntime.active}
                onExitTrial={runtime.exitTrial}
                onAdvanceStory={runtime.advanceStory}
                onMoveToPreset={runtime.moveToPreset}
                onRequestInteract={runtime.confirmFocusedInteraction}
                onReset={runtime.resetSlice}
                onResolveTrialCorrect={() => runtime.resolveTrialKeywordWithEvidence()}
                onResolveTrialMiss={() => runtime.resolveTrialKeywordWithEvidence("evidence:wrong-card")}
                onResolveTrialTimeout={runtime.resolveTrialTimeout}
                pointerLockTriggerProps={runtime.firstPersonBridge.pointerLockTriggerProps}
                trialActive={runtime.trialRuntime.active}
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
                mode={flow.mode}
                {...(flow.mode === "trial" && runtime.trialRuntime.state
                  ? { detail: runtime.trialRuntime.state.currentSegmentId }
                  : runtime.navi.activeMapId
                    ? { detail: runtime.navi.activeMapId }
                    : {})}
                inputLock={flow.mode === "trial" ? runtime.trialRuntime.state?.inputLock ?? "none" : runtime.navi.inputLock}
                naviSubstate={runtime.navi.substate}
                {...(runtime.trialRuntime.state?.presentation ? { trialPresentation: runtime.trialRuntime.state.presentation } : {})}
                scriptPointer={runtime.storyRuntime.state.instructionPointer}
                variables={runtime.storyRuntime.state.variables}
                inventoryItems={runtime.gameplay.inventory.items}
                evidenceIds={runtime.gameplay.evidence.ownedEvidenceIds}
                {...(runtime.trialRuntime.state?.currentSegmentId ? { trialSegmentId: runtime.trialRuntime.state.currentSegmentId } : {})}
                runtimeCommandCount={runtime.lastRuntimeCommandCount}
                diagnosticCount={runtime.runtimeDiagnostics.length}
                latestDiagnostic={formatLatestDiagnostic(runtime.runtimeDiagnostics)}
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
  onExitTrial,
  onMoveToPreset,
  onRequestInteract,
  onReset,
  onResolveTrialCorrect,
  onResolveTrialMiss,
  onResolveTrialTimeout,
  pointerLockTriggerProps,
  trialActive
}: {
  advanceDisabled: boolean;
  onAdvanceStory: () => void;
  onExitTrial: () => void;
  onMoveToPreset: (id: PosePresetId) => void;
  onRequestInteract: () => void;
  onReset: () => void;
  onResolveTrialCorrect: () => void;
  onResolveTrialMiss: () => void;
  onResolveTrialTimeout: () => void;
  pointerLockTriggerProps: ButtonHTMLAttributes<HTMLButtonElement>;
  trialActive: boolean;
}) {
  return (
    <section
      aria-label="Runtime debug controls"
      className="vertical-slice-runtime-controls"
      data-testid="vertical-slice-runtime-controls"
    >
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
        <button data-testid="vertical-slice-trial-correct" type="button" onClick={onResolveTrialCorrect} disabled={!trialActive}>
          审判：正确证据
        </button>
        <button data-testid="vertical-slice-trial-miss" type="button" onClick={onResolveTrialMiss} disabled={!trialActive}>
          审判：错误证据
        </button>
        <button data-testid="vertical-slice-trial-timeout" type="button" onClick={onResolveTrialTimeout} disabled={!trialActive}>
          审判：超时
        </button>
        <button data-testid="vertical-slice-trial-exit" type="button" onClick={onExitTrial} disabled={!trialActive}>
          退出审判
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

function formatPixiStageCharacters(stage: Pick<PixiStageSnapshot, "actorOrder" | "charactersById">): string {
  const entries = stage.actorOrder.flatMap((id) => {
    const actor = stage.charactersById[id];
    if (!actor) return [];
    const pos = actor.pos ? `@${actor.pos[0].toFixed(2)},${actor.pos[1].toFixed(2)}` : "";
    return [`${actor.id}/${actor.appearanceExpression || "default"}${pos}`];
  });
  return entries.length > 0 ? entries.join(", ") : "empty";
}

function formatPixiPresentationTasks(tasks: PixiPresentationTaskSnapshot[]): string {
  if (tasks.length === 0) return "empty";
  return tasks
    .map((task) => `${task.kind}:${task.target}:${task.status}:${task.durationMs}ms:r${task.revision}`)
    .join(", ");
}

function formatTrialKeywordStates(keywordStates: Record<string, "pending" | "broken" | "missed"> | undefined): string {
  const entries = Object.entries(keywordStates ?? {});
  return entries.length > 0 ? entries.map(([id, state]) => `${id}:${state}`).join(", ") : "empty";
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

function selectVoiceSmokeAudioMode(): VoiceSmokeAudioMode | undefined {
  const mode = new URLSearchParams(window.location.search).get("voiceSmoke");
  return mode === "fast" || mode === "fail" ? mode : undefined;
}

function createVoiceSmokeAudioPort(mode: VoiceSmokeAudioMode): AudioPort {
  const activeHandles = new Set<SmokeAudioHandle>();

  function register(handle: SmokeAudioHandle): AudioHandle {
    activeHandles.add(handle);
    handle.finished.finally(() => activeHandles.delete(handle));
    return handle;
  }

  return {
    playBgm(id) {
      return register(createSmokeAudioHandle(id));
    },
    playSfx(id, _uri, options) {
      const handle = createSmokeAudioHandle(id);
      if (options?.loop !== true) window.setTimeout(() => handle.finish("ended"), 20);
      return register(handle);
    },
    playVoice(id) {
      const handle = createSmokeAudioHandle(id);
      window.setTimeout(
        () => handle.finish(mode === "fail" ? "failed" : "ended"),
        mode === "fail" ? 20 : FAST_VOICE_SMOKE_DURATION_MS
      );
      return register(handle);
    },
    stopAll() {
      for (const handle of [...activeHandles]) handle.finish("stopped");
    }
  };
}

interface SmokeAudioHandle extends AudioHandle {
  finish(reason: AudioHandleFinishReason): void;
}

function createSmokeAudioHandle(id: string): SmokeAudioHandle {
  let released = false;
  let resolveFinished: (result: { reason: AudioHandleFinishReason }) => void = () => {};
  const finished = new Promise<{ reason: AudioHandleFinishReason }>((resolve) => {
    resolveFinished = resolve;
  });

  function finish(reason: AudioHandleFinishReason) {
    if (released) return;
    released = true;
    resolveFinished({ reason });
  }

  return {
    id,
    finished,
    finish,
    stop() {
      finish("stopped");
    },
    fade() {},
    fadeOutAndStop() {
      finish("stopped");
    }
  };
}

function VerticalSliceReadout({
  activeInteractableId,
  assetDiagnosticCount,
  blockedReason,
  canConfirm,
  diagnosticCount,
  evidence,
  inputLock,
  inventory,
  lastAction,
  latestDiagnostic,
  lastOutcome,
  mapId,
  mode,
  pixiBackground,
  pixiCharacters,
  pixiRevision,
  pixiTasks,
  pointerLockStatus,
  route,
  substate,
  trialInputLock,
  trialKeywords,
  trialOutcome,
  trialPresentation,
  trialSegment
}: {
  activeInteractableId: string;
  assetDiagnosticCount: string;
  blockedReason: string;
  canConfirm: string;
  diagnosticCount: string;
  evidence: string;
  inputLock: string;
  inventory: string;
  lastAction: string;
  latestDiagnostic: string;
  lastOutcome: string;
  mapId: string;
  mode: string;
  pixiBackground: string;
  pixiCharacters: string;
  pixiRevision: string;
  pixiTasks: string;
  pointerLockStatus: string;
  route: string;
  substate: string;
  trialInputLock: string;
  trialKeywords: string;
  trialOutcome: string;
  trialPresentation: string;
  trialSegment: string;
}) {
  return (
    <section aria-label="Vertical slice readout" className="vertical-slice-readout">
      <header>
        <span>Runtime Readout</span>
        <strong>{substate}</strong>
      </header>
      <div className="vertical-slice-readout-grid">
        <Readout label="Mode" testId="vertical-slice-mode" value={mode} />
        <Readout label="Map" testId="vertical-slice-map" value={mapId} />
        <Readout label="Substate" testId="vertical-slice-substate" value={substate} />
        <Readout label="Input" testId="vertical-slice-input-lock" value={inputLock} />
        <Readout label="Pointer Lock" testId="vertical-slice-pointer-lock-status" value={pointerLockStatus} />
        <Readout label="Active" testId="vertical-slice-active-interactable" value={activeInteractableId} />
        <Readout label="Can" testId="vertical-slice-can-confirm" value={canConfirm} />
        <Readout label="Block" testId="vertical-slice-blocked-reason" value={blockedReason} />
        <Readout label="Diag" testId="vertical-slice-diagnostics-count" value={diagnosticCount} />
        <Readout label="Asset Diag" testId="vertical-slice-asset-diagnostics-count" value={assetDiagnosticCount} />
        <Readout label="Inventory" testId="vertical-slice-inventory" value={inventory} />
        <Readout label="Evidence" testId="vertical-slice-evidence" value={evidence} />
        <Readout label="Route" testId="vertical-slice-route" value={route} />
        <Readout label="Pixi BG" testId="vertical-slice-pixi-background" value={pixiBackground} />
        <Readout label="Pixi Rev" testId="vertical-slice-pixi-revision" value={pixiRevision} />
        <Readout label="Pixi Chars" testId="vertical-slice-pixi-characters" value={pixiCharacters} wide />
        <Readout label="Pixi Tasks" testId="vertical-slice-pixi-tasks" value={pixiTasks} wide />
        <Readout label="Trial Segment" testId="vertical-slice-trial-segment" value={trialSegment} wide />
        <Readout label="Trial View" testId="vertical-slice-trial-presentation" value={trialPresentation} />
        <Readout label="Trial Input" testId="vertical-slice-trial-input-lock" value={trialInputLock} />
        <Readout label="Trial Keywords" testId="vertical-slice-trial-keywords" value={trialKeywords} wide />
        <Readout label="Trial Outcome" testId="vertical-slice-trial-outcome" value={trialOutcome} wide />
        <Readout label="Latest Diag" testId="vertical-slice-latest-diagnostic" value={latestDiagnostic} wide />
        <Readout label="Outcome" testId="vertical-slice-last-outcome" value={lastOutcome} wide />
        <Readout label="Action" testId="vertical-slice-last-action" value={lastAction} wide />
      </div>
    </section>
  );
}

function formatLatestDiagnostic(diagnostics: VerticalSliceRuntimeDiagnostic[]): string {
  const latest = diagnostics.at(-1);
  if (!latest) return "none";
  const location = latest.loc ? ` ${latest.loc}` : "";
  const command = latest.commandId ? ` @${latest.commandId}` : "";
  return `${latest.severity}:${latest.source}:${latest.code}${command}${location} - ${latest.message}`;
}

function countAssetDiagnostics(diagnostics: VerticalSliceRuntimeDiagnostic[]): number {
  return diagnostics.filter((diagnostic) => diagnostic.source === "asset").length;
}

function Readout({ label, testId, value, wide = false }: { label: string; testId: string; value: string; wide?: boolean }) {
  return (
    <p className={wide ? "vertical-slice-readout-row vertical-slice-readout-row-wide" : "vertical-slice-readout-row"}>
      <span>{label}</span>
      <strong data-testid={testId}>{value}</strong>
    </p>
  );
}
