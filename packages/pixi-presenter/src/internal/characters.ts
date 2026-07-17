import { Assets, Container, Filter, GlProgram, Sprite, type Renderer, type Texture } from "pixi.js";
import {
  LayeredCharacterCompositionsSchema,
  LayeredCharacterDefinitionSchema,
  LayeredCharacterLayerMetadataSchema,
  LayeredCharacterLayersSchema,
  type LayeredCharacterCompositions,
  type LayeredCharacterDefinition,
  type LayeredCharacterLayerMetadata,
  type LayeredCharacterLayers,
  type PixiActorSnapshot
} from "@v-ronpa/contracts";
import {
  resolveLayeredCharacter,
  resolveLayeredCharacterLayerRefs,
  resolveLayeredCharacterSourcePixelScale,
  type LayeredCharacterPreloadPlan,
  type ResolvedLayeredCharacterLayer
} from "@v-ronpa/layered-character";
import { resolvePixiAsset, type PixiAssetResolver, type PixiPresenterDiagnostic } from "./assetResolver";

export interface CharacterSystemOptions {
  width: () => number;
  height: () => number;
  characterOutlineEnabled: boolean;
  renderer?: Renderer;
  assetResolver?: PixiAssetResolver;
  onDiagnostic?: (diagnostic: PixiPresenterDiagnostic) => void;
}

interface LoadedCharacterPack {
  entryUri: string;
  character: LayeredCharacterDefinition;
  layers: LayeredCharacterLayers;
  compositions: LayeredCharacterCompositions;
}

interface CharacterRenderFrame {
  anchorX: number;
  anchorY: number;
  stageScale: number;
}

interface PreparedCharacterTexture {
  layer: ResolvedLayeredCharacterLayer;
  textureUri: string;
  texture: Texture;
}

type PreparedCharacterResult =
  | {
      kind: "ready";
      characterId: string;
      expression: string;
      frame: CharacterRenderFrame;
      textures: PreparedCharacterTexture[];
      sourcePixelStep?: number;
    }
  | {
      kind: "invalid";
      characterId: string;
      expression: string;
    };

export interface CharacterCompositionInstance {
  container: Container;
  sourcePixelStep?: number;
}

interface CharacterOpacityState {
  value: number;
}

interface MountedCharacterComposition extends CharacterCompositionInstance {
  opacity: CharacterOpacityState;
  outline?: CharacterOutlineFilter;
  opacityFilter?: CharacterOpacityFilter;
}

export interface CharacterContentTransition {
  outgoing: CharacterOpacityState;
  incoming: CharacterOpacityState;
  syncOutgoing(): void;
  syncIncoming(): void;
  settle(): void;
}

interface CharacterOutlineUniformValues {
  uStepX: Float32Array;
  uStepY: Float32Array;
  uOpacity: number;
}

interface CharacterOutlineFilter {
  filter: Filter;
  uniforms: CharacterOutlineUniformValues;
}

interface CharacterOpacityUniformValues {
  uOpacity: number;
}

interface CharacterOpacityFilter {
  filter: Filter;
  uniforms: CharacterOpacityUniformValues;
}

const CHARACTER_FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const CHARACTER_OUTLINE_FRAGMENT = `
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec2 uStepX;
uniform vec2 uStepY;
uniform float uOpacity;

float sampleAlpha(vec2 offset) {
  return texture(uTexture, vTextureCoord + offset * uInputSize.zw).a;
}

void main(void) {
  vec4 center = texture(uTexture, vTextureCoord);
  float emptyProduct = 1.0;
  emptyProduct *= 1.0 - sampleAlpha(-uStepX - uStepY);
  emptyProduct *= 1.0 - sampleAlpha(-uStepY);
  emptyProduct *= 1.0 - sampleAlpha(uStepX - uStepY);
  emptyProduct *= 1.0 - sampleAlpha(-uStepX);
  emptyProduct *= 1.0 - sampleAlpha(uStepX);
  emptyProduct *= 1.0 - sampleAlpha(-uStepX + uStepY);
  emptyProduct *= 1.0 - sampleAlpha(uStepY);
  emptyProduct *= 1.0 - sampleAlpha(uStepX + uStepY);
  float neighborAlpha = 1.0 - emptyProduct;
  float outerAlpha = neighborAlpha * (1.0 - center.a);
  vec4 outlinedColor = vec4(center.rgb + vec3(outerAlpha), center.a + outerAlpha);
  finalColor = outlinedColor * uOpacity;
}
`;

