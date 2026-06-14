import type { PresentationCommand } from "@v-ronpa/contracts";
import { PixiLayer } from "../../../PixiLayer";
import { ScenarioFrame } from "../../ScenarioFrame";

const commands: PresentationCommand[] = [
  { type: "set-background", backgroundId: "bg:harness", effect: "fade" },
  {
    type: "char-enter",
    characterId: "character:felix",
    portraitId: "portrait:felix:neutral",
    slot: "center",
    effect: "fadeIn"
  },
  { type: "flash", color: "#ffd166", durationMs: 160 }
];

export function PixiVnScenario() {
  return (
    <ScenarioFrame
      scenarioId="pixi-vn"
      title="Pixi VN Portrait Presenter"
      description="Reserved entry for pixi-presenter work: imagegen portrait assets, missing-asset fallback, char-enter slots, fade, shake, and flash."
      status="P0 shell: current PixiLayer mounted with commands"
      log={[
        { id: "commands", label: "Commands", value: String(commands.length) },
        { id: "portrait", label: "Portrait", value: "portrait:felix:neutral" }
      ]}
      commands={
        <>
          <button data-testid="pixi-vn-replay" type="button">
            Replay commands
          </button>
          <button data-testid="pixi-vn-clear" type="button">
            Clear
          </button>
        </>
      }
    >
      <div className="scene-stack" data-testid="pixi-vn-shell">
        <PixiLayer commands={commands} visible />
      </div>
    </ScenarioFrame>
  );
}
