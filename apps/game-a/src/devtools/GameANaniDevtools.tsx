import { useEffect, useRef } from "react";
import {
  NANI_DEVTOOLS_VITE_UPDATE_EVENT,
  VnDevtoolsDock,
  useVnDevtoolsController,
  type NaniDevtoolsViteUpdate,
  type VnDevtoolsSourceUpdateSource
} from "@v-ronpa/app-vn-devtools";
import type {
  VnDiagnosticsPort,
  VnLifecyclePort,
  VnPresentationPort,
  VnRuntimeEntry,
  VnRuntimeShellPort
} from "@v-ronpa/app-vn-runtime";
import type { SaveableVnState } from "@v-ronpa/contracts";
import initialNaniCandidates from "virtual:v-ronpa-nani-devtools-initial";
import "./GameANaniDevtools.css";

const SESSION_KEY = "v-ronpa:game-a:nani-devtools:v1";

const gameANaniUpdateSource: VnDevtoolsSourceUpdateSource | undefined = import.meta.hot
  ? {
      subscribe(listener) {
        const handleUpdate = (update: NaniDevtoolsViteUpdate) => listener(update);
        import.meta.hot!.on(NANI_DEVTOOLS_VITE_UPDATE_EVENT, handleUpdate);
        return () => import.meta.hot?.off(NANI_DEVTOOLS_VITE_UPDATE_EVENT, handleUpdate);
      }
    }
  : undefined;

export interface GameANaniDevtoolsProps {
  entry: VnRuntimeEntry;
  runtime: {
    shell: Pick<VnRuntimeShellPort, "interactionFacts" | "storyRuntime" | "uiRuntime">;
    presentation: Pick<VnPresentationPort, "pixiStageRuntime" | "storySession">;
    lifecycle: Pick<VnLifecyclePort, "createVnSaveCheckpoint">;
    diagnostics: Pick<VnDiagnosticsPort, "runtimeDiagnostics">;
  };
  vnActive: boolean;
  adoptCandidate: (entry: VnRuntimeEntry, signal: AbortSignal) => Promise<boolean>;
  commitCandidate: (
    entry: VnRuntimeEntry,
    checkpoint: SaveableVnState,
    signal: AbortSignal,
    onAccepted: () => void
  ) => Promise<boolean>;
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
  }
}

export function GameANaniDevtools({
  adoptCandidate,
  commitCandidate,
  entry,
  runtime,
  vnActive
}: GameANaniDevtoolsProps) {
  const initialCandidate = initialNaniCandidates.find((candidate) =>
    candidate.entryId === entry.id && candidate.scriptPath === entry.scriptPath);
  const controller = useVnDevtoolsController({
    adoptCandidate,
    commitCandidate,
    entry,
    ...(initialCandidate ? { initialCandidate } : {}),
    runtime,
    sessionKey: SESSION_KEY,
    ...(gameANaniUpdateSource ? { updateSource: gameANaniUpdateSource } : {}),
    vnActive
  });
  const renderStateRef = useRef({ controller, runtime });
  renderStateRef.current = { controller, runtime };

  useEffect(() => {
    window.render_game_to_text = () => {
      const current = renderStateRef.current;
      const checkpoint = current.runtime.lifecycle.createVnSaveCheckpoint({ allowInactive: true });
      return JSON.stringify({
        coordinateSystem: "DOM viewport; origin top-left; x right; y down",
        mode: current.runtime.shell.storyRuntime.active ? "vn" : "title-or-overlay",
        workbench: {
          phase: current.controller.status.phase,
          message: current.controller.status.message ?? null,
          updateId: current.controller.status.updateId ?? null,
          collapsed: current.controller.collapsed,
          pinned: current.controller.lines.some((line) => line.pinned),
          revision: current.controller.scriptRevision ?? null
        },
        story: {
          storySession: current.runtime.presentation.storySession,
          instructionPointer: current.runtime.shell.storyRuntime.state.instructionPointer,
          text: current.runtime.shell.storyRuntime.state.text?.current?.text ?? null,
          variables: current.runtime.shell.storyRuntime.state.variables,
          choices: current.runtime.shell.storyRuntime.state.pendingChoices.map((choice) => choice.text)
        },
        pixi: {
          revision: current.runtime.presentation.pixiStageRuntime.snapshot.revision,
          backgrounds: Object.keys(current.runtime.presentation.pixiStageRuntime.snapshot.backgroundsById),
          characters: Object.keys(current.runtime.presentation.pixiStageRuntime.snapshot.charactersById),
          weather: Object.keys(current.runtime.presentation.pixiStageRuntime.snapshot.weather)
        },
        stableCheckpoint: checkpoint.ok
          ? {
              ui: checkpoint.value.ui,
              media: checkpoint.value.media
            }
          : {
              rejection: checkpoint.code
            }
      });
    };
    return () => {
      delete window.render_game_to_text;
    };
  }, []);

  return <VnDevtoolsDock controller={controller} />;
}