const CHARACTER_OPACITY_FRAGMENT = `
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uOpacity;

void main(void) {
  finalColor = texture(uTexture, vTextureCoord) * uOpacity;
}
`;

let characterOutlineGlProgram: GlProgram | undefined;
let characterOpacityGlProgram: GlProgram | undefined;

export class CharacterSystem {
  private readonly packs = new Map<string, Promise<LoadedCharacterPack>>();
  private readonly metadata = new Map<string, Promise<LayeredCharacterLayerMetadata>>();
  private readonly textures = new Map<string, Promise<Texture>>();
  private readonly prepared = new Map<string, PreparedCharacterResult>();
  private readonly planMissDiagnostics = new Set<string>();
  private destroyed = false;

  constructor(private readonly options: CharacterSystemOptions) {}

  async preload(plan: LayeredCharacterPreloadPlan): Promise<void> {
    const results = await Promise.all(
      plan.flatMap(({ characterId, appearanceExpressions }) =>
        appearanceExpressions.map((expression) => this.prepareExpression(characterId, expression.trim()))
      )
    );
    if (this.destroyed) return;
    for (const result of results) this.prepared.set(characterResultKey(result.characterId, result.expression), result);
    const uniqueTextures = new Set<Texture>();
    for (const result of results) {
      if (result.kind !== "ready") continue;
      for (const item of result.textures) uniqueTextures.add(item.texture);
    }
    if (uniqueTextures.size === 0 || !this.options.renderer) return;
    try {
      await this.options.renderer.prepare.upload([...uniqueTextures]);
    } catch (error) {
      if (this.destroyed) return;
      for (const result of results) {
        if (result.kind !== "ready" || result.textures.length === 0) continue;
        this.emitLoadFailed(result.characterId, result.expression, new Error(`Failed to upload prepared character textures: ${formatError(error)}`));
        this.prepared.set(characterResultKey(result.characterId, result.expression), {
          kind: "invalid",
          characterId: result.characterId,
          expression: result.expression
        });
      }
    }
  }

  createPresentation(actorId: string): CharacterPresentation {
    return new CharacterPresentation(actorId, this.options);
  }

