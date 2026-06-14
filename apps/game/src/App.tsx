import { useMemo, useState } from "react";
import { createActor } from "xstate";
import {
  GameModeSchema,
  type CameraControlMode,
  type GameMode,
  type PresentationCommand,
  type TrialPresentationProfile
} from "@v-ronpa/contracts";
import { gameFlowMachine, modeFromSnapshotValue, type GameFlowEvent } from "@v-ronpa/game-flow-machine";
import { createGameplayState, grantEvidence, grantItem } from "@v-ronpa/gameplay";
import { parseScenario } from "@v-ronpa/nani-parser";
import { createInitialNaviState, naviReducer, resolveNaviInteractable } from "@v-ronpa/navi-director";
import { ExplorationStage3D, TrialRoundTableStage } from "@v-ronpa/r3f-adapter";
import { createInitialStoryState, storyReducer, type StoryRuntimeState } from "@v-ronpa/story-engine";
import {
  createInitialTrialState,
  forceTrialSegment,
  resolveTrialKeyword,
  resolveTrialTimer,
  setTrialPresentation,
  submitTrialEvidence,
  type TrialDirectorOutcome
} from "@v-ronpa/trial-director";
import { DialogBox, InspectorLite, ScenarioTabs } from "@v-ronpa/ui-kit";
import { harnessMap, harnessScript, harnessTrial } from "./fixtures";
import { PixiLayer } from "./PixiLayer";

const scenarioOptions = [
  { id: "navi", label: "Navi" },
  { id: "trial", label: "Trial" }
];

