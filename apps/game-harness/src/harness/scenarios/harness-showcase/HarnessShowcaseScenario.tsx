import { useCallback, useMemo, useRef, useState, type ButtonHTMLAttributes } from "react";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import {
  GameInteractionShell,
  VnPixiPresenterHost,
  settingsToDialogDisplaySettings,
  settingsToDialogueBleepRuntimeSettings,
  settingsToStoryPlayTimingPolicy,
  settingsToVoiceRuntimeSettings,
  useGameSettingsAdapter,
  type PixiStageCaptureHandle
} from "@v-ronpa/app-vn-shell";
import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { GameplayState } from "@v-ronpa/gameplay";
import { SAVE_SLOT_THUMBNAIL_CAPTURE_OPTIONS, type AudioHandle, type AudioHandleFinishReason, type AudioPort } from "@v-ronpa/media-save";
import type { PresentationTaskObservation } from "@v-ronpa/app-vn-runtime";
import { ExplorationStage3D, TrialRoundTableStage } from "@v-ronpa/r3f-adapter";
import { InspectorLite, RichTextFontStyles } from "@v-ronpa/ui-kit";
import { useGameFlowActor } from "../../../interaction/useGameFlowActor";
import { useOverlayPageAdapters } from "../../../interaction/useOverlayPageAdapters";
import {
  useHarnessShowcaseRuntimeAdapter,
  type PosePresetId,
  type HarnessShowcaseRuntimeDiagnostic,
  harnessShowcasePosePresets
} from "../../../interaction/useHarnessShowcaseRuntimeAdapter";
import { useHarnessShowcaseSaveAdapter } from "../../../interaction/useHarnessShowcaseSaveAdapter";
import { harnessContentManifest } from "../../contentManifest";

type DebugTabId = "runtime" | "inspector";
type VoiceSmokeAudioMode = "fast" | "fail";
const FAST_VOICE_SMOKE_DURATION_MS = 1500;