  instantiate(actor: PixiActorSnapshot): CharacterCompositionInstance {
    const expression = actor.appearanceExpression?.trim() ?? "";
    const key = characterResultKey(actor.id, expression);
    const result = this.prepared.get(key);
    if (!result) {
      if (!this.planMissDiagnostics.has(key)) {
        this.planMissDiagnostics.add(key);
        this.options.onDiagnostic?.({
          source: "asset",
          code: "asset-unprepared-character-expression",
          severity: "error",
          assetId: actor.id,
          kind: "character-pack",
          message: `Layered character ${actor.id} expression '${expression || "default"}' was not included in the active VN entry preload plan.`
        });
      }
      return { container: emptyCharacterContainer(actor.id, expression) };
    }
    if (result.kind === "invalid") return { container: emptyCharacterContainer(actor.id, expression) };
    return {
      container: createLayerComposition(
        result.textures,
        result.frame,
        `layered-character:${actor.id}:${expression || "default"}`
      ),
      ...(result.sourcePixelStep !== undefined ? { sourcePixelStep: result.sourcePixelStep } : {})
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.packs.clear();
    this.metadata.clear();
    this.textures.clear();
    this.prepared.clear();
    this.planMissDiagnostics.clear();
  }

  private async prepareExpression(characterId: string, expression: string): Promise<PreparedCharacterResult> {
    const entryUri = resolvePixiAsset(
      this.options.assetResolver,
      { id: characterId, kind: "character-pack" },
      this.options.onDiagnostic
    );
    if (!entryUri) return { kind: "invalid", characterId, expression };
    try {
      const pack = await this.loadPack(entryUri);
      const layerRefs = resolveLayeredCharacterLayerRefs({
        character: pack.character,
        layers: pack.layers,
        compositions: pack.compositions,
        appearanceExpression: expression
      });
      if (layerRefs.diagnostics.length > 0) {
        this.emitResolveDiagnostics(characterId, expression, layerRefs.diagnostics.map((item) => item.message), layerRefs.diagnostics[0]?.code);
        return { kind: "invalid", characterId, expression };
      }
      const metadataEntries = await Promise.all(
        layerRefs.activeLayers.map(async (layer) => {
          const metadata = await this.loadMetadata(resolvePackInternalUri(pack.entryUri, layer.metadataPath));
          return [layer.metadataPath, metadata] as const;
        })
      );
      const resolved = resolveLayeredCharacter({
        character: pack.character,
        layers: pack.layers,
        compositions: pack.compositions,
        metadataByPath: Object.fromEntries(metadataEntries),
        appearanceExpression: expression
      });
      if (resolved.diagnostics.length > 0) {
        this.emitResolveDiagnostics(characterId, expression, resolved.diagnostics.map((item) => item.message), resolved.diagnostics[0]?.code);
        return { kind: "invalid", characterId, expression };
      }
      const textures = await Promise.all(
        resolved.activeLayers.map(async (layer) => {
          const textureUri = resolvePackInternalUri(pack.entryUri, layer.src);
          return { layer, textureUri, texture: await this.loadTexture(textureUri) };
        })
      );
      const invalidTexture = textures.find(({ texture }) => !hasPositiveTextureDimensions(texture));
      if (invalidTexture) {
        this.emitInvalidTextureDimensions(characterId, expression, invalidTexture.layer, invalidTexture.textureUri, invalidTexture.texture);
        return { kind: "invalid", characterId, expression };
      }
      const sourcePixelScale = resolved.activeLayers.length > 0
        ? resolveLayeredCharacterSourcePixelScale(resolved.activeLayers)
        : undefined;
      if (sourcePixelScale && !sourcePixelScale.ok) {
        this.emitInvalidSourcePixelScale(characterId, expression, sourcePixelScale.message);
        return { kind: "invalid", characterId, expression };
      }
      const frame = characterRenderFrame(pack);
      return {
        kind: "ready",
        characterId,
        expression,
        frame,
        textures,
        ...(sourcePixelScale?.ok ? { sourcePixelStep: sourcePixelScale.unitsPerPixel * frame.stageScale } : {})
      };
    } catch (error) {
      this.emitLoadFailed(characterId, expression, error);
      return { kind: "invalid", characterId, expression };
    }
  }

  private loadPack(entryUri: string): Promise<LoadedCharacterPack> {
    const existing = this.packs.get(entryUri);
    if (existing) return existing;
    const promise = this.fetchPack(entryUri);
    this.packs.set(entryUri, promise);
    return promise;
  }

  private async fetchPack(entryUri: string): Promise<LoadedCharacterPack> {
    const [characterJson, layersJson, compositionsJson] = await Promise.all([
      fetchJson(entryUri),
      fetchJson(resolvePackInternalUri(entryUri, "layers.json")),
      fetchJson(resolvePackInternalUri(entryUri, "compositions.json"))
    ]);
    return {
      entryUri,
      character: LayeredCharacterDefinitionSchema.parse(characterJson),
      layers: LayeredCharacterLayersSchema.parse(layersJson),
      compositions: LayeredCharacterCompositionsSchema.parse(compositionsJson)
    };
  }

  private loadMetadata(uri: string): Promise<LayeredCharacterLayerMetadata> {
    const existing = this.metadata.get(uri);
    if (existing) return existing;
    const promise = fetchJson(uri)
      .then((json) => LayeredCharacterLayerMetadataSchema.parse(json))
      .catch((error) => {
        throw new Error(`Failed to load layered character metadata ${uri}: ${formatError(error)}`);
      });
    this.metadata.set(uri, promise);
    return promise;
  }

  private loadTexture(uri: string): Promise<Texture> {
    const existing = this.textures.get(uri);
    if (existing) return existing;
    const promise = Assets.load<Texture>(uri).catch((error) => {
      throw new Error(`Failed to load layered character texture ${uri}: ${formatError(error)}`);
    });
    this.textures.set(uri, promise);
    return promise;
  }

  private emitResolveDiagnostics(characterId: string, expression: string, messages: string[], code = "layered-character-resolve-failed"): void {
    this.options.onDiagnostic?.({
      source: "asset",
      code,
      severity: "error",
      assetId: characterId,
      kind: "character-pack",
      message: `Layered character ${characterId} expression '${expression || "default"}' failed: ${messages.join(" ")}`
    });
  }

  private emitLoadFailed(characterId: string, expression: string, error: unknown): void {
    this.options.onDiagnostic?.({
      source: "asset",
      code: "asset-load-failed",
      severity: "error",
      assetId: characterId,
      kind: "character-pack",
      message: `Layered character ${characterId} expression '${expression || "default"}' failed to load character-pack asset: ${formatError(error)}`
    });
  }

  private emitInvalidTextureDimensions(
    characterId: string,
    expression: string,
    layer: ResolvedLayeredCharacterLayer,
    textureUri: string,
    texture: Texture
  ): void {
    this.options.onDiagnostic?.({
      source: "asset",
      code: "asset-invalid-texture-dimensions",
      severity: "error",
      assetId: characterId,
      kind: "character-pack",
      message: `Layered character ${characterId} expression '${expression || "default"}' layer '${layer.id}' loaded invalid texture dimensions ${texture.width}x${texture.height}: ${textureUri}`
    });
  }

  private emitInvalidSourcePixelScale(characterId: string, expression: string, message: string): void {
    this.options.onDiagnostic?.({
      source: "asset",
      code: "asset-invalid-character-source-pixel-scale",
      severity: "error",
      assetId: characterId,
      kind: "character-pack",
      message: `Layered character ${characterId} expression '${expression || "default"}' has invalid source-pixel scale: ${message}`
    });
  }
}

export class CharacterPresentation {
  readonly root: Container;
  readonly opacity: CharacterOpacityState = { value: 1 };
  private current: MountedCharacterComposition | undefined;
  private activeTransition: { outgoing: MountedCharacterComposition; incoming: MountedCharacterComposition } | undefined;
  private crossfadeIsolation?: CharacterOpacityFilter;
  private destroyed = false;

