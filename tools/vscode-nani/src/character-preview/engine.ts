import type { NaniCharacterPackDescriptor } from "../project-resources";
import { characterPreviewRequestKey } from "./requestExtractor";
import {
  loadResolvedCharacterCompletionPreview,
  loadResolvedCharacterPreview,
  type CharacterPreviewFileReader
} from "./packLoader";
import {
  CHARACTER_TOKEN_PREVIEW_HEIGHT,
  CHARACTER_TOKEN_PREVIEW_WIDTH,
  StaticSvgCharacterPreviewRenderer
} from "./svgRenderer";
import type {
  CharacterCompletionPreviewArtifacts,
  CharacterPreviewRequest,
  PreviewArtifact
} from "./types";
import { CharacterPreviewArtifactCache } from "./artifactCache";

export class CharacterPreviewEngine {
  private readonly hot = new Map<string, PreviewArtifact>();
  private readonly pending = new Map<string, Promise<PreviewArtifact>>();
  private readonly completionPending = new Map<string, Promise<CharacterCompletionPreviewArtifacts>>();
  private readonly renderer = new StaticSvgCharacterPreviewRenderer();
  private readonly tokenRenderer = new StaticSvgCharacterPreviewRenderer({
    width: CHARACTER_TOKEN_PREVIEW_WIDTH,
    height: CHARACTER_TOKEN_PREVIEW_HEIGHT
  });
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

  generateCompletion(
    request: CharacterPreviewRequest,
    baseAppearanceExpression: string,
    descriptor: NaniCharacterPackDescriptor
  ): Promise<CharacterCompletionPreviewArtifacts> {
    const requestKey = characterPreviewRequestKey(request);
    const key = `${requestKey}\0${baseAppearanceExpression}`;
    const generation = this.generation;
    const existing = this.completionPending.get(key);
    if (existing) return existing;
    const pending = loadResolvedCharacterCompletionPreview(
      descriptor,
      request,
      baseAppearanceExpression,
      this.fileReader
    )
      .then(async (resolved) => {
        const [complete, contribution] = await Promise.all([
          this.artifacts.getOrCreate(resolved.complete, this.renderer),
          resolved.contribution
            ? this.artifacts.getOrCreate(resolved.contribution, this.tokenRenderer)
            : Promise.resolve(undefined)
        ]);
        if (generation === this.generation) this.hot.set(requestKey, complete);
        return { complete, ...(contribution ? { contribution } : {}) };
      })
      .finally(() => {
        if (this.completionPending.get(key) === pending) this.completionPending.delete(key);
      });
    this.completionPending.set(key, pending);
    return pending;
  }

  invalidate(): void {
    this.generation += 1;
    this.hot.clear();
    this.pending.clear();
    this.completionPending.clear();
    this.artifacts.clearMemory();
  }
}
