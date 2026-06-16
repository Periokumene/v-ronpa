import { useCallback, useMemo, useState, type MutableRefObject } from "react";
import type {
  CameraControlMode,
  InputActionState,
  InputLockState,
  NaviInteractionSensorReport,
  PlayerPose,
  WorldMapDef
} from "@v-ronpa/contracts";
import type { ExplorationStageProps, FirstPersonInteractRequest, PointerLockStatus } from "@v-ronpa/r3f-adapter";

const POINTER_LOCK_TRIGGER_ATTRIBUTE = "data-first-person-pointer-lock-trigger";
const POINTER_LOCK_TRIGGER_SELECTOR = `[${POINTER_LOCK_TRIGGER_ATTRIBUTE}="true"]`;
const POINTER_LOCK_DENIED_DELAY_MS = 450;

export interface FirstPersonExplorationBridgeOptions {
  map: WorldMapDef;
  cameraMode: CameraControlMode;
  inputLock: InputLockState;
  inputActionsRef: MutableRefObject<InputActionState>;
  activeInteractableId?: string;
  onSensorReport: (report: NaviInteractionSensorReport) => void;
  onInteractRequest: (request: FirstPersonInteractRequest) => void;
}

export interface FirstPersonPointerLockTriggerProps {
  type: "button";
  disabled: boolean;
  "aria-pressed": boolean;
  "data-first-person-pointer-lock-trigger": "true";
  onClick: () => void;
}

interface PoseCommand {
  pose?: PlayerPose;
  signal: number;
}

export function useFirstPersonExplorationBridge({
  map,
  cameraMode,
  inputLock,
  inputActionsRef,
  activeInteractableId,
  onSensorReport,
  onInteractRequest
}: FirstPersonExplorationBridgeOptions) {
  const [interactSignal, setInteractSignal] = useState(0);
  const [pointerLockStatus, setPointerLockStatus] = useState<PointerLockStatus>("idle");
  const [poseCommand, setPoseCommand] = useState<PoseCommand>({ signal: 0 });
  const pointerLockAvailable = cameraMode === "first-person" && inputLock === "none";

  const requestInteract = useCallback(() => {
    setInteractSignal((signal) => signal + 1);
  }, []);

  const issuePoseCommand = useCallback((pose: PlayerPose) => {
    setPoseCommand((current) => ({ pose, signal: current.signal + 1 }));
  }, []);

  const requestPointerLockStatus = useCallback(() => {
    if (!pointerLockAvailable) return;

    setPointerLockStatus("requested");
    window.setTimeout(() => {
      setPointerLockStatus((current) => (current === "requested" ? "denied" : current));
    }, POINTER_LOCK_DENIED_DELAY_MS);
  }, [pointerLockAvailable]);

  const pointerLockTriggerProps = useMemo<FirstPersonPointerLockTriggerProps>(
    () => ({
      type: "button",
      disabled: !pointerLockAvailable,
      "aria-pressed": pointerLockStatus === "locked",
      "data-first-person-pointer-lock-trigger": "true",
      onClick: requestPointerLockStatus
    }),
    [pointerLockAvailable, pointerLockStatus, requestPointerLockStatus]
  );

  const explorationStageProps = useMemo<ExplorationStageProps>(() => {
    const props: ExplorationStageProps = {
      map,
      cameraMode,
      inputLock,
      inputActionsRef,
      interactSignal,
      pointerLockSelector: POINTER_LOCK_TRIGGER_SELECTOR,
      onSensorReport,
      onInteractRequest,
      onPointerLockChange: setPointerLockStatus
    };

    if (activeInteractableId) props.activeInteractableId = activeInteractableId;
    if (poseCommand.pose) {
      props.poseOverride = poseCommand.pose;
      props.poseOverrideSignal = poseCommand.signal;
    }

    return props;
  }, [
    activeInteractableId,
    cameraMode,
    inputActionsRef,
    inputLock,
    interactSignal,
    map,
    onInteractRequest,
    onSensorReport,
    poseCommand.pose,
    poseCommand.signal
  ]);

  return {
    explorationStageProps,
    issuePoseCommand,
    pointerLockStatus,
    pointerLockTriggerProps,
    requestInteract
  };
}
