import {
  AssetIdSchema,
  ContentManifestSchema,
  type AssetCapability,
  type AssetDefinition,
  type AssetId,
  type AssetRequirement,
  type ContentManifest
} from "@v-ronpa/contracts";

export type AssetRegistryDiagnosticCode =
  | "manifest-version-unsupported"
  | "manifest-invalid"
  | "duplicate-asset"
  | "invalid-asset-id"
  | "asset-missing"
  | "asset-capability-mismatch"
  | "raw-uri-disallowed";

export interface AssetRegistryDiagnostic {
  code: AssetRegistryDiagnosticCode;
  severity: "warning" | "error";
  message: string;
  id?: string;
  capability?: AssetCapability;
}

export interface AssetResolveResult {
  asset?: AssetDefinition;
  uri?: string;
  diagnostic?: AssetRegistryDiagnostic;
}

export interface AssetResolver {
  resolve(requirement: AssetRequirement): AssetResolveResult;
}

export interface AssetRegistry extends AssetResolver {
  diagnostics: AssetRegistryDiagnostic[];
  require(requirement: AssetRequirement): AssetDefinition;
  url(requirement: AssetRequirement): string | undefined;
  validateReferences(): AssetRegistryDiagnostic[];
}

export interface CreateAssetRegistryOptions {
  baseUri?: string;
}

const rawUriPattern = /^(\/|\.\/|\.\.\/|https?:\/\/|data:|blob:)/u;

export function createAssetRegistry(
  manifestInput: unknown,
  { baseUri = "/" }: CreateAssetRegistryOptions = {}
): AssetRegistry {
  const diagnostics: AssetRegistryDiagnostic[] = [];
  const inputVersion = manifestVersion(manifestInput);
  if (inputVersion !== 5) {
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
      message: `ContentManifest is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
        .join("; ")}`
    });
  }

  const assets = new Map<AssetId, AssetDefinition>();
  for (const asset of manifest.assets) {
    if (assets.has(asset.id)) {
      diagnostics.push({
        code: "duplicate-asset",
        severity: "error",
        id: asset.id,
        message: `Asset '${asset.id}' is declared more than once.`
      });
      continue;
    }
    assets.set(asset.id, asset);
  }

  function resolve(requirement: AssetRequirement): AssetResolveResult {
    if (isRawAssetReference(requirement.id)) {
      return {
        diagnostic: {
          code: "raw-uri-disallowed",
          severity: "error",
          id: requirement.id,
          capability: requirement.capability,
          message: `Raw asset URI '${requirement.id}' is not allowed; use an App AssetId.`
        }
      };
    }
    const validId = AssetIdSchema.safeParse(requirement.id);
    if (!validId.success) {
      return {
        diagnostic: {
          code: "invalid-asset-id",
          severity: "error",
          id: requirement.id,
          capability: requirement.capability,
          message: `Asset id '${requirement.id}' is not a lowercase kebab path relative to assets/.`
        }
      };
    }

    const asset = assets.get(validId.data);
    if (!asset) {
      return {
        diagnostic: {
          code: "asset-missing",
          severity: "error",
          id: requirement.id,
          capability: requirement.capability,
          message: `Asset '${requirement.id}' is not declared in ContentManifest.assets.`
        }
      };
    }
    if (!mimeSupportsCapability(asset.mimeType, requirement.capability)) {
      return {
        asset,
        diagnostic: {
          code: "asset-capability-mismatch",
          severity: "error",
          id: requirement.id,
          capability: requirement.capability,
          message: `Asset '${requirement.id}' uses MIME '${asset.mimeType}', which does not support '${requirement.capability}'.`
        }
      };
    }
    return { asset, uri: resolveDistributionUri(baseUri, asset.uri) };
  }

  return {
    diagnostics,
    resolve,
    require(requirement) {
      const result = resolve(requirement);
      if (result.asset && result.uri) return result.asset;
      throw new Error(result.diagnostic?.message ?? `Asset '${requirement.id}' could not be resolved.`);
    },
    url(requirement) {
      return resolve(requirement).uri;
    },
    validateReferences() {
      return [...diagnostics, ...validateManifestAssetRequirements(manifest, { resolve })];
    }
  };
}

export function isRawAssetReference(id: string): boolean {
  return rawUriPattern.test(id);
}

export function mimeSupportsCapability(mimeType: string, capability: AssetCapability): boolean {
  if (capability === "json") return mimeType === "application/json";
  return mimeType.startsWith(`${capability}/`);
}

export function validateManifestAssetRequirements(
  manifest: ContentManifest,
  resolver: AssetResolver = createAssetRegistry(manifest)
): AssetRegistryDiagnostic[] {
  return collectManifestAssetRequirements(manifest).flatMap((requirement) => {
    const result = resolver.resolve(requirement);
    return result.diagnostic ? [result.diagnostic] : [];
  });
}

export function collectManifestAssetRequirements(manifest: ContentManifest): AssetRequirement[] {
  const requirements: AssetRequirement[] = [...manifest.requirements];
  const dialogueBleep = manifest.audio?.dialogueBleep;
  if (dialogueBleep?.defaultSound) {
    requirements.push({ id: dialogueBleep.defaultSound.assetId, capability: "audio" });
  }
  for (const sound of Object.values(dialogueBleep?.speakerOverrides ?? {})) {
    if (sound) requirements.push({ id: sound.assetId, capability: "audio" });
  }
  for (const font of manifest.fonts) {
    if (font.source.type === "asset") requirements.push({ id: font.source.assetId, capability: "font" });
  }
  for (const entry of manifest.vnEntries) requirements.push(...entry.requirements);
  for (const map of manifest.maps) requirements.push(...map.requirements);
  for (const evidence of manifest.evidence) {
    if (evidence.visual.iconAssetId) requirements.push({ id: evidence.visual.iconAssetId, capability: "image" });
    if (evidence.visual.thumbnailAssetId) requirements.push({ id: evidence.visual.thumbnailAssetId, capability: "image" });
  }
  for (const proxy of manifest.collisionProxies) {
    if (proxy.assetId) requirements.push({ id: proxy.assetId, capability: "model" });
  }
  return dedupeRequirements(requirements);
}

function dedupeRequirements(requirements: readonly AssetRequirement[]): AssetRequirement[] {
  const unique = new Map<string, AssetRequirement>();
  for (const requirement of requirements) {
    unique.set(`${requirement.capability}:${requirement.id}`, requirement);
  }
  return [...unique.values()].sort((left, right) =>
    left.id.localeCompare(right.id) || left.capability.localeCompare(right.capability)
  );
}

function resolveDistributionUri(baseUri: string, uri: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//u.test(baseUri)) {
    return new URL(uri, baseUri.endsWith("/") ? baseUri : `${baseUri}/`).href;
  }
  const base = `/${baseUri.replace(/^\/+|\/+$/gu, "")}`.replace(/^\/$/u, "");
  return `${base}/${uri.replace(/^\/+/, "")}` || "/";
}

function manifestVersion(input: unknown): unknown {
  if (!input || typeof input !== "object") return undefined;
  return (input as { version?: unknown }).version;
}

function createEmptyManifest(): ContentManifest {
  return {
    version: 5,
    assets: [],
    requirements: [],
    fonts: [],
    collisionProxies: [],
    vnEntries: [],
    maps: [],
    items: [],
    evidence: [],
    trials: []
  };
}
