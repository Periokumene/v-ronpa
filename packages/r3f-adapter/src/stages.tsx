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
  InputLockState,
  PlayerPose,
  TrialPresentationProfile,
  Vector3,
  WorldMapDef
} from "@v-ronpa/contracts";
import { clampVectorToAabb, findInteractableCandidate } from "./first-person";

export interface ExplorationStageProps {
  map?: WorldMapDef;
  candidateInteractableId?: string;
  cameraMode?: CameraControlMode;
  inputLock?: InputLockState;
  resetSignal?: number;
  interactSignal?: number;
  pointerLockRequestSignal?: number;
  pointerLockSelector?: string;
  onPoseChange?: (pose: PlayerPose) => void;
  onCandidateChange?: (candidateId: string | undefined) => void;
  onInteractRequest?: (request: FirstPersonInteractRequest) => void;
  onFallbackChange?: (status: FirstPersonFallbackStatus) => void;
  onPointerLockChange?: (status: PointerLockStatus) => void;
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
  candidateId?: string;
  pose: PlayerPose;
}

export function ExplorationStage3D({
  map,
  candidateInteractableId,
  cameraMode = "orbit-debug",
  inputLock = "none",
  resetSignal = 0,
  interactSignal = 0,
  pointerLockRequestSignal = 0,
  pointerLockSelector,
  onPoseChange,
  onCandidateChange,
  onInteractRequest,
  onFallbackChange,
  onPointerLockChange
}: ExplorationStageProps) {
  const controlsEnabled = inputLock === "none" && cameraMode !== "locked" && cameraMode !== "scripted-focus";
  const firstPersonEnabled = cameraMode === "first-person" && inputLock === "none";
  const initialPose = getInitialPose(map);
  const camera = { position: initialPose.position, fov: map?.cameraRig?.fov ?? 60 };

  return (
    <Canvas camera={camera} data-testid="r3f-canvas">
      <color attach="background" args={["#111720"]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 3]} intensity={1.6} />
      <MapAssetLayer map={map} onFallbackChange={onFallbackChange} />
      {(map?.interactables ?? []).map((interactable) => (
        <Hotspot
          key={interactable.id}
          label={interactable.label}
          position={interactable.position}
          active={interactable.id === candidateInteractableId}
        />
      ))}
      {firstPersonEnabled ? (
        <FirstPersonRig
          map={map}
          resetSignal={resetSignal}
          interactSignal={interactSignal}
          pointerLockRequestSignal={pointerLockRequestSignal}
          pointerLockSelector={pointerLockSelector}
          onPoseChange={onPoseChange}
          onCandidateChange={onCandidateChange}
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
  resetSignal,
  interactSignal,
  pointerLockRequestSignal,
  pointerLockSelector,
  onPoseChange,
  onCandidateChange,
  onInteractRequest,
  onPointerLockChange
}: {
  map: WorldMapDef | undefined;
  resetSignal: number;
  interactSignal: number;
  pointerLockRequestSignal: number;
  pointerLockSelector: string | undefined;
  onPoseChange: ((pose: PlayerPose) => void) | undefined;
  onCandidateChange: ((candidateId: string | undefined) => void) | undefined;
  onInteractRequest: ((request: FirstPersonInteractRequest) => void) | undefined;
  onPointerLockChange: ((status: PointerLockStatus) => void) | undefined;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<ComponentRef<typeof PointerLockControls>>(null);
  const keysRef = useRef(new Set<string>());
  const candidateRef = useRef<string | undefined>(undefined);
  const lastPoseRef = useRef<PlayerPose | undefined>(undefined);
  const lastCandidateIdRef = useRef<string | undefined>(undefined);
  const handledInteractSignalRef = useRef(interactSignal);
  const pendingInteractSignalRef = useRef<number | undefined>(undefined);
  const forward = useMemo(() => new ThreeVector3(), []);
  const right = useMemo(() => new ThreeVector3(), []);
  const movement = useMemo(() => new ThreeVector3(), []);
  const up = useMemo(() => new ThreeVector3(0, 1, 0), []);
  const lockSelector = pointerLockSelector ?? "[data-r3f-pointer-lock-disabled='true']";

  const applyPose = useCallback(
    (pose: PlayerPose) => {
      const clamped = clampVectorToAabb(pose.position, map?.walkBounds);
      camera.position.set(clamped[0], clamped[1], clamped[2]);
      camera.rotation.set(pose.pitch, pose.yaw, 0, "YXZ");
      reportPose(camera, lastPoseRef, onPoseChange);
      updateCandidate(camera, map, candidateRef, lastCandidateIdRef, onCandidateChange);
    },
    [camera, map, onCandidateChange, onPoseChange]
  );

  useEffect(() => {
    onPointerLockChange?.("idle");
  }, [onPointerLockChange]);

  useEffect(() => {
    applyPose(getInitialPose(map));
  }, [applyPose, map?.id]);

  useEffect(() => {
    applyPose(getInitialPose(map));
  }, [applyPose, resetSignal]);

  useEffect(() => {
    if (pointerLockRequestSignal <= 0) return;

    onPointerLockChange?.("requested");
    try {
      controlsRef.current?.lock();
      window.setTimeout(() => {
        if (!controlsRef.current?.isLocked) onPointerLockChange?.("denied");
      }, 120);
    } catch {
      onPointerLockChange?.("denied");
    }
  }, [onPointerLockChange, pointerLockRequestSignal]);

  const requestInteraction = useCallback(() => {
    onInteractRequest?.({
      ...(candidateRef.current ? { candidateId: candidateRef.current } : {}),
      pose: cameraPose(camera)
    });
  }, [camera, onInteractRequest]);

  useEffect(() => {
    if (interactSignal <= 0 || interactSignal === handledInteractSignalRef.current) return;
    pendingInteractSignalRef.current = interactSignal;
  }, [interactSignal]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (isMovementKey(event.code)) {
        keysRef.current.add(event.code);
        event.preventDefault();
      }
      if (event.code === "KeyE") {
        requestInteraction();
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (isMovementKey(event.code)) {
        keysRef.current.delete(event.code);
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
  }, [requestInteraction]);

  useFrame((_, delta) => {
    updateCandidate(camera, map, candidateRef, lastCandidateIdRef, onCandidateChange);

    if (pendingInteractSignalRef.current && pendingInteractSignalRef.current !== handledInteractSignalRef.current) {
      handledInteractSignalRef.current = pendingInteractSignalRef.current;
      pendingInteractSignalRef.current = undefined;
      requestInteraction();
    }

    if (keysRef.current.size === 0) {
      reportPose(camera, lastPoseRef, onPoseChange);
      return;
    }

    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() <= 0.0001) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, up).normalize();

    movement.set(0, 0, 0);
    if (keysRef.current.has("KeyW")) movement.add(forward);
    if (keysRef.current.has("KeyS")) movement.sub(forward);
    if (keysRef.current.has("KeyD")) movement.add(right);
    if (keysRef.current.has("KeyA")) movement.sub(right);

    if (movement.lengthSq() > 0) {
      movement.normalize().multiplyScalar(4 * delta);
      const nextPosition = clampVectorToAabb(
        [camera.position.x + movement.x, camera.position.y, camera.position.z + movement.z],
        map?.walkBounds
      );
      camera.position.set(nextPosition[0], nextPosition[1], nextPosition[2]);
    }

    reportPose(camera, lastPoseRef, onPoseChange);
    updateCandidate(camera, map, candidateRef, lastCandidateIdRef, onCandidateChange);
  });

  return (
    <PointerLockControls
      ref={controlsRef}
      selector={lockSelector}
      onLock={() => onPointerLockChange?.("locked")}
      onUnlock={() => onPointerLockChange?.("unlocked")}
      enabled
    />
  );
}

function MapAssetLayer({
  map,
  onFallbackChange
}: {
  map: WorldMapDef | undefined;
  onFallbackChange: ((status: FirstPersonFallbackStatus) => void) | undefined;
}) {
  const modelAsset = map?.assetRefs.find((asset) => asset.kind === "glb" && asset.uri.length > 0);

  if (!modelAsset) {
    return <FallbackRoom map={map} reason="no-model" onFallbackChange={onFallbackChange} />;
  }

  return <ProbedMapAsset map={map} assetUri={modelAsset.uri} onFallbackChange={onFallbackChange} />;
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
      <Html center distanceFactor={8} position={[centerX, min[1] + 1.8, centerZ]}>
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
      <Html center distanceFactor={8} position={[0, 0.95, 0]}>
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

function updateCandidate(
  camera: Camera,
  map: WorldMapDef | undefined,
  candidateRef: MutableRefObject<string | undefined>,
  lastCandidateIdRef: MutableRefObject<string | undefined>,
  onCandidateChange: ((candidateId: string | undefined) => void) | undefined
) {
  const facing = new ThreeVector3();
  camera.getWorldDirection(facing);
  const candidate = findInteractableCandidate({
    position: [camera.position.x, camera.position.y, camera.position.z],
    facing: [facing.x, facing.y, facing.z],
    interactables: map?.interactables ?? []
  });

  candidateRef.current = candidate?.id;
  if (candidate?.id !== lastCandidateIdRef.current) {
    lastCandidateIdRef.current = candidate?.id;
    onCandidateChange?.(candidate?.id);
  }
}

function cameraPose(camera: Camera): PlayerPose {
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    yaw: camera.rotation.y,
    pitch: camera.rotation.x
  };
}

function reportPose(
  camera: Camera,
  lastPoseRef: MutableRefObject<PlayerPose | undefined>,
  onPoseChange: ((pose: PlayerPose) => void) | undefined
) {
  const pose = cameraPose(camera);

  if (lastPoseRef.current && poseDistance(lastPoseRef.current, pose) < 0.01) return;

  lastPoseRef.current = pose;
  onPoseChange?.(pose);
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

function isMovementKey(code: string): boolean {
  return code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD";
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
      <Html center distanceFactor={6} position={[0, -0.95, 0]}>
        <span className={focused ? "scene-label scene-label-focus" : "scene-label"}>{id.replace("character:", "")}</span>
      </Html>
    </group>
  );
}