  constructor(actorId: string, private readonly options: CharacterSystemOptions) {
    this.root = new Container({ label: `final-character-root:${actorId}` });
    this.root.scale.set(options.height() / 540);
  }

  replace(instance: CharacterCompositionInstance, crossfade: boolean): CharacterContentTransition | undefined {
    this.settle();
    const next = this.mountInstance(instance);
    if (!crossfade || !this.current) {
      this.destroyInstance(this.current);
      this.root.addChild(next.container);
      this.current = next;
      this.setContentOpacity(next, 1);
      this.syncOutlineTransform();
      return undefined;
    }
    const outgoing = this.current;
    this.root.addChild(next.container);
    this.setContentOpacity(next, 0);
    this.current = next;
    const activeTransition = { outgoing, incoming: next };
    this.activeTransition = activeTransition;
    this.beginIsolatedCrossfade(activeTransition);
    this.syncOutlineTransform();
    return {
      outgoing: outgoing.opacity,
      incoming: next.opacity,
      syncOutgoing: () => this.syncInstanceOpacity(outgoing),
      syncIncoming: () => this.syncInstanceOpacity(next),
      settle: () => this.settleTransition(activeTransition)
    };
  }

  settle(): void {
    const transition = this.activeTransition;
    if (!transition) return;
    this.settleTransition(transition);
  }

  private settleTransition(transition: { outgoing: MountedCharacterComposition; incoming: MountedCharacterComposition }): void {
    if (this.activeTransition !== transition) return;
    this.setContentOpacity(transition.incoming, 1);
    this.destroyInstance(transition.outgoing);
    this.activeTransition = undefined;
    this.current = transition.incoming;
    this.endIsolatedCrossfade(transition.incoming);
    this.syncOutlineTransform();
  }

  relayout(): void {
    this.root.scale.set(this.options.height() / 540);
    this.syncOutlineTransform();
  }

  syncOpacity(): void {
    if (this.destroyed) return;
    this.root.alpha = 1;
    for (const instance of this.activeInstances()) this.syncInstanceOpacity(instance);
  }

