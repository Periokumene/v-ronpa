import { useState } from "react";
import type { PresentationCommand } from "@v-ronpa/contracts";
import { PixiLayer } from "../../../PixiLayer";
import { ScenarioFrame } from "../../ScenarioFrame";

function createDefaultCommands(): PresentationCommand[] {
  return [
    { type: "set-background", backgroundId: "bg:harness", effect: "fade" },
    {
      type: "char-enter",
      characterId: "character:mira",
      portraitId: "portrait:mira:neutral",
      slot: "left",
      effect: "fadeIn"
    },
    {
      type: "char-enter",
      characterId: "character:missing-witness",
      portraitId: "portrait:missing-witness:neutral",
      slot: "center",
      effect: "fadeIn"
    },
    {
      type: "char-enter",
      characterId: "character:felix",
      portraitId: "portrait:felix:concerned",
      slot: "right",
      effect: "fadeIn"
    },
    { type: "flash", color: "#ffd166", durationMs: 720 },
    { type: "shake", target: "portraits", intensity: 0.45, durationMs: 700 }
  ];
}

export function PixiVnScenario() {
  const [commands, setCommands] = useState<PresentationCommand[]>(() => createDefaultCommands());
  const [layerKey, setLayerKey] = useState(0);
  const [lastAction, setLastAction] = useState("default command sequence");

  function replay() {
    setCommands(createDefaultCommands());
    setLayerKey((current) => current + 1);
    setLastAction("replayed default command sequence");
  }

  function clear() {
    setCommands([]);
    setLayerKey((current) => current + 1);
    setLastAction("cleared scenario-local command state");
  }

  function triggerEffects() {
    setCommands((current) => [
      ...current,
      { type: "flash", color: "#ffffff", durationMs: 1200 },
      { type: "shake", target: "portraits", intensity: 0.7, durationMs: 1100 }
    ]);
    setLastAction("triggered flash and shake");
  }

  return (
    <ScenarioFrame
      scenarioId="pixi-vn"
      title="Pixi VN Portrait Presenter"
      description="Pixi presenter thin slice: harness portrait assets, missing-asset fallback, deterministic char-enter slots, fade, shake, and flash."
      status="Presenter active: local controls drive only the pixi-vn scenario"
      log={[
        { id: "commands", label: "Commands", value: String(commands.length) },
        { id: "slots", label: "Slots", value: "left=mira, center=fallback, right=felix" },
        { id: "last-action", label: "Last action", value: lastAction }
      ]}
      commands={
        <>
          <button data-testid="pixi-vn-replay" type="button" onClick={replay}>
            Replay commands
          </button>
          <button data-testid="pixi-vn-clear" type="button" onClick={clear}>
            Clear
          </button>
          <button data-testid="pixi-vn-effects" type="button" onClick={triggerEffects}>
            Flash + shake
          </button>
        </>
      }
    >
      <div className="scene-stack" data-testid="pixi-vn-shell">
        <PixiLayer key={layerKey} commands={commands} visible />
      </div>
    </ScenarioFrame>
  );
}
