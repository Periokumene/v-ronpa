export type RainViewportMapping = {
  frameMin: [number, number];
  frameSize: [number, number];
  guideResolution: [number, number];
  designAspect: number;
};

export const rainDesignWidth = 1384;
export const rainDesignHeight = 646;
export const rainDesignAspect = rainDesignWidth / rainDesignHeight;

export function resolveRainViewportCover(width: number, height: number): RainViewportMapping {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const canvasAspect = safeWidth / safeHeight;
  const frameSize: [number, number] = [1, 1];

  if (canvasAspect > rainDesignAspect) {
    frameSize[1] = canvasAspect / rainDesignAspect;
  } else {
    frameSize[0] = rainDesignAspect / canvasAspect;
  }

  const frameMin: [number, number] = [(1 - frameSize[0]) * 0.5, (1 - frameSize[1]) * 0.5];

  return {
    frameMin,
    frameSize,
    guideResolution: [safeWidth * frameSize[0], safeHeight * frameSize[1]],
    designAspect: rainDesignAspect,
  };
}
