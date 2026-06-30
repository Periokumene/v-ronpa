import type { WorldMapDef } from "@v-ronpa/contracts";
import { harnessShowcaseEvidence, harnessShowcaseItem } from "./items";
import { harnessShowcaseTrial } from "./trial";

export const harnessShowcaseMaps: WorldMapDef[] = [
  {
    id: "map:academy-hall",
    name: "Academy Hall",
    spawn: [0, 1.7, 4],
    walkBounds: {
      min: [-3.6, 0, -4.2],
      max: [3.6, 2.6, 4.2]
    },
    cameraRig: {
      id: "camera:navi:first-person",
      mode: "first-person",
      position: [0, 1.7, 4],
      fov: 65
    },
    collisionProxyIds: ["collision:academy-hall:aabb"],
    assetRefs: [{ id: "model:academy-hall", kind: "glb", tags: ["harness"] }],
    interactables: [
      {
        id: "interactable:notebook",
        label: "Notebook",
        position: [1.2, 0.9, -0.8],
        radius: 1.1,
        action: { type: "grant-item", itemId: harnessShowcaseItem.id, quantity: 1 }
      },
      {
        id: "interactable:keycard",
        label: "Keycard",
        position: [2, 0.9, -1.7],
        radius: 1.1,
        action: { type: "grant-evidence", evidenceId: harnessShowcaseEvidence.id }
      },
      {
        id: "interactable:witness",
        label: "Witness",
        position: [-1.7, 0.9, -1.5],
        radius: 1.2,
        action: { type: "start-script", script: "harness/harness-showcase.nani", label: "Start" }
      },
      {
        id: "interactable:trial-stand",
        label: "Trial Stand",
        position: [-2.7, 0.9, 1.2],
        radius: 1.2,
        action: { type: "start-trial", trialId: harnessShowcaseTrial.id, segmentId: "debate:door-lock" }
      },
      {
        id: "interactable:classroom-door",
        label: "Classroom Door",
        position: [0, 1, -3.7],
        radius: 1.2,
        action: {
          type: "change-map",
          mapId: "map:classroom",
          pose: { position: [0, 1.7, 3.2], yaw: 3.14, pitch: 0 }
        }
      }
    ]
  },
  {
    id: "map:classroom",
    name: "Classroom",
    spawn: [0, 1.7, 3.2],
    walkBounds: {
      min: [-3.2, 0, -3.4],
      max: [3.2, 2.6, 3.6]
    },
    cameraRig: {
      id: "camera:navi:classroom",
      mode: "first-person",
      position: [0, 1.7, 3.2],
      fov: 65
    },
    collisionProxyIds: ["collision:classroom:aabb"],
    assetRefs: [{ id: "model:classroom", kind: "glb", tags: ["harness"] }],
    interactables: [
      {
        id: "interactable:hall-door",
        label: "Hall Door",
        position: [0, 1, 3.1],
        radius: 1.2,
        action: {
          type: "change-map",
          mapId: "map:academy-hall",
          pose: { position: [0, 1.7, -3.1], yaw: 0, pitch: 0 }
        }
      }
    ]
  }
];
