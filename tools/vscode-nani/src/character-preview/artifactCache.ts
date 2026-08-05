import { SvgPreviewArtifactStore } from "../preview/artifactStore";
import type { CharacterPreviewArtifactRenderer, PreviewArtifact, ResolvedCharacterPreview } from "./types";

export interface CharacterPreviewArtifactCacheOptions {
  maxArtifacts?: number;
  maxBytes?: number;
}

export class CharacterPreviewArtifactCache {
  private readonly store: SvgPreviewArtifactStore;

  constructor(
    readonly directory: string,
    options: CharacterPreviewArtifactCacheOptions = {}
  ) {
    this.store = new SvgPreviewArtifactStore(directory, options);
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  getOrCreate(
    preview: ResolvedCharacterPreview,
    renderer: CharacterPreviewArtifactRenderer
  ): Promise<PreviewArtifact> {
    return this.store.getOrCreate(preview.fingerprint, () => renderer.render(preview)).then((artifact) => ({
      ...artifact,
      layerCount: preview.layers.length
    }));
  }

  clearMemory(): void {
    this.store.clearMemory();
  }
}
