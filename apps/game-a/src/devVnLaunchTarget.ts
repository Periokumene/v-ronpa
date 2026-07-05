export interface GameAVnLaunchTarget {
  requested: boolean;
  autoStart: boolean;
  startLabelOverride?: string;
  error?: GameAVnLaunchTargetError;
}

export interface GameAVnLaunchTargetError {
  code: "empty-start-label";
  message: string;
}

export function resolveGameAVnLaunchTarget({
  devMode,
  search
}: {
  devMode: boolean;
  search: string;
}): GameAVnLaunchTarget {
  if (!devMode) return { requested: false, autoStart: false };

  const params = new URLSearchParams(search);
  if (!params.has("vnStart")) return { requested: false, autoStart: false };

  const startLabelOverride = normalizeGameAVnStartLabel(params.get("vnStart") ?? "");
  if (!startLabelOverride) {
    return {
      requested: true,
      autoStart: false,
      error: {
        code: "empty-start-label",
        message: "VN debug start label is empty. Use ?vnStart=<label>."
      }
    };
  }

  return {
    requested: true,
    autoStart: true,
    startLabelOverride
  };
}

export function normalizeGameAVnStartLabel(value: string): string {
  const trimmed = value.trim();
  const withoutPrefix = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return withoutPrefix.trim();
}

export function shouldAutoStartGameAVnLaunchTarget({
  hasInvalidStartLabel,
  target
}: {
  hasInvalidStartLabel: boolean;
  target: GameAVnLaunchTarget;
}): boolean {
  return target.autoStart && !hasInvalidStartLabel;
}
