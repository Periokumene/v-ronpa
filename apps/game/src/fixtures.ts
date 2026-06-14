import type { TrialDefinition, WorldMapDef } from "@v-ronpa/contracts";

export const harnessMap: WorldMapDef = {
  id: "map:academy-hall",
  name: "Academy Hall",
  spawn: [0, 1.7, 4],
  cameraRig: {
    id: "camera:navi:first-person",
    mode: "first-person",
    position: [0, 1.7, 4],
    fov: 65
  },
  collisionProxyIds: ["collision:academy-hall"],
  assetRefs: [],
  interactables: [
    {
      id: "interactable:case-file",
      label: "Case File",
      position: [1.2, 0.2, -0.8],
      radius: 1.2,
      action: { type: "grant-evidence", evidenceId: "evidence:keycard" }
    },
    {
      id: "interactable:witness",
      label: "Witness",
      position: [-1.5, 0.2, -1.4],
      radius: 1.2,
      action: { type: "start-script", script: "opening.nani", label: "Start" }
    }
  ]
};

export const harnessTrial: TrialDefinition = {
  id: "trial:case-01",
  title: "The Locked Door",
  initialSegmentId: "discussion:opening",
  segments: [
    {
      kind: "discussion",
      id: "discussion:opening",
      presentation: "vn3d",
      script: "trial/case-01.nani#Opening",
      nextSegmentId: "debate:door"
    },
    {
      kind: "debate",
      id: "debate:door",
      presentation: "debate3d",
      script: "trial/case-01.nani#Door",
      timeLimitMs: 60000,
      truthBullets: [{ evidenceId: "evidence:keycard", label: "Keycard" }],
      keywords: [
        {
          id: "kw:locked",
          text: "the door was locked",
          correctEvidenceId: "evidence:keycard",
          speakerId: "character:felix"
        }
      ],
      onCorrect: "evidence-submit:keycard",
      onMiss: "debate:door",
      onTimeout: "discussion:failure"
    },
    {
      kind: "evidence-submit",
      id: "evidence-submit:keycard",
      presentation: "vn2d",
      prompt: "Submit the proof that opens the locked door.",
      acceptedEvidenceIds: ["evidence:keycard"],
      onAccepted: "discussion:after-door",
      onRejected: "discussion:failure"
    }
  ]
};

export const harnessScript = `#Start
@back bg:harness effect:fade
@charEnter character:felix portrait:portrait:felix:neutral slot:center
Felix: This room is a contract harness, not a final scene.[>]
@trialKeyword kw:locked text:"the door was locked" speaker:character:felix
@choice "Object with the keycard" goto:#Object
@choice "Inspect inventory" goto:#Inventory

#Object
@set route:objected
@shake character:felix intensity:0.5 duration:300
Felix: Good. The statement is now breakable.
@goto #End

#Inventory
@set route:inventory
Narrator: Inventory and evidence are DOM-first surfaces.

#End
@end`;
