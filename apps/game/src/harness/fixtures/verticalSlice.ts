import type { EvidenceDef, ItemDef, WorldMapDef } from "@v-ronpa/contracts";

export const verticalSliceItem: ItemDef = {
  id: "tool:notebook",
  name: "Investigation Notebook",
  category: "tool",
  description: "A developer-harness notebook used to prove Navi item pickup.",
  tags: ["harness", "vertical-slice"]
};

export const verticalSliceEvidence: EvidenceDef = {
  id: "evidence:keycard",
  name: "Redacted Keycard",
  shortLabel: "Keycard",
  description: "A placeholder evidence object shown in Inspector Lite during the vertical slice.",
  details: [],
  visual: {
    thumbnailAssetId: "texture:evidence:keycard-thumbnail",
    iconAssetId: "texture:evidence:keycard-thumbnail",
    accentColor: "#ffd166"
  },
  tags: ["harness", "vertical-slice"]
};

export const verticalSliceMaps: WorldMapDef[] = [
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
    assetRefs: [
      { id: "model:academy-hall", kind: "glb", uri: "/harness/models/academy-hall.gltf", tags: ["harness"] }
    ],
    interactables: [
      {
        id: "interactable:notebook",
        label: "Notebook",
        position: [1.2, 0.9, -0.8],
        radius: 1.1,
        action: { type: "grant-item", itemId: verticalSliceItem.id, quantity: 1 }
      },
      {
        id: "interactable:keycard",
        label: "Keycard",
        position: [2, 0.9, -1.7],
        radius: 1.1,
        action: { type: "grant-evidence", evidenceId: verticalSliceEvidence.id }
      },
      {
        id: "interactable:witness",
        label: "Witness",
        position: [-1.7, 0.9, -1.5],
        radius: 1.2,
        action: { type: "start-script", script: "harness/vertical-slice.nani", label: "Start" }
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
    assetRefs: [
      { id: "model:classroom", kind: "glb", uri: "/harness/models/classroom.gltf", tags: ["harness"] }
    ],
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

export const verticalSliceScript = `#Start
@back bg:harness effect:fade
@charEnter character:felix portrait:portrait:felix:neutral slot:center
Felix: This is the first playable slice. Move, inspect, then choose a route.[>]
@choice "Return to the hallway" goto:#Return
@choice "Follow the witness into class" goto:#Classroom

#Return
@set route:"return"
Felix: Good. We stay here and keep the exploration state readable.
@end

#Classroom
@set route:"classroom"
@gameplay grant-evidence id:evidence:keycard
Mira: Then the keycard matters after all.
@end`;