  syncOutlineTransform(): void {
    if (this.destroyed) return;
    for (const instance of this.activeInstances()) {
      if (!instance.outline || instance.sourcePixelStep === undefined) continue;
      const matrix = instance.container.getGlobalTransform();
      const stepX = instance.outline.uniforms.uStepX;
      const stepY = instance.outline.uniforms.uStepY;
      stepX[0] = matrix.a * instance.sourcePixelStep;
      stepX[1] = matrix.b * instance.sourcePixelStep;
      stepY[0] = matrix.c * instance.sourcePixelStep;
      stepY[1] = matrix.d * instance.sourcePixelStep;
      const paddingX = Math.abs(stepX[0]) + Math.abs(stepY[0]);
      const paddingY = Math.abs(stepX[1]) + Math.abs(stepY[1]);
      instance.outline.filter.padding = Math.ceil(Math.max(paddingX, paddingY)) + 1;
    }
    this.syncCrossfadeIsolationPadding();
    this.syncOpacity();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.settle();
    this.destroyed = true;
    this.destroyInstance(this.current);
    this.current = undefined;
    this.root.filters = null;
    this.crossfadeIsolation?.filter.destroy();
    delete this.crossfadeIsolation;
    this.root.removeFromParent();
    this.root.destroy({ children: true });
  }

  private mountInstance(instance: CharacterCompositionInstance): MountedCharacterComposition {
    const mounted: MountedCharacterComposition = {
      ...instance,
      opacity: { value: 1 }
    };
    if (this.options.characterOutlineEnabled && instance.sourcePixelStep !== undefined) {
      mounted.outline = createCharacterOutlineFilter();
      mounted.container.filters = [mounted.outline.filter];
    }
    return mounted;
  }

  private activeInstances(): MountedCharacterComposition[] {
    if (this.activeTransition) return [this.activeTransition.outgoing, this.activeTransition.incoming];
    return this.current ? [this.current] : [];
  }

  private setContentOpacity(instance: MountedCharacterComposition, value: number): void {
    instance.opacity.value = value;
    this.syncInstanceOpacity(instance);
  }

  private syncInstanceOpacity(instance: MountedCharacterComposition): void {
    const opacity = this.opacity.value * instance.opacity.value;
    instance.container.alpha = 1;
    if (instance.outline) {
      instance.outline.uniforms.uOpacity = opacity;
      return;
    }
    if (this.activeTransition || opacity !== 1) {
      const opacityFilter = this.ensureOpacityFilter(instance);
      opacityFilter.uniforms.uOpacity = opacity;
      return;
    }
    this.destroyOpacityFilter(instance);
  }

  private destroyInstance(instance: MountedCharacterComposition | undefined): void {
    if (!instance || instance.container.destroyed) return;
    instance.container.filters = null;
    instance.outline?.filter.destroy();
    instance.opacityFilter?.filter.destroy();
    instance.container.removeFromParent();
    instance.container.destroy({ children: true });
  }

  private beginIsolatedCrossfade(transition: { outgoing: MountedCharacterComposition; incoming: MountedCharacterComposition }): void {
    const outgoingFilter = this.ensureOutputFilter(transition.outgoing);
    const incomingFilter = this.ensureOutputFilter(transition.incoming);
    outgoingFilter.blendMode = "normal";
    incomingFilter.blendMode = "add";
    const isolation = this.crossfadeIsolation ??= createCharacterOpacityFilter();
    isolation.uniforms.uOpacity = 1;
    isolation.filter.blendMode = "normal";
    this.root.filters = [isolation.filter];
    this.syncCrossfadeIsolationPadding();
  }

  private endIsolatedCrossfade(incoming: MountedCharacterComposition): void {
    this.root.filters = null;
    const outputFilter = this.outputFilter(incoming);
    if (outputFilter) outputFilter.filter.blendMode = "normal";
    this.syncInstanceOpacity(incoming);
  }

  private ensureOutputFilter(instance: MountedCharacterComposition): Filter {
    return this.outputFilter(instance)?.filter ?? this.ensureOpacityFilter(instance).filter;
  }

  private outputFilter(instance: MountedCharacterComposition): CharacterOutlineFilter | CharacterOpacityFilter | undefined {
    return instance.outline ?? instance.opacityFilter;
  }

  private ensureOpacityFilter(instance: MountedCharacterComposition): CharacterOpacityFilter {
    if (instance.opacityFilter) return instance.opacityFilter;
    const opacityFilter = createCharacterOpacityFilter();
    instance.opacityFilter = opacityFilter;
    instance.container.filters = [opacityFilter.filter];
    return opacityFilter;
  }

  private destroyOpacityFilter(instance: MountedCharacterComposition): void {
    if (!instance.opacityFilter) return;
    instance.container.filters = null;
    instance.opacityFilter.filter.destroy();
    delete instance.opacityFilter;
  }

