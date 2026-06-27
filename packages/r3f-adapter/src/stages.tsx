import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, PointerLockControls, useGLTF } from "@react-three/drei";
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type MutableRefObject,
  type ReactNode
} from "react";
import { Vector3 as ThreeVector3, type Camera, type Mesh, type Object3D } from "three";
import type {
  CameraControlMode,
  InputAction,
  InputActionState,
  InputBindingMap,
  InputLockState,
  NaviInteractionSensorReport,
  PlayerPose,
  RuntimeAssetKind,
  TrialPresentationProfile,
  Vector3,
  WorldMapDef
} from "@v-ronpa/contracts";
import { clampVectorToAabb } from "./first-person";

export interface ExplorationStageProps {
  map?: WorldMapDef;
  activeInteractableId?: string;
  cameraMode?: CameraControlMode;
  inputLock?: InputLockState;
  inputActionsRef?: MutableRefObject<InputActionState>;
  inputBindings?: InputBindingMap;
  poseOverride?: PlayerPose;
  poseOverrideSignal?: number;
  resetSignal?: number;
  interactSignal?: number;
  pointerLockRequestSignal?: number;
  pointerLockSelector?: string;
  onPoseChange?: (pose: PlayerPose) => void;
  onSensorReport?: (report: NaviInteractionSensorReport) => void;
  onInteractRequest?: (request: FirstPersonInteractRequest) => void;
  onFallbackChange?: (status: FirstPersonFallbackStatus) => void;
  onAssetDiagnostic?: (diagnostic: R3fAssetDiagnostic) => void;
  onPointerLockChange?: (status: PointerLockStatus) => void;
  assetResolver?: R3fAssetResolver;
}

export interface TrialRoundTableStageProps {
  speakers?: string[];
  focusedSpeakerId?: string;
  presentationProfile?: TrialPresentationProfile;
  cameraMode?: CameraControlMode;
  inputLock?: InputLockState;
}

export type PointerLockStatus = "idle" | "requested" | "locked" | "unlocked" | "denied";

export interface FirstPersonFallbackStatus {
  active: boolean;
  reason: "loading" | "loaded" | "no-model" | "asset-error";
  mapId?: string;
  assetUri?: string;
}

export interface FirstPersonInteractRequest {
  mapId?: string;
  pose: PlayerPose;
  facing?: Vector3;
}

export interface R3fAssetResolveInput {
  id: string;
  kind: RuntimeAssetKind;
}

export interface R3fAssetResolver {
  resolve(input: R3fAssetResolveInput): {
    uri?: string;
    diagnostic?: {
      code?: string;
      severity?: "info" | "warning" | "error";
      message: string;
    };
  };
}

export interface R3fAssetDiagnostic {
  source: "asset";
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  assetId?: string;
  kind?: RuntimeAssetKind;
}

export interface R3fMapModelAssetResolution {
  assetId?: string;
  uri?: string;
  diagnostic?: R3fAssetDiagnostic;
  fallbackReason?: FirstPersonFallbackStatus["reason"];
}

type MovementAction = Extract<InputAction, "move-forward" | "move-back" | "move-left" | "move-right">;

const DEFAULT_NAV_INPUT_BINDINGS = {
  version: 1,
  bindings: [
    { action: "move-forward", device: "keyboard", code: "KeyW", context: "navi" },
    { action: "move-back", device: "keyboard", code: "KeyS", context: "navi" },
    { action: "move-left", device: "keyboard", code: "KeyA", context: "navi" },
    { action: "move-right", device: "keyboard", code: "KeyD", context: "navi" },
    { action: "interact", device: "keyboard", code: "KeyE", context: "navi" }
  ]
} satisfies InputBindingMap;

const POSE_REPORT_EPSILON = 0.15;

