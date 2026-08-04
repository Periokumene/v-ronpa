import {
  createVnRuntimePresentationTransaction,
  deriveUiRuntimeLifecycleState,
  settleUiRuntimeTransitions,
  type MediaRuntimeEffect,
  type MediaRuntimeState,
  type UiRuntimeState,
  type VnOutputRouteTable,
  type VnRuntimePresentationTransaction,
  type VnRuntimeProfile
} from "@v-ronpa/app-vn-dispatch";
import type {
  GameplayEvent,
  PixiStageSnapshot,
  RuntimeCommand
} from "@v-ronpa/contracts";
import type { VnSessionState } from "@v-ronpa/app-vn-session";
import {
  reconcilePixiStageScriptScope,
  type PixiStageRenderHint
} from "@v-ronpa/pixi-stage-model";

/**
 * Stable state produced by one Story instruction plus its presentation fanout.
 *
 * This function is deliberately free of React, media ports, timers, storage,
 * and presenters. The live runtime applies the transient descriptors while the
 * debug materializer discards them and commits only the stable state.
 */
export interface ProjectVnRuntimeStepInput {
  active: boolean;
  animatePixi: boolean;
  nowMs: number;
  previousMediaState: MediaRuntimeState;
  previousPixiStage: PixiStageSnapshot;
  previousUiState: UiRuntimeState;
  profile: VnRuntimeProfile;
  routeTable?: VnOutputRouteTable;
  runtimeCommands: RuntimeCommand[];
  session: VnSessionState;
}

export interface ProjectVnRuntimeStepResult {
  session: VnSessionState;
  runtime: {
    uiState: UiRuntimeState;
  };
  stable: {
    mediaState: MediaRuntimeState;
    pixiStage: PixiStageSnapshot;
    uiState: UiRuntimeState;
  };
  transient: {
    gameplayEvents: GameplayEvent[];
    mediaEffects: MediaRuntimeEffect[];
    pixiHints: PixiStageRenderHint[];
  };
  transaction: VnRuntimePresentationTransaction;
}

export function projectVnRuntimeStep({
  active,
  animatePixi,
  nowMs,
  previousMediaState,
  previousPixiStage,
  previousUiState,
  profile,
  routeTable,
  runtimeCommands,
  session
}: ProjectVnRuntimeStepInput): ProjectVnRuntimeStepResult {
  const scopedPreviousPixiStage = reconcilePixiStageScriptScope(
    {
      snapshot: previousPixiStage,
      hints: [],
      waitTasks: [],
      diagnostics: []
    },
    session.script.scriptPath
  ).snapshot;
  const unscopedTransaction = createVnRuntimePresentationTransaction({
    nowMs,
    previousMediaState,
    previousPixiStage: scopedPreviousPixiStage,
    previousUiState,
    profile,
    runtimeCommands,
    ...(routeTable ? { routeTable } : {})
  });
  const scopedPixi = reconcilePixiStageScriptScope(
    {
      snapshot: unscopedTransaction.pixiStage,
      hints: unscopedTransaction.pixiHints,
      waitTasks: unscopedTransaction.pixiWaitTasks,
      diagnostics: unscopedTransaction.diagnostics
    },
    session.script.scriptPath
  );
  const transaction: VnRuntimePresentationTransaction = {
    ...unscopedTransaction,
    pixiStage: scopedPixi.snapshot,
    pixiHints: scopedPixi.hints,
    pixiWaitTasks: scopedPixi.waitTasks
  };
  const story = session.story.presentationWait?.channel === "pixi"
    ? {
        ...session.story,
        presentationWait: {
          ...session.story.presentationWait,
          stageRevision: transaction.pixiStage.revision,
          expectedTasks: animatePixi ? transaction.pixiWaitTasks : []
        }
      }
    : session.story;
  const projectedSession = { ...session, active, story };
  const projectedUiState = deriveUiRuntimeLifecycleState(
    animatePixi ? transaction.uiState : settleUiRuntimeTransitions(transaction.uiState),
    story
  );
  const stablePinpVisible = projectedUiState.surfaces.pinp.targetVisible && Boolean(projectedUiState.pinp);
  const stableUiState: UiRuntimeState = {
    surfaces: {
      ...projectedUiState.surfaces,
      pinp: stablePinpVisible
        ? { targetVisible: true, mounted: true, opacity: 1, phase: "shown" }
        : { targetVisible: false, mounted: false, opacity: 0, phase: "hidden" }
    },
    toasts: [],
    toastSequence: 0,
    pinpSequence: 0,
    ...(stablePinpVisible && projectedUiState.pinp
      ? {
          pinp: {
            assetId: projectedUiState.pinp.assetId,
            alt: projectedUiState.pinp.alt,
            positionPercent: [projectedUiState.pinp.positionPercent[0], projectedUiState.pinp.positionPercent[1]],
            heightPercent: projectedUiState.pinp.heightPercent,
            aspectRatio: [projectedUiState.pinp.aspectRatio[0], projectedUiState.pinp.aspectRatio[1]]
          }
        }
      : {})
  };

  return {
    session: projectedSession,
    runtime: {
      uiState: projectedUiState
    },
    stable: {
      mediaState: transaction.mediaState,
      pixiStage: transaction.pixiStage,
      uiState: stableUiState
    },
    transient: {
      gameplayEvents: transaction.gameplayEvents,
      mediaEffects: transaction.mediaEffects,
      pixiHints: transaction.pixiHints
    },
    transaction
  };
}
