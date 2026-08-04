import { useCallback, useMemo, useState, type ButtonHTMLAttributes } from "react";
import { createAssetRegistry } from "@v-ronpa/asset-registry";
import {
  GameInteractionShell,
  VnPixiPresenterHost,
  settingsToStoryTextDisplaySettings,
  settingsToDialogueBleepRuntimeSettings,
  settingsToStoryPlayTimingPolicy,
  settingsToVoiceRuntimeSettings,
  useGameSettingsAdapter,
  usePixiStageReadiness
} from "@v-ronpa/app-vn-shell";
import { harnessCharacterAssetIdByCharacterId } from "../../generatedAssets";
import type { PixiStageSnapshot } from "@v-ronpa/contracts";
import type { GameplayState } from "@v-ronpa/gameplay";
import { SAVE_SLOT_THUMBNAIL_CAPTURE_OPTIONS } from "@v-ronpa/media-save";
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
import { harnessContentManifest, harnessShowcaseCharacterPreloadPlan } from "../../contentManifest";

type DebugTabId = "runtime" | "inspector";
export function HarnessShowcaseScenario() {
  const flowActor = useGameFlowActor();
  const settings = useGameSettingsAdapter();
  const assetRegistry = useMemo(
    () => createAssetRegistry(harnessContentManifest, { baseUri: import.meta.env.BASE_URL }),
    []
  );
  const storyPlayTiming = useMemo(() => settingsToStoryPlayTimingPolicy(settings.settings), [settings.settings]);
  const storyTextDisplay = useMemo(() => settingsToStoryTextDisplaySettings(settings.settings), [settings.settings]);
  const storyTextRevealSettings = useMemo(() => ({ textSpeed: storyTextDisplay.textSpeed }), [storyTextDisplay.textSpeed]);
  const dialogueBleepSettings = useMemo(() => settingsToDialogueBleepRuntimeSettings(settings.settings), [settings.settings]);
  const voiceSettings = useMemo(() => settingsToVoiceRuntimeSettings(settings.settings), [settings.settings]);
  const pixiStage = usePixiStageReadiness();
  const enterTrialMode = useCallback(() => flowActor.send({ type: "ENTER_TRIAL" }), [flowActor.send]);
  const enterNaviMode = useCallback(() => flowActor.send({ type: "ENTER_NAVI" }), [flowActor.send]);
  const runtime = useHarnessShowcaseRuntimeAdapter(flowActor.mode, {
    assetResolver: assetRegistry,
    ...(harnessContentManifest.audio?.dialogueBleep ? { dialogueBleepConfig: harnessContentManifest.audio.dialogueBleep } : {}),
    dialogueBleepSettings,
    storyTextRevealSettings,
    storyPlayTiming,
    voiceSettings,
    onEnterTrial: enterTrialMode,
    onEnterNavi: enterNaviMode,
    ensureVnPresentationReady: pixiStage.waitUntilReady
  });
  const flow = flowActor.withInteractionFacts(runtime.shell.interactionFacts, runtime.hostInteractionFacts);
  const save = useHarnessShowcaseSaveAdapter(runtime, {
    canSave: () => flow.capabilities.canSave,
    capturePreview: () => pixiStage.handle?.captureThumbnail(SAVE_SLOT_THUMBNAIL_CAPTURE_OPTIONS)
  });
  const overlayPages = useOverlayPageAdapters({
    flow,
    runtime,
    save,
    settings,
    ensureVnPresentationReady: pixiStage.waitUntilReady
  });
  const [activeDebugTab, setActiveDebugTab] = useState<DebugTabId>("runtime");

  return (
    <main className="app-shell app-shell-harness" data-vn-preparation={pixiStage.pending ? "preparing" : "idle"}>
      <RichTextFontStyles
        assetResolver={assetRegistry}
        fonts={harnessContentManifest.fonts}
        onDiagnostic={runtime.diagnostics.observeAssetDiagnostic}
      />
      <section className="playfield" data-testid="playfield">
        <GameInteractionShell
          storyTextDisplay={storyTextDisplay}
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
              active={flow.mode !== "trial" && runtime.shell.storyRuntime.active}
              assetResolver={assetRegistry}
              characterOutlineEnabled={true}
              characterAssetIdByCharacterId={harnessCharacterAssetIdByCharacterId}
              characterPreloadPlan={harnessShowcaseCharacterPreloadPlan}
              diagnostics={runtime.diagnostics}
              presentation={runtime.presentation}
              onStageHandleChanged={pixiStage.onStageHandleChanged}
            />
          </div>
        </GameInteractionShell>
        <div className="hud harness-hud harness-showcase-hud">
          <div className="objective-chip">
            <span data-testid="harness-scenario-id">harness-showcase</span>
            <strong data-testid="harness-scenario-title">Navi To VN Harness Showcase</strong>
            <small data-testid="harness-status">{flow.mode === "title" ? "标题界面" : flow.mode === "trial" ? "Trial 模式" : runtime.shell.storyRuntime.active ? "视觉小说覆盖层" : "Navi 探索"}</small>
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
                pixiBackground={runtime.presentation.pixiStageRuntime.snapshot.backgroundsById.MainBackground?.appearance ?? "none"}
                pixiCharacterTone={formatPixiCharacterTone(runtime.presentation.pixiStageRuntime.snapshot)}
                pixiCharacters={formatPixiStageCharacters(runtime.presentation.pixiStageRuntime.snapshot)}
                pixiRevision={String(runtime.presentation.pixiStageRuntime.snapshot.revision)}
                pixiTasks={formatPixiPresentationTasks(runtime.presentation.pixiStageRuntime.presentationTasks)}
                pointerLockStatus={runtime.firstPersonBridge.pointerLockStatus}
                route={String(runtime.shell.storyRuntime.state.variables.route ?? "none")}
                substate={runtime.navi.substate}
                trialInputLock={runtime.trialRuntime.state?.inputLock ?? "none"}
                trialKeywords={formatTrialKeywordStates(runtime.trialRuntime.state?.keywordStates)}
                trialOutcome={runtime.trialRuntime.lastOutcome}
                trialPresentation={runtime.trialRuntime.state?.presentation ?? "none"}
                trialSegment={runtime.trialRuntime.state?.currentSegmentId ?? "none"}
              />
              <HarnessShowcaseRuntimeControls
                advanceDisabled={!runtime.shell.storyRuntime.active}
                onExitTrial={runtime.exitTrial}
                onAdvanceStory={runtime.shell.advanceStory}
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
                scriptPointer={runtime.shell.storyRuntime.state.instructionPointer}
                variables={runtime.shell.storyRuntime.state.variables}
                inventoryItems={runtime.gameplay.inventory.items}
                evidenceIds={runtime.gameplay.evidence.ownedEvidenceIds}
                {...(runtime.trialRuntime.state?.currentSegmentId ? { trialSegmentId: runtime.trialRuntime.state.currentSegmentId } : {})}
                backlogCount={runtime.debug.storyRuntime.state.backlog.length}
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
    return [`${actor.id}/${actor.appearanceExpression || "default"}${pos}[${actor.visible ? "visible" : "hidden"}]`];
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
  pixiCharacterTone,
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
  pixiCharacterTone: string;
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
        <Readout label="Tone" testId="harness-showcase-character-tone" value={pixiCharacterTone} />
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

function formatPixiCharacterTone(snapshot: PixiStageSnapshot): string {
  const tone = snapshot.characterTone;
  return tone ? `${tone.preset}@${tone.amount}` : "none";
}

function Readout({ label, testId, value, wide = false }: { label: string; testId: string; value: string; wide?: boolean }) {
  return (
    <p className={wide ? "harness-showcase-readout-row harness-showcase-readout-row-wide" : "harness-showcase-readout-row"}>
      <span>{label}</span>
      <strong data-testid={testId}>{value}</strong>
    </p>
  );
}
