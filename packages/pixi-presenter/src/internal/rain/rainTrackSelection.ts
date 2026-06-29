import {
  internalRainSeed,
  resolveRainTrack,
  type RainSettings,
} from "./settings";

export type RainTrackSelectionRuntime = {
  activeMask: boolean[];
  cycleIndex: number | null;
  desiredMask: boolean[];
  playedCounts: number[];
  signature: string;
  trackPassIndices: number[];
};

export function createRainTrackSelectionRuntime(trackCount: number): RainTrackSelectionRuntime {
  return {
    activeMask: Array.from({ length: trackCount }, () => true),
    cycleIndex: null,
    desiredMask: Array.from({ length: trackCount }, () => true),
    playedCounts: Array.from({ length: trackCount }, () => 0),
    signature: '',
    trackPassIndices: Array.from({ length: trackCount }, () => Number.NaN),
  };
}

const nearSizeSpeedInfluence = 0.25;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function centeredInfluence(value: number, influence: number) {
  return Math.max(0.05, 1 + (value - 0.5) * 2 * influence);
}

function makeRng(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(settings: RainSettings, cycleIndex: number) {
  const selection = settings.rainTrackSelection;
  return (
    Math.imul(internalRainSeed + 1, 0x9e3779b1) ^
    Math.imul(cycleIndex + 1, 0x85ebca6b) ^
    Math.imul(selection.windowSeed + 1, 0xc2b2ae35)
  );
}

function nearTrackPassIndex(settings: RainSettings, trackIndex: number, frame: number) {
  const effectiveTrack = resolveRainTrack(settings, trackIndex);
  const sizeRank = clamp(effectiveTrack.identity.sizeRank, 0, 1);
  const sizeSpeedScale = centeredInfluence(sizeRank, nearSizeSpeedInfluence);
  const speedScale = sizeSpeedScale;
  const shapeLengthScale = effectiveTrack.identity.shapeFamily === 4 ? 1.2 : 1;
  const length = clamp(effectiveTrack.length * speedScale * shapeLengthScale, 0.001, 0.95);
  const span = 1 + length;
  const rawPosition =
    effectiveTrack.startPosition + length * 2 + effectiveTrack.speedPerFrame * speedScale * Math.max(0, frame);

  return Math.floor((rawPosition + length) / span);
}

function selectionSignature(settings: RainSettings, trackCount: number) {
  const selection = settings.rainTrackSelection;

  return [
    internalRainSeed,
    settings.rainBase.startPosition.toFixed(5),
    settings.rainBase.speedPerFrame.toFixed(5),
    settings.rainBase.length.toFixed(5),
    selection.enabled ? 1 : 0,
    selection.minActive,
    selection.maxActive,
    selection.windowSeed,
    trackCount,
  ].join(':');
}

export function rainTrackCycleIndex(settings: RainSettings, frame: number) {
  const speedPerFrame = Math.max(settings.rainBase.speedPerFrame, 0);

  if (speedPerFrame <= 0) return 0;

  const length = Math.max(settings.rainBase.length, 0.001);
  const loopSpan = 1 + length;
  const rawPosition = settings.rainBase.startPosition + length * 3 + speedPerFrame * Math.max(0, frame);

  return Math.max(0, Math.floor(rawPosition / loopSpan));
}

function activeCountRange(settings: RainSettings, trackCount: number) {
  const selection = settings.rainTrackSelection;
  const minActive = clamp(Math.round(selection.minActive), 0, trackCount);
  const maxActive = clamp(Math.round(selection.maxActive), minActive, trackCount);

  return { minActive, maxActive };
}

function adjacencyPenalty(index: number, selected: number[]) {
  return selected.reduce((penalty, selectedIndex) => {
    const distance = Math.abs(selectedIndex - index);
    if (distance === 1) return penalty + 1.6;
    if (distance === 2) return penalty + 0.45;
    return penalty;
  }, 0);
}

function longestRunWithTrack(index: number, selected: number[], trackCount: number) {
  let longestRun = 0;
  let currentRun = 0;
  const selectedSet = new Set([...selected, index]);

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    currentRun = selectedSet.has(trackIndex) ? currentRun + 1 : 0;
    longestRun = Math.max(longestRun, currentRun);
  }

  return longestRun;
}

