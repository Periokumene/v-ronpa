import type { AssetRequirement } from "@v-ronpa/contracts";

export type PixiAssetResolveInput = AssetRequirement;

export interface PixiAssetResolveResult {
  uri?: string;
  diagnostic?: {
    code?: string;
    severity?: "info" | "warning" | "error";
    message: string;
  };
}

export interface PixiAssetResolver {
  resolve(input: PixiAssetResolveInput): PixiAssetResolveResult;
}

export interface PixiPresenterDiagnostic {
  source: "asset";
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  assetId?: string;
  capability?: AssetRequirement["capability"];
}

export function resolvePixiAsset(
  resolver: PixiAssetResolver | undefined,
  input: PixiAssetResolveInput,
  onDiagnostic?: (diagnostic: PixiPresenterDiagnostic) => void
): string | undefined {
  if (!resolver) {
    onDiagnostic?.({
      source: "asset",
      code: "asset-resolver-missing",
      severity: "error",
      assetId: input.id,
      capability: input.capability,
      message: `Pixi asset '${input.id}' (${input.capability}) could not be resolved because no AssetResolver was provided.`
    });
    return undefined;
  }
  const resolved = resolver.resolve(input);
  if (resolved.uri) return resolved.uri;
  onDiagnostic?.({
    source: "asset",
    code: resolved.diagnostic?.code ?? "asset-missing",
    severity: resolved.diagnostic?.severity ?? "error",
    assetId: input.id,
    capability: input.capability,
    message: resolved.diagnostic?.message ?? `Pixi asset '${input.id}' (${input.capability}) could not be resolved.`
  });
  return undefined;
}

export function pixiAssetLoadFailed(input: PixiAssetResolveInput, error: unknown): PixiPresenterDiagnostic {
  return {
    source: "asset",
    code: "asset-load-failed",
    severity: "error",
    assetId: input.id,
    capability: input.capability,
    message: `Pixi asset '${input.id}' (${input.capability}) failed to load: ${error instanceof Error ? error.message : String(error)}`
  };
}
