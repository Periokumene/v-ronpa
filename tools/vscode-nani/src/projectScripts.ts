import { existsSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseStaticNaniEndpoint } from "@v-ronpa/nani-parser";
import { findNaniProjectRoot } from "./projectAssetLoader";

export interface NaniScriptRegistration {
  readonly sourcePath: string;
  readonly scriptPath: string;
}

export interface NaniScriptCatalogContext {
  readonly configPath: string;
  readonly catalogId: "production" | `test:${string}`;
  readonly entry: {
    readonly initialScriptPath: string;
    readonly startLabel?: string;
  };
  readonly scripts: readonly NaniScriptRegistration[];
}

export interface NaniProjectScriptConfig {
  readonly configPath: string;
  readonly catalogs: readonly NaniScriptCatalogContext[];
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export type ProjectScriptConfigImporter = (configPath: string) => Promise<unknown>;

export async function loadProjectScriptConfig(
  configPath: string,
  workspaceRoot: string,
  importConfig: ProjectScriptConfigImporter = importProjectConfig
): Promise<NaniProjectScriptConfig> {
  const projectRoot = findNaniProjectRoot(configPath, workspaceRoot);
  const moduleValue = record(await importConfig(configPath), "Asset config module must export an object.");
  const config = record(moduleValue.default, "Asset config module must have a default object export.");
  const candidates: Array<{
    catalogId: NaniScriptCatalogContext["catalogId"];
    value: Record<string, unknown>;
  }> = [];
  if (config.scripts !== undefined || config.entry !== undefined) {
    candidates.push({ catalogId: "production", value: config });
  }
  if (config.testCatalogs !== undefined) {
    const testCatalogs = record(config.testCatalogs, "testCatalogs must be an object.");
    for (const name of Object.keys(testCatalogs).sort()) {
      candidates.push({
        catalogId: `test:${name}`,
        value: record(testCatalogs[name], `testCatalogs.${name} must be an object.`)
      });
    }
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const catalogs: NaniScriptCatalogContext[] = [];
  const physicalOwners = new Map<
    string,
    Array<{
      catalogId: NaniScriptCatalogContext["catalogId"];
      scriptPath: string;
    }>
  >();

  for (const candidate of candidates) {
    const parsed = parseCatalog(candidate.catalogId, candidate.value, configPath, projectRoot, workspaceRoot);
    errors.push(...parsed.errors);
    warnings.push(...parsed.warnings);
    if (!parsed.catalog) continue;
    catalogs.push(parsed.catalog);
    for (const script of parsed.catalog.scripts) {
      const owners = physicalOwners.get(script.sourcePath) ?? [];
      owners.push({ catalogId: candidate.catalogId, scriptPath: script.scriptPath });
      physicalOwners.set(script.sourcePath, owners);
    }
  }

  const conflictingCatalogs = new Set<NaniScriptCatalogContext["catalogId"]>();
  for (const [sourcePath, owners] of physicalOwners) {
    if (owners.length < 2) continue;
    for (const owner of owners) conflictingCatalogs.add(owner.catalogId);
    errors.push(
      `Nani source '${sourcePath}' is registered more than once (${owners
        .map((owner) => `${owner.catalogId}:${owner.scriptPath}`)
        .join(", ")}).`
    );
  }

  return {
    configPath,
    catalogs: catalogs.filter((catalog) => !conflictingCatalogs.has(catalog.catalogId)),
    errors,
    warnings
  };
}

function parseCatalog(
  catalogId: NaniScriptCatalogContext["catalogId"],
  value: Record<string, unknown>,
  configPath: string,
  projectRoot: string,
  workspaceRoot: string
): {
  catalog?: NaniScriptCatalogContext;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entries = array(value.scripts, `${catalogId}.scripts must be an array.`, errors);
  if (!entries) return { errors, warnings };
  const entryValue = optionalRecord(value.entry, `${catalogId}.entry must be an object.`, errors);
  if (!entryValue) {
    errors.push(`${catalogId}.entry is required when scripts are registered.`);
    return { errors, warnings };
  }
  const initialScriptPath = requiredString(
    entryValue.initialScriptPath,
    `${catalogId}.entry.initialScriptPath`,
    errors
  );
  const startLabel = optionalString(
    entryValue.startLabel,
    `${catalogId}.entry.startLabel`,
    errors
  );
  const scripts: NaniScriptRegistration[] = [];
  const logicalPaths = new Set<string>();
  let unsupported = false;

  for (const [index, rawEntry] of entries.entries()) {
    const prefix = `${catalogId}.scripts[${index}]`;
    const entry = optionalRecord(rawEntry, `${prefix} must be an object.`, errors);
    if (!entry) continue;
    const sourceFile = requiredString(entry.sourceFile, `${prefix}.sourceFile`, errors);
    const scriptPath = requiredString(entry.scriptPath, `${prefix}.scriptPath`, errors);
    if (!sourceFile || !scriptPath) continue;
    if (entry.sourceFormat !== undefined || extname(sourceFile).toLowerCase() !== ".nani") {
      unsupported = true;
      continue;
    }
    const endpoint = parseStaticNaniEndpoint(scriptPath, scriptPath);
    if (!endpoint.ok || scriptPath.includes("#")) {
      errors.push(`${prefix}.scriptPath '${scriptPath}' is not a valid logical .nani path.`);
      continue;
    }
    if (logicalPaths.has(scriptPath)) {
      errors.push(`${catalogId} registers logical script path '${scriptPath}' more than once.`);
      continue;
    }
    logicalPaths.add(scriptPath);
    const sourcePath = isAbsolute(sourceFile)
      ? resolve(sourceFile)
      : resolve(projectRoot, sourceFile);
    if (!isWithin(workspaceRoot, sourcePath)) {
      errors.push(`${prefix}.sourceFile resolves outside the trusted workspace: '${sourcePath}'.`);
      continue;
    }
    if (!existsSync(sourcePath)) {
      errors.push(`${prefix}.sourceFile does not exist: '${sourcePath}'.`);
      continue;
    }
    scripts.push({ sourcePath, scriptPath });
  }

  if (unsupported) {
    warnings.push(
      `${catalogId} contains non-.nani or sourceFormat-backed scripts and is not indexed by VS Code Nani 0.6.0.`
    );
    return { errors, warnings };
  }
  if (!initialScriptPath) return { errors, warnings };
  if (!logicalPaths.has(initialScriptPath)) {
    errors.push(
      `${catalogId}.entry.initialScriptPath '${initialScriptPath}' is not registered in that catalog.`
    );
  }
  if (errors.length > 0) return { errors, warnings };
  return {
    catalog: {
      configPath,
      catalogId,
      entry: {
        initialScriptPath,
        ...(startLabel ? { startLabel } : {})
      },
      scripts
    },
    errors,
    warnings
  };
}

async function importProjectConfig(configPath: string): Promise<unknown> {
  const url = pathToFileURL(configPath);
  url.searchParams.set("vscodeNaniScriptsMtime", String(statSync(configPath).mtimeMs));
  return import(url.href);
}

function array(value: unknown, message: string, errors: string[]): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  errors.push(message);
  return undefined;
}

function optionalRecord(
  value: unknown,
  message: string,
  errors: string[]
): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  errors.push(message);
  return undefined;
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, name: string, errors: string[]): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  errors.push(`${name} must be a non-empty string.`);
  return undefined;
}

function optionalString(value: unknown, name: string, errors: string[]): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, name, errors);
}

function isWithin(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