function runLimitForTarget(targetCount: number, trackCount: number) {
  if (trackCount <= 4) return trackCount;
  return targetCount >= Math.ceil(trackCount * 0.6) ? 3 : 2;
}

function selectMask(settings: RainSettings, runtime: RainTrackSelectionRuntime, trackCount: number, cycleIndex: number) {
  const trackIndices = Array.from({ length: trackCount }, (_, index) => index);
  const mask = Array.from({ length: trackCount }, () => false);

  if (!settings.rainTrackSelection.enabled) {
    trackIndices.forEach((index) => {
      mask[index] = true;
    });
    return mask;
  }

  const { minActive, maxActive } = activeCountRange(settings, trackIndices.length);

  if (maxActive <= 0 || trackIndices.length === 0) return mask;
  if (maxActive >= trackIndices.length && minActive >= trackIndices.length) {
    trackIndices.forEach((index) => {
      mask[index] = true;
    });
    return mask;
  }

  const rng = makeRng(mixSeed(settings, cycleIndex));
  const targetCount = minActive + Math.floor(rng() * (maxActive - minActive + 1));
  const jitterByIndex = new Map(trackIndices.map((index) => [index, rng()]));
  const selected: number[] = [];
  const runLimit = runLimitForTarget(targetCount, trackIndices.length);

  while (selected.length < targetCount) {
      let bestIndex = trackIndices[0] ?? 0;
    let bestScore = Number.POSITIVE_INFINITY;

    trackIndices.forEach((index) => {
      if (selected.includes(index)) return;

      const longestRun = longestRunWithTrack(index, selected, trackCount);
      const runOverflow = Math.max(0, longestRun - runLimit);
      const fairnessScore = (runtime.playedCounts[index] ?? 0) * 6;
      const runScore = runOverflow * 100 + longestRun * 1.1;
      const spacingScore = adjacencyPenalty(index, selected) * 2.4;
      const jitterScore = jitterByIndex.get(index) ?? 0;
      const score = fairnessScore + runScore + spacingScore + jitterScore;

      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    selected.push(bestIndex);
  }

  selected.forEach((index) => {
    mask[index] = true;
    runtime.playedCounts[index] = (runtime.playedCounts[index] ?? 0) + 1;
  });

  return mask;
}

export function resolveRainTrackActiveMask(
  settings: RainSettings,
  frame: number,
  runtime: RainTrackSelectionRuntime,
  trackCount: number,
) {
  const signature = selectionSignature(settings, trackCount);
  const cycleIndex = rainTrackCycleIndex(settings, frame);
  const firstResolve = runtime.signature === '';

  if (runtime.signature !== signature) {
    runtime.signature = signature;
    runtime.cycleIndex = null;
    runtime.playedCounts = Array.from({ length: trackCount }, () => 0);
    runtime.desiredMask = Array.from({ length: trackCount }, () => true);
    runtime.trackPassIndices = Array.from({ length: trackCount }, () => Number.NaN);
    if (firstResolve) {
      runtime.activeMask = Array.from({ length: trackCount }, () => true);
    }
  }

  if (runtime.cycleIndex !== cycleIndex) {
    runtime.cycleIndex = cycleIndex;
    runtime.desiredMask = selectMask(settings, runtime, trackCount, cycleIndex);
    if (firstResolve) {
      runtime.activeMask = [...runtime.desiredMask];
    }
  }

  runtime.activeMask = Array.from({ length: trackCount }, (_, index) => Boolean(runtime.activeMask[index]));
  runtime.desiredMask = Array.from({ length: trackCount }, (_, index) => Boolean(runtime.desiredMask[index]));

  // Apply random target changes only when an individual streak wraps back to its entry edge.
  for (let index = 0; index < trackCount; index += 1) {
    const passIndex = nearTrackPassIndex(settings, index, frame);
    const previousPassIndex = runtime.trackPassIndices[index];

    if (Number.isNaN(previousPassIndex)) {
      runtime.trackPassIndices[index] = passIndex;
      continue;
    }

    if (previousPassIndex !== passIndex) {
      runtime.trackPassIndices[index] = passIndex;
      runtime.activeMask[index] = Boolean(runtime.desiredMask[index]);
    }
  }

  return runtime.activeMask;
}
