import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseScenario } from "@v-ronpa/nani-parser";
import {
  compileRuntimeScript,
  digestRuntimeScriptSemantics,
  type RuntimeCompilerDiagnostic
} from "@v-ronpa/nani-runtime-compiler";
import type { Plugin } from "vite";
import {
  NANI_DEVTOOLS_VITE_INITIAL_MODULE_ID,
  NANI_DEVTOOLS_VITE_UPDATE_EVENT,
  type NaniDevtoolsViteInitialCandidate,
  type NaniDevtoolsViteDiagnostic,
  type NaniDevtoolsViteUpdate
} from "@v-ronpa/app-vn-devtools/vite-protocol";

export {
  NANI_DEVTOOLS_VITE_INITIAL_MODULE_ID,
  NANI_DEVTOOLS_VITE_UPDATE_EVENT
} from "@v-ronpa/app-vn-devtools/vite-protocol";
export type {
  NaniDevtoolsViteDiagnostic,
  NaniDevtoolsViteInitialCandidate,
  NaniDevtoolsViteUpdate
} from "@v-ronpa/app-vn-devtools/vite-protocol";

const RESOLVED_NANI_DEVTOOLS_VITE_INITIAL_MODULE_ID = `\0${NANI_DEVTOOLS_VITE_INITIAL_MODULE_ID}`;

export interface NaniDevtoolsViteEntry {
  sourceFile: string;
  scriptPath: string;
  entryId: string;
}

export interface NaniDevtoolsVitePluginOptions {
  entries: readonly NaniDevtoolsViteEntry[];
  /** Base path for relative sourceFile entries. Defaults to process.cwd(). */
  root?: string;
}

/**
 * Vite-only source bridge. It never reloads the page and never installs a
 * client runtime; consumers subscribe to NANI_DEVTOOLS_VITE_UPDATE_EVENT.
 */
export function createNaniDevtoolsVitePlugin(options: NaniDevtoolsVitePluginOptions): Plugin {
  const basePath = options.root ?? process.cwd();
  const entriesBySourceFile = new Map<string, NaniDevtoolsViteEntry>();
  for (const entry of options.entries) {
    if (!entry.sourceFile.endsWith(".nani")) {
      throw new Error(`Nani devtools sourceFile must end with .nani: ${entry.sourceFile}`);
    }
    const sourceFile = normalizeAbsolutePath(entry.sourceFile, basePath);
    if (entriesBySourceFile.has(sourceFile)) {
      throw new Error(`Nani devtools sourceFile is configured more than once: ${entry.sourceFile}`);
    }
    entriesBySourceFile.set(sourceFile, entry);
  }

  let updateId = 0;
  let serve = false;

  return {
    name: "v-ronpa-nani-devtools",
    configResolved(config) {
      serve = config.command === "serve";
    },
    resolveId(id) {
      if (id === NANI_DEVTOOLS_VITE_INITIAL_MODULE_ID) {
        return RESOLVED_NANI_DEVTOOLS_VITE_INITIAL_MODULE_ID;
      }
    },
    async load(id) {
      if (id !== RESOLVED_NANI_DEVTOOLS_VITE_INITIAL_MODULE_ID) return;
      // Keep source, diagnostics, and protocol markers out of production output.
      if (!serve) return "export default [];";
      const candidates = await Promise.all([...entriesBySourceFile].map(async ([sourceFile, entry]) => {
        try {
          return await inspectInitialCandidate(entry, await readFile(sourceFile, "utf8"));
        } catch (error) {
          return failedCandidate(entry, "", error);
        }
      }));
      return `export default ${JSON.stringify(candidates)};`;
    },
    async handleHotUpdate(ctx) {
      const entry = entriesBySourceFile.get(normalizeAbsolutePath(ctx.file, basePath));
      if (!entry) return;

      // Invalidate before the first await. A simultaneous page refresh must
      // never import an old virtual snapshot beside Vite's newly-read ?raw
      // module for the same save.
      const initialModule = ctx.server.moduleGraph.getModuleById(
        RESOLVED_NANI_DEVTOOLS_VITE_INITIAL_MODULE_ID
      );
      if (initialModule) ctx.server.moduleGraph.invalidateModule(initialModule);

      const candidateUpdateId = ++updateId;
      let update: NaniDevtoolsViteUpdate;
      let sourceText = "";
      try {
        sourceText = await ctx.read();
        update = {
          ...(await inspectInitialCandidate(entry, sourceText)),
          updateId: candidateUpdateId
        };
      } catch (error) {
        update = {
          ...failedCandidate(entry, sourceText, error),
          updateId: candidateUpdateId
        };
      }

      ctx.server.ws.send({
        type: "custom",
        event: NANI_DEVTOOLS_VITE_UPDATE_EVENT,
        data: update
      });
      return [];
    }
  };
}

async function inspectInitialCandidate(
  entry: NaniDevtoolsViteEntry,
  sourceText: string
): Promise<NaniDevtoolsViteInitialCandidate> {
  const parsed = parseScenario({ sourceText, scriptPath: entry.scriptPath });
  const compiled = compileRuntimeScript(parsed);
  const parserDiagnostics: NaniDevtoolsViteDiagnostic[] = parsed.diagnostics.map((diagnostic) => ({
    source: "parser",
    severity: diagnostic.severity,
    message: diagnostic.message,
    code: diagnostic.code,
    lineNumber: diagnostic.loc.line,
    columnNumber: diagnostic.loc.column,
    span: diagnostic.span
  }));
  const compilerDiagnostics = compiled.diagnostics.map(toViteCompilerDiagnostic);
  const diagnostics = [...parserDiagnostics, ...compilerDiagnostics];
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const serverRevision = hasErrors ? null : await digestRuntimeScriptSemantics(compiled.script);

  return {
    entryId: entry.entryId,
    scriptPath: entry.scriptPath,
    sourceText,
    serverRevision,
    diagnostics
  };
}

function failedCandidate(
  entry: NaniDevtoolsViteEntry,
  sourceText: string,
  error: unknown
): NaniDevtoolsViteInitialCandidate {
  return {
    entryId: entry.entryId,
    scriptPath: entry.scriptPath,
    sourceText,
    serverRevision: null,
    diagnostics: [
      {
        source: "bridge",
        severity: "error",
        message: error instanceof Error ? error.message : String(error)
      }
    ]
  };
}

function toViteCompilerDiagnostic(diagnostic: RuntimeCompilerDiagnostic): NaniDevtoolsViteDiagnostic {
  return {
    source: "compiler",
    severity: diagnostic.severity,
    message: diagnostic.message,
    code: diagnostic.code,
    lineNumber: diagnostic.loc.line,
    columnNumber: diagnostic.loc.column,
    span: diagnostic.span
  };
}

function normalizeAbsolutePath(file: string, basePath: string): string {
  return resolve(basePath, file).replaceAll("\\", "/");
}
