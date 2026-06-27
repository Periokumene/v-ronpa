import { Assets, Container, Sprite, type Texture } from "pixi.js";
import {
  LayeredCharacterCompositionsSchema,
  LayeredCharacterDefinitionSchema,
  LayeredCharacterLayerMetadataSchema,
  LayeredCharacterLayersSchema,
  type LayeredCharacterDefinition,
  type LayeredCharacterLayerMetadata,
  type LayeredCharacterLayers,
  type LayeredCharacterCompositions,
  type PixiActorSnapshot
} from "@v-ronpa/contracts";
import { resolveLayeredCharacter, resolveLayeredCharacterLayerRefs, type ResolvedLayeredCharacterLayer } from "@v-ronpa/layered-character";
import { resolvePixiAsset, type PixiAssetResolver, type PixiPresenterDiagnostic } from "./assetResolver";

export interface CharacterSystemOptions {
  width: () => number;
  height: () => number;
  assetResolver?: PixiAssetResolver;
  onDiagnostic?: (diagnostic: PixiPresenterDiagnostic) => void;
}

interface LoadedCharacterPack {
  entryUri: string;
  character: LayeredCharacterDefinition;
  layers: LayeredCharacterLayers;
  compositions: LayeredCharacterCompositions;
}

export class CharacterSystem {
  private readonly packs = new Map<string, Promise<LoadedCharacterPack>>();
  private readonly metadata = new Map<string, Promise<LayeredCharacterLayerMetadata>>();
  private readonly textures = new Map<string, Promise<Texture>>();

  constructor(private readonly options: CharacterSystemOptions) {}

  render(container: Container, actor: PixiActorSnapshot, generation: number, isCurrent: () => boolean): void {
    const entryUri = resolvePixiAsset(this.options.assetResolver, { id: actor.id, kind: "character-pack" }, this.options.onDiagnostic);
    if (!entryUri) {
      this.replaceContent(container, new Container({ label: `empty-character:${actor.id}` }));
      return;
    }

    void this.loadPack(entryUri)
      .then(async (pack) => {
        if (!isCurrent()) return;
        const layerRefs = resolveLayeredCharacterLayerRefs({
          character: pack.character,
          layers: pack.layers,
          compositions: pack.compositions,
          appearanceExpression: actor.appearanceExpression
        });
        if (layerRefs.diagnostics.length > 0) {
          this.emitResolveDiagnostics(actor, layerRefs.diagnostics.map((diagnostic) => diagnostic.message), layerRefs.diagnostics[0]?.code);
          if (isCurrent()) this.replaceContent(container, new Container({ label: `empty-character:${actor.id}` }));
          return;
        }
        const metadataEntries = await Promise.all(
          layerRefs.activeLayers.map(async (layer) => {
            const metadata = await this.loadMetadata(resolvePackInternalUri(pack.entryUri, layer.metadataPath));
            return [layer.metadataPath, metadata] as const;
          })
        );
        if (!isCurrent()) return;
        const resolved = resolveLayeredCharacter({
          character: pack.character,
          layers: pack.layers,
          compositions: pack.compositions,
          metadataByPath: Object.fromEntries(metadataEntries),
          appearanceExpression: actor.appearanceExpression
        });
        if (resolved.diagnostics.length > 0) {
          this.emitResolveDiagnostics(actor, resolved.diagnostics.map((diagnostic) => diagnostic.message), resolved.diagnostics[0]?.code);
          if (isCurrent()) this.replaceContent(container, new Container({ label: `empty-character:${actor.id}` }));
          return;
        }
        const textures = await Promise.all(
          resolved.activeLayers.map(async (layer) => ({
            layer,
            texture: await this.loadTexture(resolvePackInternalUri(pack.entryUri, layer.src))
          }))
        );
        if (!isCurrent()) return;
        const content = new Container({ label: `layered-character:${actor.id}:${generation}` });
        this.drawLayers(content, pack, textures);
        this.replaceContent(container, content);
      })
      .catch((error) => {
        this.emitLoadFailed(actor, error);
        if (isCurrent()) this.replaceContent(container, new Container({ label: `empty-character:${actor.id}` }));
      });
  }

  private loadPack(entryUri: string): Promise<LoadedCharacterPack> {
    const existing = this.packs.get(entryUri);
    if (existing) return existing;
    const promise = this.fetchPack(entryUri).catch((error) => {
      this.packs.delete(entryUri);
      throw error;
    });
    this.packs.set(entryUri, promise);
    return promise;
  }

  private async fetchPack(entryUri: string): Promise<LoadedCharacterPack> {
    const [characterJson, layersJson, compositionsJson] = await Promise.all([
      fetchJson(entryUri),
      fetchJson(resolvePackInternalUri(entryUri, "layers.json")),
      fetchJson(resolvePackInternalUri(entryUri, "compositions.json"))
    ]);
    const character = LayeredCharacterDefinitionSchema.parse(characterJson);
    const layers = LayeredCharacterLayersSchema.parse(layersJson);
    const compositions = LayeredCharacterCompositionsSchema.parse(compositionsJson);
    return {
      entryUri,
      character,
      layers,
      compositions
    };
  }