export function ExplorationStage3D({
  map,
  activeInteractableId,
  cameraMode = "orbit-debug",
  inputLock = "none",
  inputActionsRef,
  inputBindings,
  poseOverride,
  poseOverrideSignal = 0,
  resetSignal = 0,
  interactSignal = 0,
  pointerLockRequestSignal = 0,
  pointerLockSelector,
  onPoseChange,
  onSensorReport,
  onInteractRequest,
  onFallbackChange,
  onAssetDiagnostic,
  assetResolver,
  onPointerLockChange
}: ExplorationStageProps) {
  const controlsEnabled = inputLock === "none" && cameraMode !== "locked" && cameraMode !== "scripted-focus";
  const firstPersonEnabled = cameraMode === "first-person" && inputLock === "none";
  const camera = useMemo(() => {
    const initialPose = getInitialPose(map);
    return { position: initialPose.position, fov: map?.cameraRig?.fov ?? 60 };
  }, [map]);

  return (
    <Canvas camera={camera} data-testid="r3f-canvas">
      <color attach="background" args={["#111720"]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 3]} intensity={1.6} />
      <MapAssetLayer map={map} assetResolver={assetResolver} onAssetDiagnostic={onAssetDiagnostic} onFallbackChange={onFallbackChange} />
      {(map?.interactables ?? []).map((interactable) => (
        <Hotspot
          key={interactable.id}
          label={interactable.label}
          position={interactable.position}
          active={interactable.id === activeInteractableId}
        />
      ))}
      {firstPersonEnabled ? (
        <FirstPersonRig
          map={map}
          inputActionsRef={inputActionsRef}
          inputBindings={inputBindings}
          poseOverride={poseOverride}
          poseOverrideSignal={poseOverrideSignal}
          resetSignal={resetSignal}
          interactSignal={interactSignal}
          pointerLockRequestSignal={pointerLockRequestSignal}
          pointerLockSelector={pointerLockSelector}
          onPoseChange={onPoseChange}
          onSensorReport={onSensorReport}
          onInteractRequest={onInteractRequest}
          onPointerLockChange={onPointerLockChange}
        />
      ) : (
        <OrbitControls
          enabled={controlsEnabled}
          enablePan={false}
          maxPolarAngle={Math.PI * 0.48}
          minDistance={3}
          maxDistance={8}
        />
      )}
    </Canvas>
  );
}

export function TrialRoundTableStage({
  speakers = [],
  focusedSpeakerId,
  presentationProfile = "debate3d",
  cameraMode = "trial-targeting",
  inputLock = "trial-targeting"
}: TrialRoundTableStageProps) {
  const arranged = useMemo(
    () =>
      speakers.map((speaker, index) => {
        const angle = (index / Math.max(1, speakers.length)) * Math.PI * 2;
        return {
          id: speaker,
          position: [Math.cos(angle) * 2.4, 0.9, Math.sin(angle) * 2.4] as [number, number, number],
          rotation: [0, -angle + Math.PI / 2, 0] as [number, number, number]
        };
      }),
    [speakers]
  );

  const isDebate = presentationProfile === "debate3d";
  const camera = isDebate ? { position: [0, 2.4, 5.4] as [number, number, number], fov: 54 } : { position: [0, 1.9, 4.2] as [number, number, number], fov: 46 };
  const controlsEnabled = inputLock === "none" && (cameraMode === "orbit-debug" || cameraMode === "trial-targeting");

  return (
    <Canvas camera={camera} data-testid="trial-r3f-canvas">
      <color attach="background" args={[isDebate ? "#17111d" : "#111720"]} />
      <ambientLight intensity={0.75} />
      <pointLight position={[0, 5, 0]} intensity={2.2} color="#ffdca8" />
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[2.1, 2.3, 0.24, 64]} />
        <meshStandardMaterial color="#3a2a43" roughness={0.55} metalness={0.1} />
      </mesh>
      {arranged.map((speaker) => (
        <BillboardCharacter
          key={speaker.id}
          id={speaker.id}
          position={speaker.position}
          focused={speaker.id === focusedSpeakerId}
          debate={isDebate}
        />
      ))}
      <OrbitControls enabled={controlsEnabled} enablePan={false} minDistance={4} maxDistance={7} />
    </Canvas>
  );
}

