import { relative, resolve, sep } from "node:path";
import {
  analyzeNaniCatalog,
  parseNaniProjectConfig,
  type NaniEntryConfig,
  type NaniAssetBindings,
  type NaniProjectConfig,
  type NaniScope
} from "@v-ronpa/nani-project";
import type { Plugin, ViteDevServer } from "vite";
import {
  NANI_DEVTOOLS_VITE_CATALOG_DIRTY_EVENT,
  NANI_DEVTOOLS_VITE_SNAPSHOT_MODULE_ID,
  NANI_DEVTOOLS_VITE_UPDATE_EVENT,
  type NaniDevtoolsDiscoveredSource,
  type NaniDevtoolsViteCatalogDirty,
  type NaniDevtoolsViteDiagnostic,
  type NaniDevtoolsViteSnapshot,
  type NaniDevtoolsViteUpdate
} from "@v-ronpa/app-vn-devtools/vite-protocol";

export {
  NANI_DEVTOOLS_VITE_CATALOG_DIRTY_EVENT,
  NANI_DEVTOOLS_VITE_SNAPSHOT_MODULE_ID,
  NANI_DEVTOOLS_VITE_UPDATE_EVENT
} from "@v-ronpa/app-vn-devtools/vite-protocol";
export type {
  NaniDevtoolsDiscoveredSource,
  NaniDevtoolsViteCatalogDirty,
  NaniDevtoolsViteDiagnostic,
  NaniDevtoolsViteSnapshot,
  NaniDevtoolsViteUpdate
} from "@v-ronpa/app-vn-devtools/vite-protocol";

const RESOLVED_SNAPSHOT_MODULE_ID = `\0${NANI_DEVTOOLS_VITE_SNAPSHOT_MODULE_ID}`;

export interface NaniDevtoolsVitePluginOptions {
  project: NaniProjectConfig;
  entry: NaniEntryConfig;
  scopes: readonly NaniScope[];
  assetBindings: NaniAssetBindings | Promise<NaniAssetBindings>;
  /** Base path for project-relative source roots. Defaults to process.cwd(). */
  root?: string;
}

/**
 * Vite-only source bridge. Membership is always rescanned through nani-project;
 * this plugin owns only the page-refresh dirty boundary and monotonic HMR IDs.
 */
export function createNaniDevtoolsVitePlugin(options: NaniDevtoolsVitePluginOptions): Plugin {
  const projectRoot = resolve(options.root ?? process.cwd());
  const project = parseNaniProjectConfig(options.project);
  const resolvedOptions = { ...options, project };
  const scopeRoots = options.scopes.flatMap((scope) => {
    const config = project.scopes[scope];
    return config ? [resolve(projectRoot, config.sourceRoot)] : [];
  });
  let updateId = 0;
  let generation = 0;
  let serve = false;
  let catalogDirty = false;
  let lastSnapshot: NaniDevtoolsViteSnapshot | undefined;
  let sourceFilesByPath = new Map<string, string>();
  let server: ViteDevServer | undefined;

  const invalidateSnapshot = () => {
    const module = server?.moduleGraph.getModuleById(RESOLVED_SNAPSHOT_MODULE_ID);
    if (module) server?.moduleGraph.invalidateModule(module);
  };
  const markCatalogDirty = (reason: NaniDevtoolsViteCatalogDirty["reason"]) => {
    if (!serve || catalogDirty) return;
    catalogDirty = true;
    invalidateSnapshot();
    server?.ws.send({
      type: "custom",
      event: NANI_DEVTOOLS_VITE_CATALOG_DIRTY_EVENT,
      data: { generation, reason } satisfies NaniDevtoolsViteCatalogDirty
    });
  };

  return {
    name: "v-ronpa-nani-devtools",
    configResolved(config) {
      serve = config.command === "serve";
    },
    async buildStart() {
      if (serve) return;
      const analysis = await analyzeNaniCatalog(project, {
        projectRoot,
        scopes: options.scopes,
        entries: [options.entry],
        assetBindings: await options.assetBindings,
        sourceDiagnosticPolicy: "strict"
      });
      const fatal = analysis.diagnostics.filter((diagnostic) => diagnostic.disposition === "fatal");
      if (fatal.length > 0) {
        this.error(fatal.map((diagnostic) =>
          `${diagnostic.scriptPath ?? "catalog"}: ${diagnostic.message}`
        ).join("\n"));
      }
    },
    configureServer(viteServer) {
      server = viteServer;
      const handleAdd = (file: string) => {
        if (isManagedNaniPath(file, scopeRoots) && !sourceFilesByPath.has(normalizeAbsolutePath(file))) {
          markCatalogDirty("add");
        }
      };
      const handleUnlink = (file: string) => {
        if (sourceFilesByPath.has(normalizeAbsolutePath(file))) markCatalogDirty("unlink");
      };
      viteServer.watcher.on("add", handleAdd);
      viteServer.watcher.on("unlink", handleUnlink);
    },
    resolveId(id) {
      if (id === NANI_DEVTOOLS_VITE_SNAPSHOT_MODULE_ID) return RESOLVED_SNAPSHOT_MODULE_ID;
    },
    async load(id) {
      if (id !== RESOLVED_SNAPSHOT_MODULE_ID) return;
      if (!serve) return "export default null;";
      lastSnapshot = await createSnapshot(resolvedOptions, projectRoot, ++generation);
      sourceFilesByPath = new Map(lastSnapshot.scripts.map((script) => {
        const scope = project.scopes[script.scope]!;
        const scriptRoot = normalizedScriptRoot(scope.scriptRoot);
        const relativePath = scriptRoot
          ? script.scriptPath.slice(scriptRoot.length + 1)
          : script.scriptPath;
        return [normalizeAbsolutePath(resolve(projectRoot, scope.sourceRoot, relativePath)), script.scriptPath];
      }));
      catalogDirty = false;
      return `export default ${JSON.stringify(lastSnapshot)};`;
    },
    async handleHotUpdate(ctx) {
      if (catalogDirty) return [];
      const absoluteFile = normalizeAbsolutePath(ctx.file);
      const scriptPath = sourceFilesByPath.get(absoluteFile);
      if (!scriptPath) return;
      invalidateSnapshot();
      const candidateUpdateId = ++updateId;
      try {
        const snapshot = await createSnapshot(resolvedOptions, projectRoot, generation);
        const script = snapshot.scripts.find((candidate) => candidate.scriptPath === scriptPath);
        if (!script) {
          markCatalogDirty("rename");
          return [];
        }
        const update = sourceUpdate(options.entry.id, script, candidateUpdateId);
        ctx.server.ws.send({ type: "custom", event: NANI_DEVTOOLS_VITE_UPDATE_EVENT, data: update });
      } catch (error) {
        const update: NaniDevtoolsViteUpdate = {
          updateId: candidateUpdateId,
          entryId: options.entry.id,
          scope: scopeForFile(absoluteFile, resolvedOptions, projectRoot) ?? "development",
          scriptPath,
          sourceText: await Promise.resolve(ctx.read()).catch(() => ""),
          serverRevision: null,
          executionDisposition: "fatal",
          diagnostics: [{
            source: "bridge",
            severity: "error",
            disposition: "fatal",
            message: error instanceof Error ? error.message : String(error)
          }]
        };
        ctx.server.ws.send({ type: "custom", event: NANI_DEVTOOLS_VITE_UPDATE_EVENT, data: update });
      }
      return [];
    }
  };
}