export function App() {
  const parsed = useMemo(() => parseScenario({ sourceText: harnessScript, scriptPath: "harness.nani" }), []);
  const [flow] = useState(() => {
    const actor = createActor(gameFlowMachine).start();
    actor.send({ type: "BOOT" });
    return actor;
  });
  const [mode, setMode] = useState<GameMode>("navi");
  const [navi, setNavi] = useState(() => createInitialNaviState(harnessMap.id));
  const [trial, setTrial] = useState(() => createInitialTrialState(harnessTrial));
  const [story, setStory] = useState<StoryRuntimeState>(() => createInitialStoryState(parsed.scenario));
  const [gameplay, setGameplay] = useState(() => grantEvidence(createGameplayState(), "evidence:keycard"));
  const [notice, setNotice] = useState("Navi walk: 3D exploration baseline");

  const activeDialog = story.backlog.at(-1) ?? {
    speaker: "System",
    text: mode === "navi" ? "Navi owns walk, interactions, inventory, and VN2D overlays." : "Trial owns discussion, VN3D staging, debate, evidence, and branch outcomes."
  };

  const naviOverlayVisible = mode === "navi" && (navi.substate === "vn2d-overlay" || navi.substate === "event");
  const trialDialogVisible = mode === "trial" && (trial.presentation === "vn2d" || trial.presentation === "vn3d");
  const pixiVisible = naviOverlayVisible || mode === "trial";
  const currentDetail = mode === "navi" ? navi.substate : trial.presentation;
  const currentInputLock = mode === "navi" ? navi.inputLock : trial.inputLock;
  const currentCameraMode: CameraControlMode =
    mode === "navi"
      ? navi.inputLock === "none"
        ? "first-person"
        : "locked"
      : trial.presentation === "debate3d"
        ? "trial-targeting"
        : trial.presentation === "vn3d"
          ? "scripted-focus"
          : "locked";
  const presentationCommands = story.presentationCommands;

  function transition(nextMode: string) {
    const parsedMode = GameModeSchema.parse(nextMode);
    const event: GameFlowEvent["type"] = parsedMode === "trial" ? "ENTER_TRIAL" : "ENTER_NAVI";
    flow.send({ type: event });
    const next = modeFromSnapshotValue(flow.getSnapshot().value);
    setMode(next);
    setNotice(next === "trial" ? "Trial: segment flow owns presentation profile" : "Navi walk: 3D exploration baseline");
  }

  function advanceStory() {
    setStory((current) => {
      let next = current;
      for (let i = 0; i < 4 && !next.ended && next.pendingChoices.length === 0; i += 1) {
        next = storyReducer(next, { type: "STEP", scenario: parsed.scenario });
      }
      return next;
    });
  }

  function choose(index: number) {
    setStory((current) => storyReducer(current, { type: "CHOOSE", scenario: parsed.scenario, index }));
  }

  function pushPresentation(command: PresentationCommand) {
    setStory((current) => ({
      ...current,
      presentationCommands: [...current.presentationCommands, command]
    }));
  }

  function startNaviVn2d() {
    setMode("navi");
    setNavi((current) => naviReducer(current, { type: "START_VN2D", script: "harness.nani#Start" }));
    setNotice("Navi: VN2D foreground overlay active");
  }

  function openNaviInventory() {
    setMode("navi");
    setNavi((current) => naviReducer(current, { type: "OPEN_INVENTORY" }));
    setNotice("Navi: inventory overlay owns input lock");
  }

  function returnToWalk() {
    setMode("navi");
    setNavi((current) => naviReducer(current, { type: "CLOSE_OVERLAY" }));
    setNotice("Navi walk: 3D exploration baseline");
  }

  function inspectCaseFile() {
    const resolution = resolveNaviInteractable(navi, harnessMap, gameplay, "interactable:case-file");
    setNavi(resolution.navi);
    setGameplay(resolution.gameplay);
    setNotice(
      resolution.outcome.type === "grant-item"
        ? `Navi granted ${resolution.outcome.itemId}`
        : resolution.outcome.type === "grant-evidence"
          ? `Navi granted ${resolution.outcome.evidenceId}`
          : `Navi outcome: ${resolution.outcome.type}`
    );
  }

  function setTrialProfile(profile: TrialPresentationProfile) {
    setMode("trial");
    setTrial((current) => {
      const segmentId = profile === "debate3d" ? "debate:door" : "discussion:opening";
      return setTrialPresentation(forceTrialSegment(harnessTrial, current, segmentId), profile);
    });
    setNotice(`Trial presentation: ${profile}`);

    if (profile === "vn3d") {
      pushPresentation({
        type: "camera-focus",
        targetId: "character:felix",
        framing: "close",
        durationMs: 520
      });
    }

    if (profile === "debate3d") {
      pushPresentation({
        type: "trial-subtitle",
        subtitleId: "subtitle:locked",
        text: "The door was locked!",
        style: "barrage",
        speakerId: "character:felix",
        keywordId: "kw:locked",
        evidenceId: "evidence:keycard"
      });
    }
  }

  function breakKeyword() {
    setMode("trial");
    setTrial((current) => {
      const result = resolveTrialKeyword(harnessTrial, current, "kw:locked", "evidence:keycard");
      setNotice(`Trial outcome: ${result.outcome.type} -> ${outcomeNextSegment(result.outcome) ?? "none"}`);
      return result.trial;
    });
    pushPresentation({
      type: "flash",
      color: "#ffe66d",
      durationMs: 160
    });
  }

  function forceTrialTimeout() {
    setMode("trial");
    setTrial((current) => {
      const result = resolveTrialTimer(harnessTrial, current);
      setNotice(`Trial timeout: ${outcomeNextSegment(result.outcome) ?? "none"}`);
      return result.trial;
    });
  }

  function submitKeycard() {
    setMode("trial");
    setTrial((current) => {
      const result = submitTrialEvidence(harnessTrial, current, "evidence:keycard");
      const accepted = result.outcome.type === "evidence" && result.outcome.accepted;
      setNotice(`Evidence submit: ${accepted ? "accepted" : "rejected"}`);
      return result.trial;
    });
  }

  return (
    <main className="app-shell">
      <section className="playfield" data-testid="playfield">
        <div className="scene-stack">
          {mode === "trial" ? (
            <TrialRoundTableStage
              speakers={["character:felix", "character:mira", "character:sol"]}
              focusedSpeakerId="character:felix"
              presentationProfile={trial.presentation}
              cameraMode={currentCameraMode}
              inputLock={currentInputLock}
            />
          ) : (
            <ExplorationStage3D
              map={harnessMap}
              cameraMode={currentCameraMode}
              inputLock={currentInputLock}
              {...(navi.activeInteractableId ? { activeInteractableId: navi.activeInteractableId } : {})}
            />
          )}
          <PixiLayer commands={presentationCommands} visible={pixiVisible} />
        </div>

        <div className="hud">
          <div className="objective-chip">
            <span data-testid="current-mode">{mode}</span>
            <strong>{notice}</strong>
            <small data-testid="current-detail">{currentDetail}</small>
            <small data-testid="current-input-lock">{currentInputLock}</small>
            <small data-testid="current-camera-mode">{currentCameraMode}</small>
          </div>
          <ScenarioTabs options={scenarioOptions} value={mode} onChange={transition} />
          <div className="command-strip">
            {mode === "navi" ? (
              <>
                <button onClick={inspectCaseFile} data-testid="inspect-case-file">
                  Inspect case file
                </button>
                <button onClick={startNaviVn2d} data-testid="navi-vn2d">
                  Trigger VN2D
                </button>
                <button onClick={openNaviInventory} data-testid="open-inventory">
                  Open inventory
                </button>
                <button onClick={returnToWalk} data-testid="return-walk">
                  Walk
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setTrialProfile("vn2d")} data-testid="trial-vn2d">
                  Discussion VN2D
                </button>
                <button onClick={() => setTrialProfile("vn3d")} data-testid="trial-vn3d">
                  Discussion VN3D
                </button>
                <button onClick={() => setTrialProfile("debate3d")} data-testid="trial-debate3d">
                  Debate 3D
                </button>
                <button onClick={breakKeyword} data-testid="break-keyword">
                  Break keyword
                </button>
                <button onClick={submitKeycard} data-testid="submit-evidence">
                  Submit evidence
                </button>
                <button onClick={forceTrialTimeout} data-testid="force-timeout">
                  Timeout
                </button>
              </>
            )}
            <button onClick={advanceStory} data-testid="advance-story">
              Advance script
            </button>
          </div>
        </div>

        {(naviOverlayVisible || trialDialogVisible) && (
          <DialogBox {...(activeDialog.speaker ? { speaker: activeDialog.speaker } : {})} text={activeDialog.text}>
            {story.pendingChoices.length > 0 && (
              <div className="choice-row" data-testid="choice-row">
                {story.pendingChoices.map((choice, index) => (
                  <button key={choice.text} onClick={() => choose(index)}>
                    {choice.text}
                  </button>
                ))}
              </div>
            )}
          </DialogBox>
        )}

        {mode === "navi" && navi.substate === "inventory" && (
          <section className="inventory-panel" data-testid="inventory-panel">
            <h1>Inventory / Evidence</h1>
            <h2>Items</h2>
            <ul>
              {Object.entries(gameplay.inventory.items).map(([itemId, quantity]) => (
                <li key={itemId}>
                  <span>{itemId}</span>
                  <strong>{quantity}</strong>
                </li>
              ))}
            </ul>
            <h2>Evidence</h2>
            <ul>
              {gameplay.evidence.ownedEvidenceIds.map((evidenceId) => (
                <li key={evidenceId}>
                  <span>{evidenceId}</span>
                  <strong>owned</strong>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>

      <InspectorLite
        mode={mode}
        detail={currentDetail}
        inputLock={currentInputLock}
        naviSubstate={navi.substate}
        trialPresentation={trial.presentation}
        scriptPointer={story.instructionPointer}
        variables={story.variables}
        inventoryItems={gameplay.inventory.items}
        evidenceIds={gameplay.evidence.ownedEvidenceIds}
        trialSegmentId={trial.currentSegmentId}
        presentationCommands={presentationCommands}
        onGrantItem={(itemId) => setGameplay((current) => grantItem(current, itemId))}
        onGrantEvidence={(evidenceId) => setGameplay((current) => grantEvidence(current, evidenceId))}
        onJumpLabel={(label) => setStory((current) => storyReducer(current, { type: "JUMP", scenario: parsed.scenario, label }))}
        onForceOutcome={breakKeyword}
      />
    </main>
  );
}

function outcomeNextSegment(outcome: TrialDirectorOutcome): string | undefined {
  return "nextSegmentId" in outcome ? outcome.nextSegmentId : undefined;
}
