export interface VnDialogAppearance {
  backgroundOpacity: number;
}

export const DEFAULT_VN_DIALOG_APPEARANCE = {
  backgroundOpacity: 1
} as const satisfies VnDialogAppearance;

export function resolveVnDialogAppearance(
  appearance: Partial<VnDialogAppearance> | undefined
): VnDialogAppearance {
  const backgroundOpacity = appearance?.backgroundOpacity;
  if (backgroundOpacity === undefined || !Number.isFinite(backgroundOpacity)) {
    return { ...DEFAULT_VN_DIALOG_APPEARANCE };
  }
  return {
    backgroundOpacity: Math.min(1, Math.max(0, backgroundOpacity))
  };
}
