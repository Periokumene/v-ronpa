import type { NaniRange } from "../documentContext";

export interface CharacterPreviewRequest {
  documentUri: string;
  documentVersion: number;
  line: number;
  identityRange: NaniRange;
  characterId: string;
  appearanceExpression: string;
}

export interface UnavailableCharacterPreviewRequest {
  kind: "unavailable";
  identityRange: NaniRange;
  message: string;
}

export interface AvailableCharacterPreviewRequest {
  kind: "request";
  request: CharacterPreviewRequest;
}

export type CharacterPreviewTarget =
  | AvailableCharacterPreviewRequest
  | UnavailableCharacterPreviewRequest;

export interface PreviewBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ResolvedPreviewLayer {
  id: string;
  png: Buffer;
  width: number;
  height: number;
  metadata: import("@v-ronpa/contracts").LayeredCharacterLayerMetadata;
}

export interface ResolvedCharacterPreview {
  request: CharacterPreviewRequest;
  stageScale: number;
  characterAnchor: readonly [number, number];
  layers: ResolvedPreviewLayer[];
  bounds: PreviewBounds;
  fingerprint: string;
  packRoot: string;
}

export interface PreviewArtifact {
  fingerprint: string;
  path: string;
  layerCount: number;
}

export interface CharacterPreviewArtifactRenderer {
  render(input: ResolvedCharacterPreview): string;
}