  private loadMetadata(uri: string): Promise<LayeredCharacterLayerMetadata> {
    const existing = this.metadata.get(uri);
    if (existing) return existing;
    const promise = fetchJson(uri)
      .then((json) => LayeredCharacterLayerMetadataSchema.parse(json))
      .catch((error) => {
        this.metadata.delete(uri);
        throw new Error(`Failed to load layered character metadata ${uri}: ${formatError(error)}`);
      });
    this.metadata.set(uri, promise);
    return promise;
  }

  private loadTexture(uri: string): Promise<Texture> {
    const existing = this.textures.get(uri);
    if (existing) return existing;
    const promise = Assets.load<Texture>(uri).catch((error) => {
      this.textures.delete(uri);
      throw new Error(`Failed to load layered character texture ${uri}: ${formatError(error)}`);
    });
    this.textures.set(uri, promise);
    return promise;
  }

  private emitResolveDiagnostics(actor: PixiActorSnapshot, messages: string[], code = "layered-character-resolve-failed"): void {
    const expression = actor.appearanceExpression?.trim() || "default";
    this.options.onDiagnostic?.({
      source: "asset",
      code,
      severity: "error",
      assetId: actor.id,
      kind: "character-pack",
      message: `Layered character ${actor.id} expression '${expression}' failed: ${messages.join(" ")}`
    });
  }

  private emitLoadFailed(actor: PixiActorSnapshot, error: unknown): void {
    const expression = actor.appearanceExpression?.trim() || "default";
    this.options.onDiagnostic?.({
      source: "asset",
      code: "asset-load-failed",
      severity: "error",
      assetId: actor.id,
      kind: "character-pack",
      message: `Layered character ${actor.id} expression '${expression}' failed to load character-pack asset: ${formatError(error)}`
    });
  }

  private drawLayers(
    content: Container,
    pack: LoadedCharacterPack,
    textures: Array<{ layer: ResolvedLayeredCharacterLayer; texture: Texture }>
  ): void {
    const bounds = pack.character.renderSpace.defaultBounds;
    const anchorX = (bounds.min[0] + bounds.max[0]) / 2;
    const anchorY = bounds.min[1];
    const viewportScale = this.options.height() / 540;
    const stageScale = pack.character.renderSpace.stageScale * viewportScale;
    content.sortableChildren = true;

    for (const { layer, texture } of textures) {
      const sprite = new Sprite(texture);
      const { sprite: spriteMeta, localTransform, renderer } = layer.metadata;
      sprite.anchor.set(spriteMeta.pivot.x, spriteMeta.pivot.y);
      sprite.position.set(
        (localTransform.position.x - anchorX) * stageScale,
        -(localTransform.position.y - anchorY) * stageScale
      );
      const textureWidth = texture.width > 0 ? texture.width : spriteMeta.rect.width;
      const textureHeight = texture.height > 0 ? texture.height : spriteMeta.rect.height;
      const scaleX = (spriteMeta.rect.width / textureWidth) * localTransform.scale.x * stageScale / spriteMeta.pixelsPerUnit;
      const scaleY = (spriteMeta.rect.height / textureHeight) * localTransform.scale.y * stageScale / spriteMeta.pixelsPerUnit;
      sprite.scale.set(renderer.flipX ? -scaleX : scaleX, renderer.flipY ? -scaleY : scaleY);
      sprite.rotation = -(localTransform.rotation.z * Math.PI) / 180;
      sprite.tint = rgbToHex(renderer.color.r, renderer.color.g, renderer.color.b);
      sprite.alpha = renderer.color.a;
      sprite.zIndex = layer.metadata.drawOrder;
      content.addChild(sprite);
    }
  }

  private replaceContent(container: Container, content: Container): void {
    const previous = container.removeChildren();
    for (const child of previous) child.destroy({ children: true });
    container.addChild(content);
  }
}

async function fetchJson(uri: string): Promise<unknown> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Failed to load ${uri}: ${response.status} ${response.statusText}`);
  return response.json();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolvePackInternalUri(baseUri: string, relativePath: string): string {
  const fallbackBase = globalThis.location?.href ?? "http://localhost/";
  const packRoot = new URL("./", new URL(baseUri, fallbackBase));
  const resolved = new URL(relativePath, packRoot);
  if (!resolved.href.startsWith(packRoot.href)) {
    throw new Error(`Layered character pack path '${relativePath}' escapes pack root ${packRoot.href}.`);
  }
  return resolved.toString();
}

function rgbToHex(r: number, g: number, b: number): number {
  const red = clampColor(r);
  const green = clampColor(g);
  const blue = clampColor(b);
  return (red << 16) + (green << 8) + blue;
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}
