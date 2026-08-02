import { useEffect, useRef } from "react";
import {
  canPreviewVnDevtoolsLine,
  NANI_DEVTOOLS_VITE_CATALOG_DIRTY_EVENT,
  NANI_DEVTOOLS_VITE_UPDATE_EVENT,
  VnDevtoolsDock,
  useVnDevtoolsController,
  type NaniDevtoolsViteUpdate,
  type NaniDevtoolsViteCatalogDirty,
  type NaniDevtoolsViteSnapshot,
  type VnDevtoolsScriptCandidate,
  type VnDevtoolsSourceUpdateSource
} from "@v-ronpa/app-vn-devtools";
import type {
  VnDiagnosticsPort,
  VnLifecyclePort,
  VnPresentationPort,
  VnRuntimeShellPort
} from "@v-ronpa/app-vn-runtime";
import type { SaveableVnState } from "@v-ronpa/contracts";
import type { GameAStoryDefinition } from "../gameAScripts";
import naniSnapshot from "virtual:v-ronpa-nani-devtools-snapshot";

const SESSION_KEY = "v-ronpa:game-a:nani-devtools:v4";

const initialNaniCandidates = sourceCandidatesFromSnapshot(naniSnapshot);

const gameANaniUpdateSource: VnDevtoolsSourceUpdateSource | undefined = import.meta.hot
  ? {
      subscribe(listener) {
        const handleUpdate = (update: NaniDevtoolsViteUpdate) => listener(update);
        import.meta.hot!.on(NANI_DEVTOOLS_VITE_UPDATE_EVENT, handleUpdate);
        return () => import.meta.hot?.off(NANI_DEVTOOLS_VITE_UPDATE_EVENT, handleUpdate);
      },
      subscribeCatalogDirty(listener) {
        const handleDirty = (event: NaniDevtoolsViteCatalogDirty) => listener(event);
        import.meta.hot!.on(NANI_DEVTOOLS_VITE_CATALOG_DIRTY_EVENT, handleDirty);
        return () => import.meta.hot?.off(NANI_DEVTOOLS_VITE_CATALOG_DIRTY_EVENT, handleDirty);
      }
    }
  : undefined;

export interface GameANaniDevtoolsProps {
  storyDefinition: GameAStoryDefinition;
  runtime: {
    shell: Pick<VnRuntimeShellPort, "interactionFacts" | "storyRuntime" | "uiRuntime">;
    presentation: Pick<VnPresentationPort, "pixiStageRuntime" | "storySession">;
    lifecycle: Pick<VnLifecyclePort, "createVnSaveCheckpoint">;
    diagnostics: Pick<VnDiagnosticsPort, "runtimeDiagnostics">;
  };
  vnActive: boolean;
  adoptCandidate: (candidate: VnDevtoolsScriptCandidate, signal: AbortSignal) => Promise<boolean>;
  commitCandidate: (
    candidate: VnDevtoolsScriptCandidate,
    checkpoint: SaveableVnState,
    signal: AbortSignal,
    onAccepted: () => void
  ) => Promise<boolean>;
}

function sourceCandidatesFromSnapshot(snapshot: NaniDevtoolsViteSnapshot) {
  return snapshot.scripts.map((script) => ({
    entryId: snapshot.entry.id,
    scope: script.scope,
    scriptPath: script.scriptPath,
    sourceText: script.sourceText,
    serverRevision: script.executionDisposition === "runnable" ? script.semanticRevision : null,
    executionDisposition: script.executionDisposition,
    diagnostics: script.diagnostics
  }));
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
  }
}

export function GameANaniDevtools({
  adoptCandidate,
  commitCandidate,
  storyDefinition,
  runtime,
  vnActive
}: GameANaniDevtoolsProps) {
  const controller = useVnDevtoolsController({
    adoptCandidate,
    commitCandidate,
    entry: storyDefinition.entry,
    catalog: storyDefinition.catalog,
    sourceDiagnosticPolicy: storyDefinition.sourceDiagnosticPolicy,
    initialCandidates: initialNaniCandidates,
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
          degraded: current.controller.status.degraded ?? false,
          recovered: current.controller.status.recovered ?? false,
          diagnostics: current.controller.diagnostics.map((diagnostic) => ({
            code: diagnostic.code ?? null,
            severity: diagnostic.severity
          })),
          collapsed: current.controller.collapsed,
          pinned: current.controller.lines.some((line) => line.pinned),
          materializationMode: current.controller.materializationMode,
          materializationModeLocked: current.controller.materializationModeLocked,
          viewedScriptPath: current.controller.viewedScriptPath,
          runtimeScriptPath: current.controller.runtimeScriptPath,
          revision: current.controller.scripts.find((script) => script.viewed)?.revision ?? null,
          lineCount: current.controller.lines.length,
          previewableLineCount: current.controller.lines.filter(canPreviewVnDevtoolsLine).length,
          blockedLineCount: current.controller.lines.filter((line) => line.previewability === "blocked").length
        },
        story: {
          storySession: current.runtime.presentation.storySession,
          executedScriptPaths: current.runtime.shell.storyRuntime.executedScriptPaths,
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