function FirstPersonRig({
  map,
  inputActionsRef,
  inputBindings,
  poseOverride,
  poseOverrideSignal,
  resetSignal,
  interactSignal,
  pointerLockRequestSignal,
  pointerLockSelector,
  onPoseChange,
  onSensorReport,
  onInteractRequest,
  onPointerLockChange
}: {
  map: WorldMapDef | undefined;
  inputActionsRef: MutableRefObject<InputActionState> | undefined;
  inputBindings: InputBindingMap | undefined;
  poseOverride: PlayerPose | undefined;
  poseOverrideSignal: number;
  resetSignal: number;
  interactSignal: number;
  pointerLockRequestSignal: number;
  pointerLockSelector: string | undefined;
  onPoseChange: ((pose: PlayerPose) => void) | undefined;
  onSensorReport: ((report: NaviInteractionSensorReport) => void) | undefined;
  onInteractRequest: ((request: FirstPersonInteractRequest) => void) | undefined;
  onPointerLockChange: ((status: PointerLockStatus) => void) | undefined;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<ComponentRef<typeof PointerLockControls>>(null);
  const keysRef = useRef(new Set<MovementAction>());
  const lastPoseRef = useRef<PlayerPose | undefined>(undefined);
  const lastSensorReportRef = useRef<NaviInteractionSensorReport | undefined>(undefined);
  const lastInputEventSequenceRef = useRef(0);
  const handledInteractSignalRef = useRef(interactSignal);
  const pendingInteractSignalRef = useRef<number | undefined>(undefined);
  const forward = useMemo(() => new ThreeVector3(), []);
  const right = useMemo(() => new ThreeVector3(), []);
  const movement = useMemo(() => new ThreeVector3(), []);
  const up = useMemo(() => new ThreeVector3(0, 1, 0), []);
  const keyboardActions = useMemo(() => createKeyboardActionLookup(inputBindings), [inputBindings]);
  const onPoseChangeRef = useLatest(onPoseChange);
  const onSensorReportRef = useLatest(onSensorReport);
  const onInteractRequestRef = useLatest(onInteractRequest);
  const onPointerLockChangeRef = useLatest(onPointerLockChange);
  const lockSelector = pointerLockSelector ?? "[data-r3f-pointer-lock-disabled='true']";

  const applyPose = useCallback(
    (pose: PlayerPose) => {
      const clamped = clampVectorToAabb(pose.position, map?.walkBounds);
      camera.position.set(clamped[0], clamped[1], clamped[2]);
      camera.rotation.set(pose.pitch, pose.yaw, 0, "YXZ");
      reportPose(camera, lastPoseRef, onPoseChangeRef, true);
      reportSensor(camera, map, lastSensorReportRef, onSensorReportRef, true);
    },
    [camera, map, onPoseChangeRef, onSensorReportRef]
  );

  useEffect(() => {
    onPointerLockChangeRef.current?.("idle");
  }, [onPointerLockChangeRef]);

  useEffect(() => {
    return () => {
      const controls = controlsRef.current;
      if (!controls?.isLocked) return;

      try {
        controls.unlock();
      } finally {
        onPointerLockChangeRef.current?.("unlocked");
      }
    };
  }, [onPointerLockChangeRef]);

  useEffect(() => {
    applyPose(getInitialPose(map));
  }, [applyPose, map?.id]);

  useEffect(() => {
    applyPose(getInitialPose(map));
  }, [applyPose, resetSignal]);

  useEffect(() => {
    if (poseOverrideSignal <= 0 || !poseOverride) return;
    applyPose(poseOverride);
  }, [applyPose, poseOverride, poseOverrideSignal]);

  useEffect(() => {
    if (pointerLockRequestSignal <= 0) return;

    onPointerLockChangeRef.current?.("requested");
    try {
      controlsRef.current?.lock();
      window.setTimeout(() => {
        if (!controlsRef.current?.isLocked) onPointerLockChangeRef.current?.("denied");
      }, 120);
    } catch {
      onPointerLockChangeRef.current?.("denied");
    }
  }, [onPointerLockChangeRef, pointerLockRequestSignal]);

  const requestInteraction = useCallback(() => {
    const facing = cameraFacing(camera);
    onInteractRequestRef.current?.({
      ...(map?.id ? { mapId: map.id } : {}),
      pose: cameraPose(camera),
      facing
    });
  }, [camera, map?.id, onInteractRequestRef]);

  useEffect(() => {
    if (interactSignal <= 0 || interactSignal === handledInteractSignalRef.current) return;
    pendingInteractSignalRef.current = interactSignal;
  }, [interactSignal]);

  useEffect(() => {
    if (inputActionsRef) {
      keysRef.current.clear();
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const action = keyboardActions.get(event.code);
      const movementAction = toMovementAction(action);
      if (movementAction) {
        keysRef.current.add(movementAction);
        event.preventDefault();
      }
      if (action === "interact") {
        requestInteraction();
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const movementAction = toMovementAction(keyboardActions.get(event.code));
      if (movementAction) {
        keysRef.current.delete(movementAction);
        event.preventDefault();
      }
    };
    const onBlur = () => keysRef.current.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [inputActionsRef, keyboardActions, requestInteraction]);

  useFrame((_, delta) => {
    consumeInputActionEvents(inputActionsRef?.current, lastInputEventSequenceRef, requestInteraction);

    if (pendingInteractSignalRef.current && pendingInteractSignalRef.current !== handledInteractSignalRef.current) {
      handledInteractSignalRef.current = pendingInteractSignalRef.current;
      pendingInteractSignalRef.current = undefined;
      requestInteraction();
    }

    if (!hasMovementInput(keysRef.current, inputActionsRef?.current)) {
      reportPose(camera, lastPoseRef, onPoseChangeRef);
      reportSensor(camera, map, lastSensorReportRef, onSensorReportRef);
      return;
    }

    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() <= 0.0001) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, up).normalize();

    movement.set(0, 0, 0);
    if (isMovementActionDown(keysRef.current, inputActionsRef?.current, "move-forward")) movement.add(forward);
    if (isMovementActionDown(keysRef.current, inputActionsRef?.current, "move-back")) movement.sub(forward);
    if (isMovementActionDown(keysRef.current, inputActionsRef?.current, "move-right")) movement.add(right);
    if (isMovementActionDown(keysRef.current, inputActionsRef?.current, "move-left")) movement.sub(right);

    if (movement.lengthSq() > 0) {
      movement.normalize().multiplyScalar(4 * delta);
      const nextPosition = clampVectorToAabb(
        [camera.position.x + movement.x, camera.position.y, camera.position.z + movement.z],
        map?.walkBounds
      );
      camera.position.set(nextPosition[0], nextPosition[1], nextPosition[2]);
    }

    reportPose(camera, lastPoseRef, onPoseChangeRef);
    reportSensor(camera, map, lastSensorReportRef, onSensorReportRef);
  });

  return (
    <PointerLockControls
      ref={controlsRef}
      selector={lockSelector}
      onLock={() => onPointerLockChangeRef.current?.("locked")}
      onUnlock={() => onPointerLockChangeRef.current?.("unlocked")}
      enabled
    />
  );
}

function MapAssetLayer({
  assetResolver,
  map,
  onAssetDiagnostic,
  onFallbackChange
}: {
  assetResolver: R3fAssetResolver | undefined;
  map: WorldMapDef | undefined;
  onAssetDiagnostic: ((diagnostic: R3fAssetDiagnostic) => void) | undefined;
  onFallbackChange: ((status: FirstPersonFallbackStatus) => void) | undefined;
}) {
  const resolved = useMemo(() => resolveMapModelAsset(map, assetResolver), [assetResolver, map]);

  useEffect(() => {
    if (resolved.diagnostic) onAssetDiagnostic?.(resolved.diagnostic);
  }, [onAssetDiagnostic, resolved]);

  if (resolved.fallbackReason === "no-model") {
    return <FallbackRoom map={map} reason="no-model" onFallbackChange={onFallbackChange} />;
  }

  if (!resolved.uri) {
    return (
      <FallbackRoom
        map={map}
        reason="asset-error"
        {...(resolved.assetId ? { assetUri: resolved.assetId } : {})}
        onFallbackChange={onFallbackChange}
      />
    );
  }

  return <ProbedMapAsset map={map} assetUri={resolved.uri} onFallbackChange={onFallbackChange} />;
}

export function resolveMapModelAsset(
  map: WorldMapDef | undefined,
  assetResolver: R3fAssetResolver | undefined
): R3fMapModelAssetResolution {
  const modelAsset = map?.assetRefs.find((asset) => asset.kind === "glb");
  if (!modelAsset) return { fallbackReason: "no-model" };

  if (!assetResolver) {
    return {
      assetId: modelAsset.id,
      fallbackReason: "asset-error",
      diagnostic: {
        source: "asset",
        code: "asset-resolver-missing",
        severity: "error",
        assetId: modelAsset.id,
        kind: "glb",
        message: `R3F map asset '${modelAsset.id}' could not be resolved because no AssetResolver was provided.`
      }
    };
  }

  const resolved = assetResolver.resolve({ id: modelAsset.id, kind: "glb" });
  if (resolved.uri) return { assetId: modelAsset.id, uri: resolved.uri };

  return {
    assetId: modelAsset.id,
    fallbackReason: "asset-error",
    diagnostic: {
      source: "asset",
      code: resolved.diagnostic?.code ?? "asset-missing",
      severity: resolved.diagnostic?.severity ?? "error",
      assetId: modelAsset.id,
      kind: "glb",
      message: resolved.diagnostic?.message ?? `R3F map asset '${modelAsset.id}' could not be resolved.`
    }
  };
}

function ProbedMapAsset({
  map,
  assetUri,
  onFallbackChange
}: {
  map: WorldMapDef | undefined;
  assetUri: string;
  onFallbackChange: ((status: FirstPersonFallbackStatus) => void) | undefined;
}) {
  const [status, setStatus] = useState<"checking" | "available" | "missing">("checking");

  useEffect(() => {
    let cancelled = false;

    setStatus("checking");
    onFallbackChange?.(createFallbackStatus(true, "loading", map?.id, assetUri));

    fetch(assetUri)
      .then((response) => {
        if (!cancelled) setStatus(response.ok ? "available" : "missing");
      })
      .catch(() => {
        if (!cancelled) setStatus("missing");
      });

    return () => {
      cancelled = true;
    };
  }, [assetUri, map?.id, onFallbackChange]);

  if (status !== "available") {
    return (
      <FallbackRoom
        map={map}
        reason={status === "checking" ? "loading" : "asset-error"}
        assetUri={assetUri}
        onFallbackChange={onFallbackChange}
      />
    );
  }

  return (
    <ModelErrorBoundary
      key={`${map?.id ?? "map:missing"}:${assetUri}`}
      fallback={<FallbackRoom map={map} reason="asset-error" assetUri={assetUri} onFallbackChange={onFallbackChange} />}
      onError={() => {
        onFallbackChange?.(createFallbackStatus(true, "asset-error", map?.id, assetUri));
      }}
    >
      <Suspense fallback={<FallbackRoom map={map} reason="loading" assetUri={assetUri} onFallbackChange={onFallbackChange} />}>
        <GltfMapModel uri={assetUri} mapId={map?.id} onFallbackChange={onFallbackChange} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

function GltfMapModel({
  uri,
  mapId,
  onFallbackChange
}: {
  uri: string;
  mapId: string | undefined;
  onFallbackChange: ((status: FirstPersonFallbackStatus) => void) | undefined;
}) {
  const gltf = useGLTF(uri) as { scene: Object3D };

  useEffect(() => {
    onFallbackChange?.(createFallbackStatus(false, "loaded", mapId, uri));
  }, [mapId, onFallbackChange, uri]);

  return <primitive object={gltf.scene} />;
}

class ModelErrorBoundary extends Component<
  {
    children: ReactNode;
    fallback: ReactNode;
    onError: () => void;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return this.props.fallback;

    return this.props.children;
  }
}

function FallbackRoom({
  map,
  reason,
  assetUri,
  onFallbackChange
}: {
  map: WorldMapDef | undefined;
  reason: FirstPersonFallbackStatus["reason"];
  assetUri?: string;
  onFallbackChange: ((status: FirstPersonFallbackStatus) => void) | undefined;
}) {
  const bounds = map?.walkBounds;
  const min = bounds?.min ?? ([-4, 0, -4] as Vector3);
  const max = bounds?.max ?? ([4, 2.8, 4] as Vector3);
  const width = Math.max(1, max[0] - min[0]);
  const depth = Math.max(1, max[2] - min[2]);
  const centerX = (min[0] + max[0]) / 2;
  const centerZ = (min[2] + max[2]) / 2;
  const wallHeight = Math.max(2.6, max[1] - min[1]);

  useEffect(() => {
    onFallbackChange?.(createFallbackStatus(true, reason, map?.id, assetUri));
  }, [assetUri, map?.id, onFallbackChange, reason]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, min[1], centerZ]}>
        <planeGeometry args={[width, depth, 8, 8]} />
        <meshStandardMaterial color="#1b2633" roughness={0.8} />
      </mesh>
      <mesh position={[centerX, min[1] + wallHeight / 2, min[2]]}>
        <boxGeometry args={[width, wallHeight, 0.15]} />
        <meshStandardMaterial color="#2a3447" />
      </mesh>
      <mesh position={[min[0], min[1] + wallHeight / 2, centerZ]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[depth, wallHeight, 0.15]} />
        <meshStandardMaterial color="#243146" />
      </mesh>
      <mesh position={[max[0], min[1] + wallHeight / 2, centerZ]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[depth, wallHeight, 0.15]} />
        <meshStandardMaterial color="#243146" />
      </mesh>
      <Html center distanceFactor={8} position={[centerX, min[1] + 1.8, centerZ]} style={{ pointerEvents: "none" }}>
        <span className="scene-label">Primitive fallback: {map?.name ?? "missing map"}</span>
      </Html>
    </group>
  );
}

