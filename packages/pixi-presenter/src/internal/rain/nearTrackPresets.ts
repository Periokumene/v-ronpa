export type NearTrackPresetCategory = 'early' | 'mid' | 'late';

export type NearTrackMotionPreset = {
  startOffset: number;
};

export type NearTrackStylePreset = {
  widthScale: number;
  strengthScale: number;
};

export type NearTrackIdentityPreset = {
  phaseOffset: number;
  laneOffsetBias: number;
  bendScale: number;
  brightnessBias: number;
};

export type NearTrackPreset = {
  category: NearTrackPresetCategory;
  motion: NearTrackMotionPreset;
  style: NearTrackStylePreset;
  identity: NearTrackIdentityPreset;
};

type NearTrackPresetInput = {
  category: NearTrackPresetCategory;
  motion?: Partial<NearTrackMotionPreset>;
  style?: Partial<NearTrackStylePreset>;
  identity?: Partial<NearTrackIdentityPreset>;
};

const defaultNearTrackPreset: NearTrackPreset = {
  category: 'mid',
  motion: {
    startOffset: 0,
  },
  style: {
    widthScale: 1,
    strengthScale: 1,
  },
  identity: {
    phaseOffset: 0,
    laneOffsetBias: 0,
    bendScale: 1,
    brightnessBias: 0,
  },
};

const nearTrackPresetInputs: readonly NearTrackPresetInput[] = [
  { category: 'early', motion: { startOffset: -0.35 } },
  { category: 'mid', motion: { startOffset: 0.14 } },
  { category: 'late', motion: { startOffset: 0.63 } },
  { category: 'early', motion: { startOffset: -0.31 } },
  { category: 'mid', motion: { startOffset: 0.18 } },
  { category: 'late', motion: { startOffset: 0.61 } },
  { category: 'early', motion: { startOffset: -0.33 } },
  { category: 'mid', motion: { startOffset: 0.16 } },
  { category: 'late', motion: { startOffset: 0.64 } },
  { category: 'early', motion: { startOffset: -0.29 } },
  { category: 'mid', motion: { startOffset: 0.2 } },
];

export function resolveNearTrackPreset(guideIndex: number): NearTrackPreset {
  const presetCount = nearTrackPresetInputs.length;

  if (presetCount === 0) return defaultNearTrackPreset;

  const normalizedIndex = ((guideIndex % presetCount) + presetCount) % presetCount;
  const input = nearTrackPresetInputs[normalizedIndex];

  if (!input) return defaultNearTrackPreset;

  return {
    category: input.category,
    motion: {
      ...defaultNearTrackPreset.motion,
      ...input.motion,
    },
    style: {
      ...defaultNearTrackPreset.style,
      ...input.style,
    },
    identity: {
      ...defaultNearTrackPreset.identity,
      ...input.identity,
    },
  };
}
