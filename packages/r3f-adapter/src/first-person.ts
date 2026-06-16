import type { AabbBounds, PlayerPose, Vector3 } from "@v-ronpa/contracts";

export function clampVectorToAabb(position: Vector3, bounds?: AabbBounds): Vector3 {
  if (!bounds) return [...position];

  return [
    clamp(position[0], bounds.min[0], bounds.max[0]),
    clamp(position[1], bounds.min[1], bounds.max[1]),
    clamp(position[2], bounds.min[2], bounds.max[2])
  ];
}

export function yawPitchToFacingVector(pose: Pick<PlayerPose, "yaw" | "pitch">): Vector3 {
  const cosPitch = Math.cos(pose.pitch);

  return [Math.sin(pose.yaw) * cosPitch, Math.sin(pose.pitch), -Math.cos(pose.yaw) * cosPitch];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