function Hotspot({
  position,
  label,
  active
}: {
  position: [number, number, number];
  label: string;
  active: boolean;
}) {
  const mesh = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (mesh.current) mesh.current.rotation.y += delta;
  });

  return (
    <group position={position}>
      <mesh ref={mesh} position={[0, 0.45, 0]}>
        <octahedronGeometry args={[0.28]} />
        <meshStandardMaterial color={active ? "#ff5c8a" : "#6ee7d8"} emissive={active ? "#8a123a" : "#0f5f58"} />
      </mesh>
      <Html center distanceFactor={8} position={[0, 0.95, 0]} style={{ pointerEvents: "none" }}>
        <span className="scene-label">{label}</span>
      </Html>
    </group>
  );
}

function getInitialPose(map: WorldMapDef | undefined): PlayerPose {
  const position = map?.cameraRig?.position ?? map?.spawn ?? ([0, 1.7, 4] as Vector3);

  return {
    position: clampVectorToAabb(position, map?.walkBounds),
    yaw: 0,
    pitch: 0
  };
}

function cameraPose(camera: Camera): PlayerPose {
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    yaw: camera.rotation.y,
    pitch: camera.rotation.x
  };
}

function cameraFacing(camera: Camera): Vector3 {
  const facing = new ThreeVector3();
  camera.getWorldDirection(facing);
  return [facing.x, facing.y, facing.z];
}