  private syncCrossfadeIsolationPadding(): void {
    if (!this.activeTransition || !this.crossfadeIsolation) return;
    this.crossfadeIsolation.filter.padding = Math.max(
      this.outputFilter(this.activeTransition.outgoing)?.filter.padding ?? 0,
      this.outputFilter(this.activeTransition.incoming)?.filter.padding ?? 0
    );
  }
}

function createCharacterOutlineFilter(): CharacterOutlineFilter {
  const filter = new Filter({
    glProgram: characterOutlineGlProgram ??= GlProgram.from({
      vertex: CHARACTER_FILTER_VERTEX,
      fragment: CHARACTER_OUTLINE_FRAGMENT,
      name: "v-ronpa-character-source-pixel-outline"
    }),
    resources: {
      characterOutlineUniforms: {
        uStepX: { value: new Float32Array([1, 0]), type: "vec2<f32>" },
        uStepY: { value: new Float32Array([0, 1]), type: "vec2<f32>" },
        uOpacity: { value: 1, type: "f32" }
      }
    },
    resolution: "inherit",
    antialias: "inherit",
    padding: 2
  });
  return {
    filter,
    uniforms: filter.resources.characterOutlineUniforms.uniforms as CharacterOutlineUniformValues
  };
}

function createCharacterOpacityFilter(): CharacterOpacityFilter {
  const filter = new Filter({
    glProgram: characterOpacityGlProgram ??= GlProgram.from({
      vertex: CHARACTER_FILTER_VERTEX,
      fragment: CHARACTER_OPACITY_FRAGMENT,
      name: "v-ronpa-character-final-opacity"
    }),
    resources: {
      characterOpacityUniforms: {
        uOpacity: { value: 1, type: "f32" }
      }
    },
    resolution: "inherit",
    antialias: "inherit",
    padding: 0
  });
  return {
    filter,
    uniforms: filter.resources.characterOpacityUniforms.uniforms as CharacterOpacityUniformValues
  };
}

function createLayerComposition(
  textures: PreparedCharacterTexture[],
  frame: CharacterRenderFrame,
  label: string
): Container {
  const composition = new Container({ label });
  composition.sortableChildren = true;
  for (const { layer, texture } of textures) {
    const sprite = new Sprite(texture);
    applyLayerRenderParameters(sprite, layer, frame);
    composition.addChild(sprite);
  }
  return composition;
}

function emptyCharacterContainer(characterId: string, expression: string): Container {
  return new Container({ label: `empty-character:${characterId}:${expression || "default"}` });
}

function characterResultKey(characterId: string, expression: string): string {
  return `${characterId}\u0000${expression.trim()}`;
}

function characterRenderFrame(pack: LoadedCharacterPack): CharacterRenderFrame {
  const [anchorX, anchorY] = pack.character.renderSpace.characterAnchor;
  return { anchorX, anchorY, stageScale: pack.character.renderSpace.stageScale };
}

function applyLayerRenderParameters(sprite: Sprite, layer: ResolvedLayeredCharacterLayer, frame: CharacterRenderFrame): void {
  const { localTransform, renderer, sprite: spriteMeta } = layer.metadata;
  const scaleX = localTransform.scale.x * frame.stageScale / spriteMeta.pixelsPerUnit;
  const scaleY = localTransform.scale.y * frame.stageScale / spriteMeta.pixelsPerUnit;
  sprite.anchor.set(spriteMeta.pivot.x, spriteMeta.pivot.y);
  sprite.position.set(
    (localTransform.position.x - frame.anchorX) * frame.stageScale,
    -(localTransform.position.y - frame.anchorY) * frame.stageScale
  );
  sprite.scale.set(renderer.flipX ? -scaleX : scaleX, renderer.flipY ? -scaleY : scaleY);
  sprite.rotation = -(localTransform.rotation.z * Math.PI) / 180;
  sprite.tint = rgbToHex(renderer.color.r, renderer.color.g, renderer.color.b);
  sprite.alpha = renderer.color.a;
  sprite.zIndex = layer.metadata.drawOrder;
}

function hasPositiveTextureDimensions(texture: Texture): boolean {
  return Number.isFinite(texture.width) && Number.isFinite(texture.height) && texture.width > 0 && texture.height > 0;
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
