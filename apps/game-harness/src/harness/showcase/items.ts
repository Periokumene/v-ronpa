import type { EvidenceDef, ItemDef } from "@v-ronpa/contracts";

export const harnessShowcaseItem: ItemDef = {
  id: "tool:notebook",
  name: "Investigation Notebook",
  category: "tool",
  description: "A developer-harness notebook used to prove Navi item pickup.",
  tags: ["harness", "harness-showcase"]
};

export const harnessShowcaseEvidence: EvidenceDef = {
  id: "evidence:keycard",
  name: "Redacted Keycard",
  shortLabel: "Keycard",
  description: "A placeholder evidence object shown in Inspector Lite during the harness showcase.",
  details: [],
  visual: {
    thumbnailAssetId: "texture:evidence:keycard-thumbnail",
    iconAssetId: "texture:evidence:keycard-thumbnail",
    accentColor: "#ffd166"
  },
  tags: ["harness", "harness-showcase"]
};
