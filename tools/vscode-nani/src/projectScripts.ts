import { statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  discoverNaniProjectScripts,
  NaniProjectDiscoveryError,
  parseNaniProjectConfig,
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
  readonly projectRoot: string;
  readonly project: NaniProjectConfig;
  readonly catalogId: "development" | "test";
  readonly scopes: readonly NaniScope[];
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
        projectRoot,
        project: naniProject,
        catalogId: "development",
        scopes: ["production", "development"],
        entries: [naniProject.mainEntry],
        scripts: developmentScripts
      });
    }
    const testScripts = registrations.filter((script) => script.scope === "test");
    const testEntries = Object.values(naniProject.testEntries);
    if (testScripts.length > 0 && testEntries.length > 0) {
      catalogs.push({
        configPath,
        projectRoot,
        project: naniProject,
        catalogId: "test",
        scopes: ["test"],
        entries: testEntries,
        scripts: testScripts
      });
    }
    return {
      configPath,
      catalogs,
      scopeRoots: Object.values(naniProject.scopes).flatMap((scope) =>
        scope ? [resolve(projectRoot, scope.sourceRoot)] : []
      ),
      errors: [],
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

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}
