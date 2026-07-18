import type { NaniCharacterPackDescriptor } from "../project-resources";
import { characterPreviewRequestKey } from "./requestExtractor";
import { loadResolvedCharacterPreview, type CharacterPreviewFileReader } from "./packLoader";
import { StaticSvgCharacterPreviewRenderer } from "./svgRenderer";
import type { CharacterPreviewRequest, PreviewArtifact } from "./types";
import { CharacterPreviewArtifactCache } from "./artifactCache";

export class CharacterPreviewEngine {
  private readonly hot = new Map<string, PreviewArtifact>();
  private readonly pending = new Map<string, Promise<PreviewArtifact>>();
  private readonly renderer = new StaticSvgCharacterPreviewRenderer();
  private generation = 0;

  constructor(
    private readonly artifacts: CharacterPreviewArtifactCache,
    private readonly fileReader?: CharacterPreviewFileReader
  ) {}

  initialize(): Promise<void> {
    return this.artifacts.initialize();
  }

  peek(request: CharacterPreviewRequest): PreviewArtifact | undefined {
    return this.hot.get(characterPreviewRequestKey(request));
  }

  generate(
    request: CharacterPreviewRequest,
    descriptor: NaniCharacterPackDescriptor
  ): Promise<PreviewArtifact> {
    const key = characterPreviewRequestKey(request);
    const generation = this.generation;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const pending = loadResolvedCharacterPreview(descriptor, request, this.fileReader)
      .then((resolved) => this.artifacts.getOrCreate(resolved, this.renderer))
      .then((artifact) => {
        if (generation === this.generation) this.hot.set(key, artifact);
        return artifact;
      })
      .finally(() => {
        if (this.pending.get(key) === pending) this.pending.delete(key);
      });
    this.pending.set(key, pending);
    return pending;
  }

  invalidate(): void {
    this.generation += 1;
    this.hot.clear();
    this.pending.clear();
    this.artifacts.clearMemory();
  }
}
