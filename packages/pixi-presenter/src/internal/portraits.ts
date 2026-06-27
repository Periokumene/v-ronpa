export type PortraitSlot = "left" | "center" | "right";

export interface PortraitLayout {
  slot: PortraitSlot;
  x: number;
  y: number;
  maxWidth: number;
  maxHeight: number;
}

export function calculatePortraitLayout(width: number, height: number, slot: PortraitSlot): PortraitLayout {
  const safeWidth = Math.max(320, width);
  const safeHeight = Math.max(240, height);
  const slotRatios: Record<PortraitSlot, number> = {
    left: 0.24,
    center: 0.5,
    right: 0.76
  };

  return {
    slot,
    x: Math.round(safeWidth * slotRatios[slot]),
    y: Math.round(safeHeight - Math.max(54, safeHeight * 0.1)),
    maxWidth: Math.round(safeWidth * 0.26),
    maxHeight: Math.round(safeHeight * 0.68)
  };
}

export function formatFallbackPortraitLabel(characterId: string, portraitId: string | undefined): string {
  const characterLabel = characterId.replace(/^character:/, "");
  if (!portraitId) return `${characterLabel}\nNO PORTRAIT`;
  return `${characterLabel}\nMISSING\n${portraitId.replace(/^portrait:/, "")}`;
}