export function HarnessShowcaseScenario() {
  const flowActor = useGameFlowActor();
  const settings = useGameSettingsAdapter();
  const assetRegistry = useMemo(() => createAssetRegistry(harnessContentManifest), []);
  const storyPlayTiming = useMemo(() => settingsToStoryPlayTimingPolicy(settings.settings), [settings.settings]);
  const dialogDisplay = useMemo(() => settingsToDialogDisplaySettings(settings.settings), [settings.settings]);
  const dialogRevealSettings = useMemo(() => ({ textSpeed: dialogDisplay.textSpeed }), [dialogDisplay.textSpeed]);
  const dialogueBleepSettings = useMemo(() => settingsToDialogueBleepRuntimeSettings(settings.settings), [settings.settings]);
  const voiceSettings = useMemo(() => settingsToVoiceRuntimeSettings(settings.settings), [settings.settings]);
  const pixiCaptureHandleRef = useRef<PixiStageCaptureHandle | undefined>(undefined);
  const smokeAudioPort = useMemo(() => {
    const mode = selectVoiceSmokeAudioMode();
    return mode ? createVoiceSmokeAudioPort(mode) : undefined;
  }, []);
  const enterTrialMode = useCallback(() => flowActor.send({ type: "ENTER_TRIAL" }), [flowActor.send]);
  const enterNaviMode = useCallback(() => flowActor.send({ type: "ENTER_NAVI" }), [flowActor.send]);
  const runtime = useHarnessShowcaseRuntimeAdapter(flowActor.mode, {
    ...(smokeAudioPort ? { audioPort: smokeAudioPort } : {}),
    assetResolver: assetRegistry,
    ...(harnessContentManifest.audio?.dialogueBleep ? { dialogueBleepConfig: harnessContentManifest.audio.dialogueBleep } : {}),
    dialogueBleepSettings,
    dialogRevealSettings,
    storyPlayTiming,
    voiceSettings,
    onEnterTrial: enterTrialMode,
    onEnterNavi: enterNaviMode
  });
  const flow = flowActor.withInteractionFacts(runtime.interactionFacts, runtime.hostInteractionFacts);
  const save = useHarnessShowcaseSaveAdapter(runtime, {
    canSave: () => flow.capabilities.canSave,
    capturePreview: () => pixiCaptureHandleRef.current?.captureThumbnail(SAVE_SLOT_THUMBNAIL_CAPTURE_OPTIONS)
  });
  const overlayPages = useOverlayPageAdapters({ flow, runtime, save, settings });
  const [activeDebugTab, setActiveDebugTab] = useState<DebugTabId>("runtime");

  return (
    <main className="app-shell app-shell-harness">
      <RichTextFontStyles
        assetResolver={assetRegistry}
        fonts={harnessContentManifest.fonts}
        onDiagnostic={runtime.observeAssetDiagnostic}
      />
      <section className="playfield" data-testid="playfield">
        <GameInteractionShell
          dialogDisplay={dialogDisplay}
          flow={flow}
          formatStorySpeaker={displayStorySpeaker}
          host={{ naviSubstate: runtime.navi.substate }}
          overlayPages={overlayPages}
          runtime={runtime.shell}
        >
          <div className="scene-stack" data-testid="harness-showcase-shell">
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
            <VnPixiPresenterHost
              active={flow.mode !== "trial" && runtime.storyRuntime.active}
              assetResolver={assetRegistry}
              characterOutlineEnabled={true}
              diagnostics={runtime.diagnostics}
              presentation={runtime.presentation}
              onCaptureHandleChanged={(handle) => {
                pixiCaptureHandleRef.current = handle;
              }}
            />
          </div>
        </GameInteractionShell>
        <div className="hud harness-hud harness-showcase-hud">
          <div className="objective-chip">
            <span data-testid="harness-scenario-id">harness-showcase</span>
            <strong data-testid="harness-scenario-title">Navi To VN Harness Showcase</strong>
            <small data-testid="harness-status">{flow.mode === "title" ? "标题界面" : flow.mode === "trial" ? "Trial 模式" : runtime.storyRuntime.active ? "视觉小说覆盖层" : "Navi 探索"}</small>
          </div>
        </div>
      </section>
      <aside className="harness-showcase-sidebar" aria-label="Harness showcase debug sidebar" data-testid="harness-showcase-debug-sidebar">
        <div aria-label="Harness showcase debug panels" className="harness-showcase-debug-tabs" role="tablist">
          <DebugTabButton
            active={activeDebugTab === "runtime"}
            controls="harness-showcase-runtime-panel"
            id="harness-showcase-runtime-tab"
            label="Runtime"
            onSelect={() => setActiveDebugTab("runtime")}
            testId="harness-showcase-debug-tab-runtime"
          />
          <DebugTabButton
            active={activeDebugTab === "inspector"}
            controls="harness-showcase-inspector-panel"
            id="harness-showcase-inspector-tab"
            label="Inspector"
            onSelect={() => setActiveDebugTab("inspector")}
            testId="harness-showcase-debug-tab-inspector"
          />
        </div>
        <div className="harness-showcase-debug-panels">
          {activeDebugTab === "runtime" ? (
            <div
              aria-labelledby="harness-showcase-runtime-tab"
              className="harness-showcase-debug-panel harness-showcase-runtime-panel"
              data-testid="harness-showcase-debug-panel-runtime"
              id="harness-showcase-runtime-panel"
              role="tabpanel"
            >
              <HarnessShowcaseReadout
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
              <HarnessShowcaseRuntimeControls
                advanceDisabled={!runtime.storyRuntime.active}
                onExitTrial={runtime.exitTrial}
                onAdvanceStory={runtime.advanceStory}
                onMoveToPreset={runtime.moveToPreset}
                onRequestInteract={runtime.confirmFocusedInteraction}
                onReset={runtime.resetShowcase}
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
              aria-labelledby="harness-showcase-inspector-tab"
              className="harness-showcase-debug-panel"
              data-testid="harness-showcase-debug-panel-inspector"
              id="harness-showcase-inspector-panel"
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
      className="harness-showcase-debug-tab"
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

function HarnessShowcaseRuntimeControls({
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
      className="harness-showcase-runtime-controls"
      data-testid="harness-showcase-runtime-controls"
    >
      <header>
        <span>Runtime Controls</span>
        <strong>debug</strong>
      </header>
      <div className="harness-showcase-runtime-controls-grid">
        {harnessShowcasePosePresets.map((preset) => (
          <button
            key={preset.id}
            data-testid={`harness-showcase-move-${preset.id}`}
            type="button"
            onClick={() => onMoveToPreset(preset.id)}
          >
            移至：{preset.label}
          </button>
        ))}
        <button {...pointerLockTriggerProps} data-testid="harness-showcase-pointer-lock" type="button">
          鼠标视角
        </button>
        <button data-testid="harness-showcase-confirm" type="button" onClick={onRequestInteract}>
          确认交互
        </button>
        <button data-testid="harness-showcase-advance" type="button" onClick={onAdvanceStory} disabled={advanceDisabled}>
          推进剧情
        </button>
        <button data-testid="harness-showcase-trial-correct" type="button" onClick={onResolveTrialCorrect} disabled={!trialActive}>
          审判：正确证据
        </button>
        <button data-testid="harness-showcase-trial-miss" type="button" onClick={onResolveTrialMiss} disabled={!trialActive}>
          审判：错误证据
        </button>
        <button data-testid="harness-showcase-trial-timeout" type="button" onClick={onResolveTrialTimeout} disabled={!trialActive}>
          审判：超时
        </button>
        <button data-testid="harness-showcase-trial-exit" type="button" onClick={onExitTrial} disabled={!trialActive}>
          退出审判
        </button>
        <button data-testid="harness-showcase-reset" type="button" onClick={onReset}>
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

function formatPixiPresentationTasks(tasks: PresentationTaskObservation[]): string {
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
    playDialogueBleep(id) {
      return register(createSmokeAudioHandle(id));
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

function HarnessShowcaseReadout({
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
    <section aria-label="Harness showcase readout" className="harness-showcase-readout">
      <header>
        <span>Runtime Readout</span>
        <strong>{substate}</strong>
      </header>
      <div className="harness-showcase-readout-grid">
        <Readout label="Mode" testId="harness-showcase-mode" value={mode} />
        <Readout label="Map" testId="harness-showcase-map" value={mapId} />
        <Readout label="Substate" testId="harness-showcase-substate" value={substate} />
        <Readout label="Input" testId="harness-showcase-input-lock" value={inputLock} />
        <Readout label="Pointer Lock" testId="harness-showcase-pointer-lock-status" value={pointerLockStatus} />
        <Readout label="Active" testId="harness-showcase-active-interactable" value={activeInteractableId} />
        <Readout label="Can" testId="harness-showcase-can-confirm" value={canConfirm} />
        <Readout label="Block" testId="harness-showcase-blocked-reason" value={blockedReason} />
        <Readout label="Diag" testId="harness-showcase-diagnostics-count" value={diagnosticCount} />
        <Readout label="Asset Diag" testId="harness-showcase-asset-diagnostics-count" value={assetDiagnosticCount} />
        <Readout label="Inventory" testId="harness-showcase-inventory" value={inventory} />
        <Readout label="Evidence" testId="harness-showcase-evidence" value={evidence} />
        <Readout label="Route" testId="harness-showcase-route" value={route} />
        <Readout label="Pixi BG" testId="harness-showcase-pixi-background" value={pixiBackground} />
        <Readout label="Pixi Rev" testId="harness-showcase-pixi-revision" value={pixiRevision} />
        <Readout label="Pixi Chars" testId="harness-showcase-pixi-characters" value={pixiCharacters} wide />
        <Readout label="Pixi Tasks" testId="harness-showcase-pixi-tasks" value={pixiTasks} wide />
        <Readout label="Trial Segment" testId="harness-showcase-trial-segment" value={trialSegment} wide />
        <Readout label="Trial View" testId="harness-showcase-trial-presentation" value={trialPresentation} />
        <Readout label="Trial Input" testId="harness-showcase-trial-input-lock" value={trialInputLock} />
        <Readout label="Trial Keywords" testId="harness-showcase-trial-keywords" value={trialKeywords} wide />
        <Readout label="Trial Outcome" testId="harness-showcase-trial-outcome" value={trialOutcome} wide />
        <Readout label="Latest Diag" testId="harness-showcase-latest-diagnostic" value={latestDiagnostic} wide />
        <Readout label="Outcome" testId="harness-showcase-last-outcome" value={lastOutcome} wide />
        <Readout label="Action" testId="harness-showcase-last-action" value={lastAction} wide />
      </div>
    </section>
  );
}

function formatLatestDiagnostic(diagnostics: HarnessShowcaseRuntimeDiagnostic[]): string {
  const latest = diagnostics.at(-1);
  if (!latest) return "none";
  const location = latest.loc ? ` ${latest.loc}` : "";
  const command = latest.commandId ? ` @${latest.commandId}` : "";
  return `${latest.severity}:${latest.source}:${latest.code}${command}${location} - ${latest.message}`;
}

function countAssetDiagnostics(diagnostics: HarnessShowcaseRuntimeDiagnostic[]): number {
  return diagnostics.filter((diagnostic) => diagnostic.source === "asset").length;
}

function Readout({ label, testId, value, wide = false }: { label: string; testId: string; value: string; wide?: boolean }) {
  return (
    <p className={wide ? "harness-showcase-readout-row harness-showcase-readout-row-wide" : "harness-showcase-readout-row"}>
      <span>{label}</span>
      <strong data-testid={testId}>{value}</strong>
    </p>
  );
}