function reportPose(
  camera: Camera,
  lastPoseRef: MutableRefObject<PlayerPose | undefined>,
  onPoseChangeRef: MutableRefObject<((pose: PlayerPose) => void) | undefined>,
  force = false
) {
  const pose = cameraPose(camera);

  if (!force && lastPoseRef.current && poseDistance(lastPoseRef.current, pose) < POSE_REPORT_EPSILON) return;

  lastPoseRef.current = pose;
  onPoseChangeRef.current?.(pose);
}

function reportSensor(
  camera: Camera,
  map: WorldMapDef | undefined,
  lastSensorReportRef: MutableRefObject<NaviInteractionSensorReport | undefined>,
  onSensorReportRef: MutableRefObject<((report: NaviInteractionSensorReport) => void) | undefined>,
  force = false
) {
  const report = createSensorReport(camera, map);
  if (!report) return;

  if (
    !force &&
    lastSensorReportRef.current &&
    sensorReportDistance(lastSensorReportRef.current, report) < POSE_REPORT_EPSILON
  ) {
    return;
  }

  lastSensorReportRef.current = report;
  onSensorReportRef.current?.(report);
}

function createSensorReport(camera: Camera, map: WorldMapDef | undefined): NaviInteractionSensorReport | undefined {
  if (!map?.id) return undefined;
  return {
    mapId: map.id,
    pose: cameraPose(camera),
    facing: cameraFacing(camera)
  };
}

