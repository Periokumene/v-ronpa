import { ContentManifestSchema, type AssetRef, type ContentManifest, type RuntimeAsset, type RuntimeAssetKind } from "@v-ronpa/contracts";

export type AssetRegistryDiagnosticCode =
  | "manifest-version-unsupported"
  | "manifest-invalid"
  | "duplicate-runtime-asset"
  | "asset-missing"
  | "asset-kind-mismatch"
  | "raw-uri-disallowed";

export interface AssetRegistryDiagnostic {
  code: AssetRegistryDiagnosticCode;
  severity: "warning" | "error";
  message: string;
  id?: string;
  kind?: RuntimeAssetKind;
}

export interface AssetResolveInput {
  id: string;
  kind?: RuntimeAssetKind;
}

export interface AssetResolveResult {
  asset?: RuntimeAsset;
  uri?: string;
  diagnostic?: AssetRegistryDiagnostic;
}

export interface AssetResolver {
  resolve(input: AssetResolveInput): AssetResolveResult;
}

export interface AssetRegistry extends AssetResolver {
  diagnostics: AssetRegistryDiagnostic[];
  require(input: AssetResolveInput): RuntimeAsset;
  url(input: AssetResolveInput): string | undefined;
  validateReferences(): AssetRegistryDiagnostic[];
}

const rawUriPattern = /^(\/|\.\/|\.\.\/|https?:\/\/|data:|blob:)/u;

export function createAssetRegistry(manifestInput: unknown): AssetRegistry {
  const diagnostics: AssetRegistryDiagnostic[] = [];
  const inputVersion = manifestVersion(manifestInput);
  if (inputVersion !== 2) {
    diagnostics.push({
      code: "manifest-version-unsupported",
      severity: "error",
      message: `ContentManifest version ${String(inputVersion)} is not supported by AssetRegistry.`
    });
  }

  const parsed = ContentManifestSchema.safeParse(manifestInput);
  const manifest = parsed.success ? parsed.data : createEmptyManifest();
  if (!parsed.success) {
    diagnostics.push({
      code: "manifest-invalid",
      severity: "error",
      message: `ContentManifest is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`).join("; ")}`
    });
  }

  const runtimeAssets = new Map<string, RuntimeAsset>();
  for (const asset of manifest.runtimeAssets) {
    const previous = runtimeAssets.get(asset.id);
    if (previous) {
      diagnostics.push({
        code: "duplicate-runtime-asset",
        severity: "error",
        id: asset.id,
        kind: asset.kind,
        message: `Runtime asset '${asset.id}' is declared more than once.`
      });
      continue;
    }
    runtimeAssets.set(asset.id, asset);
  }

  function resolve(input: AssetResolveInput): AssetResolveResult {
    if (isRawAssetReference(input.id)) {
      return {
        diagnostic: {
          code: "raw-uri-disallowed",
          severity: "error",
          id: input.id,
          ...(input.kind ? { kind: input.kind } : {}),
          message: `Raw asset URI '${input.id}' is not allowed; use a ContentManifest runtime asset id.`
        }
      };
    }

    const asset = runtimeAssets.get(input.id);
    if (!asset) {
      return {
        diagnostic: {
          code: "asset-missing",
          severity: "error",
          id: input.id,
          ...(input.kind ? { kind: input.kind } : {}),
          message: `Runtime asset '${input.id}' is not declared in ContentManifest.runtimeAssets.`
        }
      };
    }

    if (input.kind && asset.kind !== input.kind) {
      return {
        asset,
        diagnostic: {
          code: "asset-kind-mismatch",
          severity: "error",
          id: input.id,
          kind: input.kind,
          message: `Runtime asset '${input.id}' is '${asset.kind}', not '${input.kind}'.`
        }
      };
    }

    return { asset, uri: asset.optimizedUri };
  }

  return {
    diagnostics,
    resolve,
    require(input) {
      const result = resolve(input);
      if (result.asset && result.uri) return result.asset;
      throw new Error(result.diagnostic?.message ?? `Runtime asset '${input.id}' could not be resolved.`);
    },
    url(input) {
      return resolve(input).uri;
    },
    validateReferences() {
      return [...diagnostics, ...validateManifestAssetReferences(manifest, { resolve })];
    }
  };
}

export function isRawAssetReference(id: string): boolean {
  return rawUriPattern.test(id);
}

export function validateManifestAssetReferences(
  manifest: ContentManifest,
  resolver: AssetResolver = createAssetRegistry(manifest)
): AssetRegistryDiagnostic[] {
  const diagnostics: AssetRegistryDiagnostic[] = [];
  for (const ref of collectManifestAssetReferences(manifest)) {
    const result = resolver.resolve({ id: ref.id, kind: ref.kind });
    if (result.diagnostic) diagnostics.push(result.diagnostic);
  }
  return diagnostics;
}

export function collectManifestAssetReferences(manifest: ContentManifest): AssetRef[] {
  const refs: AssetRef[] = [...manifest.assets];

  const dialogueBleep = manifest.audio?.dialogueBleep;
  if (dialogueBleep?.defaultSound) {
    refs.push({ id: dialogueBleep.defaultSound.sourceRef, kind: "bleep", tags: [] });
  }
  for (const sound of Object.values(dialogueBleep?.speakerOverrides ?? {})) {
    if (sound) refs.push({ id: sound.sourceRef, kind: "bleep", tags: [] });
  }

  for (const uiAsset of manifest.uiAssets) {
    refs.push({ id: uiAsset.assetId, kind: "texture", tags: uiAsset.tags });
  }
  for (const profile of manifest.interactionStyles) {
    for (const uiAsset of profile.assets) refs.push({ id: uiAsset.assetId, kind: "texture", tags: uiAsset.tags });
  }
  for (const map of manifest.maps) {
    refs.push(...map.assetRefs);
  }
  for (const evidence of manifest.evidence) {
    if (evidence.visual.iconAssetId) refs.push({ id: evidence.visual.iconAssetId, kind: "texture", tags: evidence.tags });
    if (evidence.visual.thumbnailAssetId) refs.push({ id: evidence.visual.thumbnailAssetId, kind: "texture", tags: evidence.tags });
  }
  for (const proxy of manifest.collisionProxies) {
    if (proxy.assetId) refs.push({ id: proxy.assetId, kind: "glb", tags: [] });
  }

  return refs;
}

function manifestVersion(input: unknown): unknown {
  if (!input || typeof input !== "object") return undefined;
  return (input as { version?: unknown }).version;
}

function createEmptyManifest(): ContentManifest {
  return {
    version: 2,
    assets: [],
    uiAssets: [],
    interactionStyles: [],
    runtimeAssets: [],
    collisionProxies: [],
    maps: [],
    items: [],
    evidence: [],
    trials: []
  };
}
