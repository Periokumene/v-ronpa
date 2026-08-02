import { statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  discoverNaniProjectScripts,
  NaniProjectDiscoveryError,
  type NaniEntryConfig,
  type NaniProjectConfig,
  type NaniScope
} from "@v-ronpa/nani-project";
import { findNaniProjectRoot } from "./projectAssetLoader";

export interface NaniScriptRegistration {
  readonly scope: NaniScope;
  readonly sourcePath: string;
  readonly scriptPath: string;
}

export interface NaniScriptCatalogContext {
  readonly configPath: string;
  readonly catalogId: "development" | "test";
  readonly entry: {
    readonly initialScriptPath: string;
    readonly startLabel?: string;
  };
  readonly entries: readonly NaniEntryConfig[];
  readonly scripts: readonly NaniScriptRegistration[];
}

export interface NaniProjectScriptConfig {
  readonly configPath: string;
  readonly catalogs: readonly NaniScriptCatalogContext[];
  readonly scopeRoots: readonly string[];
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
  try {
    const moduleValue = record(await importConfig(configPath), "Asset config module must export an object.");
    const assetConfig = record(moduleValue.default, "Asset config module must have a default object export.");
    const naniProject = parseNaniProjectConfig(assetConfig.naniProject);
    const discovered = await discoverNaniProjectScripts(naniProject, { projectRoot });
    const registrations = discovered.map((script) => ({
      scope: script.scope,
      sourcePath: script.sourcePath,
      scriptPath: script.scriptPath
    }));
    const catalogs: NaniScriptCatalogContext[] = [];
    const developmentScripts = registrations.filter((script) =>
      script.scope === "production" || script.scope === "development"
    );
    if (developmentScripts.length > 0) {
      catalogs.push({
        configPath,
        catalogId: "development",
        entry: entryLocator(naniProject.mainEntry),
        entries: [naniProject.mainEntry],
        scripts: developmentScripts
      });
    }
    const testScripts = registrations.filter((script) => script.scope === "test");
    const testEntries = Object.values(naniProject.testEntries);
    if (testScripts.length > 0 && testEntries.length > 0) {
      catalogs.push({
        configPath,
        catalogId: "test",
        entry: entryLocator(testEntries[0]!),
        entries: testEntries,
        scripts: testScripts
      });
    }
    const errors = catalogs.flatMap((catalog) => catalog.entries.flatMap((entry) =>
      catalog.scripts.some((script) => script.scriptPath === entry.initialScriptPath)
        ? []
        : [`Entry '${entry.id}' initial script '${entry.initialScriptPath}' is missing from the ${catalog.catalogId} catalog.`]
    ));
    return {
      configPath,
      catalogs,
      scopeRoots: Object.values(naniProject.scopes).flatMap((scope) =>
        scope ? [resolve(projectRoot, scope.sourceRoot)] : []
      ),
      errors,
      warnings: []
    };
  } catch (error) {
    return {
      configPath,
      catalogs: [],
      scopeRoots: [],
      errors: error instanceof NaniProjectDiscoveryError
        ? error.diagnostics.map((diagnostic) => diagnostic.message)
        : [error instanceof Error ? error.message : String(error)],
      warnings: []
    };
  }
}

async function importProjectConfig(configPath: string): Promise<unknown> {
  const url = pathToFileURL(configPath);
  url.searchParams.set("vscodeNaniScriptsMtime", String(statSync(configPath).mtimeMs));
  return import(url.href);
}

function parseNaniProjectConfig(value: unknown): NaniProjectConfig {
  const project = record(value, "asset.config.mjs must declare naniProject.");
  const scopesValue = record(project.scopes, "naniProject.scopes must be an object.");
  const scopes: NaniProjectConfig["scopes"] = {};
  for (const scope of ["production", "development", "test"] as const) {
    if (scopesValue[scope] === undefined) continue;
    const scopeValue = record(scopesValue[scope], `naniProject.scopes.${scope} must be an object.`);
    scopes[scope] = {
      sourceRoot: stringValue(scopeValue.sourceRoot, `naniProject.scopes.${scope}.sourceRoot`),
      scriptRoot: stringValue(scopeValue.scriptRoot, `naniProject.scopes.${scope}.scriptRoot`)
    };
  }
  const testEntriesValue = record(project.testEntries, "naniProject.testEntries must be an object.");
  const testEntries = Object.fromEntries(Object.entries(testEntriesValue).map(([name, entry]) => [
    name,
    parseEntry(entry, "test", `naniProject.testEntries.${name}`)
  ]));
  if (!Array.isArray(project.voiceLocales) || !project.voiceLocales.every((item) => typeof item === "string")) {
    throw new Error("naniProject.voiceLocales must be a string array.");
  }
  return {
    scopes,
    mainEntry: parseEntry(project.mainEntry, "production", "naniProject.mainEntry"),
    testEntries,
    voiceLocales: project.voiceLocales
  };
}

function parseEntry(value: unknown, scope: "production" | "test", name: string): NaniEntryConfig {
  const entry = record(value, `${name} must be an object.`);
  if (entry.scope !== scope) throw new Error(`${name}.scope must be '${scope}'.`);
  const startLabel = entry.startLabel === undefined
    ? undefined
    : stringValue(entry.startLabel, `${name}.startLabel`);
  return {
    id: stringValue(entry.id, `${name}.id`),
    scope,
    initialScriptPath: stringValue(entry.initialScriptPath, `${name}.initialScriptPath`),
    ...(startLabel ? { startLabel } : {})
  };
}

function entryLocator(entry: NaniEntryConfig) {
  return {
    initialScriptPath: entry.initialScriptPath,
    ...(entry.startLabel ? { startLabel: entry.startLabel } : {})
  };
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a non-empty string.`);
  return value;
}