async function createSnapshot(
  options: NaniDevtoolsVitePluginOptions,
  projectRoot: string,
  generation: number
): Promise<NaniDevtoolsViteSnapshot> {
  const analysis = await analyzeNaniCatalog(options.project, {
    projectRoot,
    scopes: options.scopes,
    entries: [options.entry],
    assetBindings: await options.assetBindings,
    sourceDiagnosticPolicy: "allow-recoverable-command-errors"
  });
  return {
    generation,
    entry: {
      id: options.entry.id,
      initialScriptPath: options.entry.initialScriptPath,
      ...(options.entry.startLabel ? { startLabel: options.entry.startLabel } : {})
    },
    scripts: analysis.scripts.map((script) => ({
      scope: script.scope,
      scriptPath: script.scriptPath,
      sourceText: script.sourceText,
      semanticRevision: script.semanticRevision,
      executionDisposition: script.executionDisposition,
      diagnostics: script.diagnostics.map(toViteDiagnostic),
      metadata: script.metadata
    }))
  };
}

function sourceUpdate(
  entryId: string,
  script: NaniDevtoolsDiscoveredSource,
  updateId: number
): NaniDevtoolsViteUpdate {
  return {
    updateId,
    entryId,
    scope: script.scope,
    scriptPath: script.scriptPath,
    sourceText: script.sourceText,
    serverRevision: script.executionDisposition === "runnable" ? script.semanticRevision : null,
    executionDisposition: script.executionDisposition,
    diagnostics: script.diagnostics
  };
}

function toViteDiagnostic(diagnostic: {
  source: string;
  severity: "info" | "warning" | "error";
  disposition: "advisory" | "recoverable" | "fatal";
  message: string;
  code: string;
  loc?: { line: number; column: number };
  span?: { start: number; end: number };
}): NaniDevtoolsViteDiagnostic {
  return {
    source: diagnostic.source as NaniDevtoolsViteDiagnostic["source"],
    severity: diagnostic.severity,
    disposition: diagnostic.disposition,
    message: diagnostic.message,
    code: diagnostic.code,
    ...(diagnostic.loc ? { lineNumber: diagnostic.loc.line, columnNumber: diagnostic.loc.column } : {}),
    ...(diagnostic.span ? { span: diagnostic.span } : {})
  };
}

function isManagedNaniPath(file: string, roots: readonly string[]): boolean {
  if (!file.endsWith(".nani")) return false;
  const normalized = normalizeAbsolutePath(file);
  return roots.some((root) => isWithin(normalizeAbsolutePath(root), normalized));
}

function scopeForFile(
  file: string,
  options: NaniDevtoolsVitePluginOptions,
  projectRoot: string
): NaniScope | undefined {
  return options.scopes.find((scope) => {
    const config = options.project.scopes[scope];
    return config && isWithin(normalizeAbsolutePath(resolve(projectRoot, config.sourceRoot)), file);
  });
}

function isWithin(root: string, candidate: string): boolean {
  const value = relative(root, candidate);
  return value === "" || (!value.startsWith(`..${sep}`) && value !== ".." && !value.startsWith("/"));
}

function normalizedScriptRoot(value: string): string {
  return value.replace(/^\.\//u, "").replace(/\/$/u, "");
}

function normalizeAbsolutePath(file: string): string {
  return resolve(file).replaceAll("\\", "/");
}
