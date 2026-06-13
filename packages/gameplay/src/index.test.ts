import { describe, expect, it } from "vitest";
import type { TrialDefinition, WorldMapDef } from "@v-ronpa/contracts";
import {
  changeCharacterAffinity,
  createGameplayState,
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
          action: { type: "grant-item", itemId: "evidence:keycard", quantity: 1 }
        }
      ],
      assetRefs: []
    };

    const outcome = resolveInteractable(nearestInteractable(map, [1.2, 0, 0]));
    expect(outcome).toEqual({ type: "grant-item", itemId: "evidence:keycard", quantity: 1 });
  });

  it("updates inventory, evidence, and character state", () => {
    let state = createGameplayState();
    state = grantItem(state, "evidence:keycard");
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
          "availableEvidenceIds": [
            "evidence:keycard",
          ],
          "submittedEvidenceIds": [],
        },
        "inventory": {
          "items": {
            "evidence:keycard": 1,
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
      keywordId: "kw:locked",
      nextSegmentId: "discussion:after"
    });
    expect(resolveTrialTimeout(trial, "debate:door")).toEqual({
      type: "timeout",
      nextSegmentId: "discussion:fail"
    });
  });
});
