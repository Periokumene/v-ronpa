import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useMemo, useRef } from "react";
import type { Mesh } from "three";
import type { CameraControlMode, InputLockState, TrialPresentationProfile, WorldMapDef } from "@v-ronpa/contracts";

export interface ExplorationStageProps {
  map?: WorldMapDef;
  activeInteractableId?: string;
  cameraMode?: CameraControlMode;
  inputLock?: InputLockState;
}

export interface TrialRoundTableStageProps {
  speakers?: string[];
  focusedSpeakerId?: string;
  presentationProfile?: TrialPresentationProfile;
  cameraMode?: CameraControlMode;
  inputLock?: InputLockState;
}

export function ExplorationStage3D({
  map,
  activeInteractableId,
  cameraMode = "orbit-debug",
  inputLock = "none"
}: ExplorationStageProps) {
  const controlsEnabled = inputLock === "none" && cameraMode !== "locked" && cameraMode !== "scripted-focus";
  return (
    <Canvas camera={{ position: [0, 2.2, 5.5], fov: 60 }} data-testid="r3f-canvas">
      <color attach="background" args={["#111720"]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 3]} intensity={1.6} />
      <GridRoom />
      {(map?.interactables ?? []).map((interactable) => (
        <Hotspot
          key={interactable.id}
          label={interactable.label}
          position={interactable.position}
          active={interactable.id === activeInteractableId}
        />
      ))}
      <OrbitControls
        enabled={controlsEnabled}
        enablePan={false}
        maxPolarAngle={Math.PI * 0.48}
        minDistance={3}
        maxDistance={8}
      />
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

function GridRoom() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[8, 8, 8, 8]} />
        <meshStandardMaterial color="#1b2633" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.5, -3.8]}>
        <boxGeometry args={[8, 3, 0.15]} />
        <meshStandardMaterial color="#2a3447" />
      </mesh>
      <mesh position={[-3.8, 1.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[8, 3, 0.15]} />
        <meshStandardMaterial color="#243146" />
      </mesh>
      <mesh position={[3.8, 1.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[8, 3, 0.15]} />
        <meshStandardMaterial color="#243146" />
      </mesh>
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
