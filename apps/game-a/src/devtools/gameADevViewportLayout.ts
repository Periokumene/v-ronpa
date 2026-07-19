export type GameADevViewportMode = "fidelity" | "responsive";

export interface GameADevViewportSize {
  width: number;
  height: number;
}

export interface GameADevViewportLayout {
  logicalWidth: number;
  logicalHeight: number;
  displayWidth: number;
  displayHeight: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

export function resolveGameADevViewportLayout({
  browser,
  cell,
  mode
}: {
  browser: GameADevViewportSize;
  cell: GameADevViewportSize;
  mode: GameADevViewportMode;
}): GameADevViewportLayout {
  const safeBrowser = sanitizeSize(browser);
  const safeCell = sanitizeSize(cell);
  if (mode === "responsive") {
    return {
      logicalWidth: safeCell.width,
      logicalHeight: safeCell.height,
      displayWidth: safeCell.width,
      displayHeight: safeCell.height,
      offsetX: 0,
      offsetY: 0,
      scale: 1
    };
  }

  const scale = Math.min(1, safeCell.width / safeBrowser.width, safeCell.height / safeBrowser.height);
  const displayWidth = safeBrowser.width * scale;
  const displayHeight = safeBrowser.height * scale;
  return {
    logicalWidth: safeBrowser.width,
    logicalHeight: safeBrowser.height,
    displayWidth,
    displayHeight,
    offsetX: Math.max(0, (safeCell.width - displayWidth) / 2),
    offsetY: Math.max(0, (safeCell.height - displayHeight) / 2),
    scale
  };
}

function sanitizeSize(size: GameADevViewportSize): GameADevViewportSize {
  return {
    width: finitePositive(size.width),
    height: finitePositive(size.height)
  };
}

function finitePositive(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, value);
}