function poseDistance(previous: PlayerPose, next: PlayerPose): number {
  return Math.max(
    Math.abs(previous.position[0] - next.position[0]),
    Math.abs(previous.position[1] - next.position[1]),
    Math.abs(previous.position[2] - next.position[2]),
    Math.abs(previous.yaw - next.yaw),
    Math.abs(previous.pitch - next.pitch)
  );
}

function sensorReportDistance(previous: NaviInteractionSensorReport, next: NaviInteractionSensorReport): number {
  return Math.max(poseDistance(previous.pose, next.pose), vectorDistance(previous.facing, next.facing));
}

function vectorDistance(previous: Vector3 | undefined, next: Vector3 | undefined): number {
  if (!previous && !next) return 0;
  if (!previous || !next) return Infinity;
  return Math.max(
    Math.abs(previous[0] - next[0]),
    Math.abs(previous[1] - next[1]),
    Math.abs(previous[2] - next[2])
  );
}

function consumeInputActionEvents(
  inputState: InputActionState | undefined,
  lastInputEventSequenceRef: MutableRefObject<number>,
  requestInteraction: () => void
) {
  if (!inputState) return;

  let lastSequence = lastInputEventSequenceRef.current;
  for (const event of inputState.events) {
    if (event.sequence <= lastInputEventSequenceRef.current) continue;
    lastSequence = Math.max(lastSequence, event.sequence);
    if (event.phase === "pressed" && event.action === "interact") requestInteraction();
  }
  lastInputEventSequenceRef.current = lastSequence;
}

