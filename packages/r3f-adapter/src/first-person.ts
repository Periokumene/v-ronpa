import type { AabbBounds, InteractableDef, PlayerPose, Vector3 } from "@v-ronpa/contracts";

export interface FocusSearchOptions {
  maxDistance?: number;
  facingThreshold?: number;
}

export interface FocusSearchInput extends FocusSearchOptions {
  position: Vector3;
  facing: Vector3;
  interactables: readonly InteractableDef[];
}

const DEFAULT_FOCUS_DISTANCE = 1.6;
const DEFAULT_FACING_THRESHOLD = 0.72;

export function clampVectorToAabb(position: Vector3, bounds?: AabbBounds): Vector3 {
  if (!bounds) return [...position];

  return [
    clamp(position[0], bounds.min[0], bounds.max[0]),
    clamp(position[1], bounds.min[1], bounds.max[1]),
    clamp(position[2], bounds.min[2], bounds.max[2])
  ];
}

export function findFocusedInteractable({
  position,
  facing,
  interactables,
  maxDistance = DEFAULT_FOCUS_DISTANCE,
  facingThreshold = DEFAULT_FACING_THRESHOLD
}: FocusSearchInput): InteractableDef | undefined {
  const facing2d = normalize2d([facing[0], facing[2]]);
  if (!facing2d) return undefined;

  let selected: InteractableDef | undefined;
  let selectedScore = -Infinity;

  for (const interactable of interactables) {
    const offset: [number, number] = [interactable.position[0] - position[0], interactable.position[2] - position[2]];
    const distance = Math.hypot(offset[0], offset[1]);
    const allowedDistance = Math.max(maxDistance, interactable.radius);

    if (distance <= 0.001 || distance > allowedDistance) continue;

    const targetDirection = normalize2d(offset);
    if (!targetDirection) continue;

    const facingScore = facing2d[0] * targetDirection[0] + facing2d[1] * targetDirection[1];
    if (facingScore < facingThreshold) continue;

    const distanceScore = 1 - distance / allowedDistance;
    const score = facingScore + distanceScore;
    if (score > selectedScore) {
      selected = interactable;
      selectedScore = score;
    }
  }

  return selected;
}

export function yawPitchToFacingVector(pose: Pick<PlayerPose, "yaw" | "pitch">): Vector3 {
  const cosPitch = Math.cos(pose.pitch);

  return [Math.sin(pose.yaw) * cosPitch, Math.sin(pose.pitch), -Math.cos(pose.yaw) * cosPitch];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalize2d(vector: [number, number]): [number, number] | undefined {
  const length = Math.hypot(vector[0], vector[1]);
  if (length <= 0.001) return undefined;

  return [vector[0] / length, vector[1] / length];
}
