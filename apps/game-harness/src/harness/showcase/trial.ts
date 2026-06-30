import type { TrialDefinition } from "@v-ronpa/contracts";
import { harnessShowcaseEvidence } from "./items";

export const harnessShowcaseTrial: TrialDefinition = {
  id: "trial:door-lock",
  title: "Door Lock Trial",
  initialSegmentId: "discussion:trial-opening",
  segments: [
    {
      kind: "discussion",
      id: "discussion:trial-opening",
      presentation: "vn3d",
      script: "harness/harness-showcase-trial.nani#Opening",
      nextSegmentId: "debate:door-lock"
    },
    {
      kind: "debate",
      id: "debate:door-lock",
      script: "harness/harness-showcase-trial.nani#DoorLock",
      truthBullets: [{ evidenceId: harnessShowcaseEvidence.id, label: harnessShowcaseEvidence.shortLabel }],
      keywords: [
        {
          id: "kw:door-lock",
          text: "门锁声只是普通故障",
          correctEvidenceId: harnessShowcaseEvidence.id,
          speakerId: "character:ren"
        }
      ],
      onCorrect: "discussion:trial-close",
      onMiss: "debate:door-lock",
      onTimeout: "discussion:trial-close"
    },
    {
      kind: "discussion",
      id: "discussion:trial-close",
      presentation: "vn2d",
      script: "harness/harness-showcase-trial.nani#Close"
    }
  ]
};