function hasMovementInput(keys: ReadonlySet<MovementAction>, inputState: InputActionState | undefined): boolean {
  return (
    isMovementActionDown(keys, inputState, "move-forward") ||
    isMovementActionDown(keys, inputState, "move-back") ||
    isMovementActionDown(keys, inputState, "move-left") ||
    isMovementActionDown(keys, inputState, "move-right")
  );
}

function isMovementActionDown(
  keys: ReadonlySet<MovementAction>,
  inputState: InputActionState | undefined,
  action: MovementAction
): boolean {
  return inputState ? inputState.down.includes(action) : keys.has(action);
}

function createKeyboardActionLookup(inputBindings: InputBindingMap | undefined): Map<string, InputAction> {
  const lookup = new Map<string, InputAction>();
  const bindings = inputBindings ?? DEFAULT_NAV_INPUT_BINDINGS;
  for (const binding of bindings.bindings) {
    if (binding.device !== "keyboard") continue;
    if (binding.context !== "navi" && binding.context !== "global") continue;
    lookup.set(binding.code, binding.action);
  }
  return lookup;
}

function toMovementAction(action: InputAction | undefined): MovementAction | undefined {
  if (action === "move-forward" || action === "move-back" || action === "move-left" || action === "move-right") {
    return action;
  }
  return undefined;
}

function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function createFallbackStatus(
  active: boolean,
  reason: FirstPersonFallbackStatus["reason"],
  mapId: string | undefined,
  assetUri: string | undefined
): FirstPersonFallbackStatus {
  return {
    active,
    reason,
    ...(mapId ? { mapId } : {}),
    ...(assetUri ? { assetUri } : {})
  };
}

function BillboardCharacter({
  id,
  position,
  focused,
  debate
}: {
  id: string;
  position: [number, number, number];
  focused: boolean;
  debate: boolean;
}) {
  return (
    <group position={position}>
      <mesh>
        <planeGeometry args={debate ? [0.85, 1.45] : [0.95, 1.6]} />
        <meshStandardMaterial color={focused ? "#ffcf73" : debate ? "#8fd8ff" : "#b9fbc0"} emissive={focused ? "#3c2205" : debate ? "#08283d" : "#0f3d24"} />
      </mesh>
      <Html center distanceFactor={6} position={[0, -0.95, 0]} style={{ pointerEvents: "none" }}>
        <span className={focused ? "scene-label scene-label-focus" : "scene-label"}>{id.replace("character:", "")}</span>
      </Html>
    </group>
  );
}
