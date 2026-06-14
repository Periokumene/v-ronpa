import { describe, expect, it } from "vitest";
import type { TrialDefinition, WorldMapDef } from "@v-ronpa/contracts";
import {
  changeCharacterAffinity,
  createGameplayState,
  grantEvidence,
  grantItem,
  nearestInteractable,
  resolveDebateKeyword,
  resolveInteractable,
  resolveTrialTimeout
} from "./index";

describe("gameplay domain", () => {
  it("resolves exploration interactions without renderer state", () => {
    const map: WorldMapDef = {
      id: "map:hall",
      name: "Hall",
      spawn: [0, 0, 0],
      collisionProxyIds: [],
      interactables: [
        {
          id: "i:file",
          label: "Case File",
          position: [1, 0, 0],
          radius: 1.5,
          action: { type: "grant-evidence", evidenceId: "evidence:keycard" }
        }
      ],
      assetRefs: []
    };

    const outcome = resolveInteractable(nearestInteractable(map, [1.2, 0, 0]));
    expect(outcome).toEqual({ type: "grant-evidence", evidenceId: "evidence:keycard" });
  });

  it("updates inventory, evidence, and character state", () => {
    let state = createGameplayState();
    state = grantItem(state, "gift:coffee");
    state = grantEvidence(state, "evidence:keycard");
    state = changeCharacterAffinity(state, "character:felix", 12);

    expect(state).toMatchInlineSnapshot(`
      {
        "characters": {
          "character:felix": {
            "affinity": 12,
            "characterId": "character:felix",
            "statuses": [],
            "unlockedSkills": [],
          },
        },
        "evidence": {
          "ownedEvidenceIds": [
            "evidence:keycard",
          ],
          "submittedEvidenceIds": [],
        },
        "inventory": {
          "items": {
            "gift:coffee": 1,
          },
        },
      }
    `);
  });

  it("resolves trial keyword outcomes", () => {
    const trial: TrialDefinition = {
      id: "trial:case-01",
      title: "Case 01",
      initialSegmentId: "debate:door",
      segments: [
        {
          kind: "debate",
          id: "debate:door",
          script: "case-01.nani#Door",
          truthBullets: [{ evidenceId: "evidence:keycard", label: "Keycard" }],
          keywords: [{ id: "kw:locked", text: "locked", correctEvidenceId: "evidence:keycard" }],
          onCorrect: "discussion:after",
          onMiss: "debate:door",
          onTimeout: "discussion:fail"
        }
      ]
    };

    expect(resolveDebateKeyword(trial, "debate:door", "kw:locked", "evidence:keycard")).toEqual({
      type: "correct",
      keywordId: "kw:locked"
    });
    expect(resolveTrialTimeout(trial, "debate:door")).toEqual({
      type: "timeout"
    });
  });
});
