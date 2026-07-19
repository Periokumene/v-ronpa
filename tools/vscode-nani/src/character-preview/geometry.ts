import type { LayeredCharacterLayerMetadata } from "@v-ronpa/contracts";
import type { PreviewBounds } from "./types";

export interface LayerGeometryInput {
  width: number;
  height: number;
  metadata: LayeredCharacterLayerMetadata;
  stageScale: number;
  characterAnchor: readonly [number, number];
}

export interface LayerGeometry {
  x: number;
  y: number;
  rotationDegrees: number;
  scaleX: number;
  scaleY: number;
  imageX: number;
  imageY: number;
  bounds: PreviewBounds;
}

export function calculateLayerGeometry(input: LayerGeometryInput): LayerGeometry {
  const { localTransform, renderer, sprite } = input.metadata;
  const x = (localTransform.position.x - input.characterAnchor[0]) * input.stageScale;
  const y = -(localTransform.position.y - input.characterAnchor[1]) * input.stageScale;
  const scaleX = localTransform.scale.x * input.stageScale / sprite.pixelsPerUnit * (renderer.flipX ? -1 : 1);
  const scaleY = localTransform.scale.y * input.stageScale / sprite.pixelsPerUnit * (renderer.flipY ? -1 : 1);
  const rotationDegrees = -localTransform.rotation.z;
  const imageX = -sprite.pivot.x * input.width;
  const imageY = -sprite.pivot.y * input.height;
  const radians = rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [imageX, imageY],
    [imageX + input.width, imageY],
    [imageX + input.width, imageY + input.height],
    [imageX, imageY + input.height]
  ].map(([cornerX = 0, cornerY = 0]) => {
    const scaledX = cornerX * scaleX;
    const scaledY = cornerY * scaleY;
    return {
      x: x + scaledX * cosine - scaledY * sine,
      y: y + scaledX * sine + scaledY * cosine
    };
  });
  return {
    x,
    y,
    rotationDegrees,
    scaleX,
    scaleY,
    imageX,
    imageY,
    bounds: {
      minX: Math.min(...corners.map((corner) => corner.x)),
      minY: Math.min(...corners.map((corner) => corner.y)),
      maxX: Math.max(...corners.map((corner) => corner.x)),
      maxY: Math.max(...corners.map((corner) => corner.y))
    }
  };
}

export function unionPreviewBounds(bounds: readonly PreviewBounds[]): PreviewBounds {
  if (bounds.length === 0) throw new Error("Character preview contains no active layers.");
  return {
    minX: Math.min(...bounds.map((value) => value.minX)),
    minY: Math.min(...bounds.map((value) => value.minY)),
    maxX: Math.max(...bounds.map((value) => value.maxX)),
    maxY: Math.max(...bounds.map((value) => value.maxY))
  };
}
