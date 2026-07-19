import type { RuntimeCommand, RuntimeScript, VnEntryDef } from "@v-ronpa/contracts";
import { parseStaticNaniEndpoint, type StaticNaniEndpointErrorCode } from "@v-ronpa/nani-parser";

export type RuntimeScriptCatalogDiagnosticCode =
  | StaticNaniEndpointErrorCode
  | "duplicate-script-path"
  | "entry-script-missing"
  | "endpoint-script-missing"
  | "endpoint-label-missing";

export interface RuntimeScriptCatalogDiagnostic {
  code: RuntimeScriptCatalogDiagnosticCode;
  severity: "error";
  message: string;
  scriptPath: string;
  endpoint?: string;
  commandIndex?: number;
}

export interface LinkedRuntimeScriptCatalog {
  scripts: readonly RuntimeScript[];
  scriptsByPath: ReadonlyMap<string, RuntimeScript>;
  diagnostics: readonly RuntimeScriptCatalogDiagnostic[];
}

export function linkRuntimeScriptCatalog(
  entry: Pick<VnEntryDef, "initialScriptPath" | "startLabel">,
  scripts: readonly RuntimeScript[]
): LinkedRuntimeScriptCatalog {
  const diagnostics: RuntimeScriptCatalogDiagnostic[] = [];
  const scriptsByPath = new Map<string, RuntimeScript>();
  for (const script of scripts) {
    if (scriptsByPath.has(script.scriptPath)) {
      diagnostics.push({
        code: "duplicate-script-path",
        severity: "error",
        message: `Runtime script path '${script.scriptPath}' is registered more than once.`,
        scriptPath: script.scriptPath
      });
      continue;
    }
    scriptsByPath.set(script.scriptPath, script);
  }

  const initial = scriptsByPath.get(entry.initialScriptPath);
  if (!initial) {
    diagnostics.push({
      code: "entry-script-missing",
      severity: "error",
      message: `VN entry initial script '${entry.initialScriptPath}' is not registered.`,
      scriptPath: entry.initialScriptPath
    });
  } else if (entry.startLabel && initial.labels[entry.startLabel] === undefined) {
    diagnostics.push({
      code: "endpoint-label-missing",
      severity: "error",
      message: `VN entry start label '#${entry.startLabel}' does not exist in '${initial.scriptPath}'.`,
      scriptPath: initial.scriptPath,
      endpoint: `#${entry.startLabel}`
    });
  }

  for (const script of scriptsByPath.values()) {
    for (const [commandIndex, command] of script.commands.entries()) {
      const endpoint = navigationEndpoint(command);
      if (endpoint === undefined) continue;
      const parsed = parseStaticNaniEndpoint(endpoint, script.scriptPath);
      if (!parsed.ok) {
        diagnostics.push({
          code: parsed.code,
          severity: "error",
          message: parsed.message,
          scriptPath: script.scriptPath,
          commandIndex
        });
        continue;
      }
      const target = scriptsByPath.get(parsed.endpoint.scriptPath);
      if (!target) {
        diagnostics.push({
          code: "endpoint-script-missing",
          severity: "error",
          message: `Nani navigation target '${parsed.endpoint.scriptPath}' is not registered.`,
          scriptPath: script.scriptPath,
          endpoint: parsed.endpoint.raw,
          commandIndex
        });
        continue;
      }
      if (parsed.endpoint.label && target.labels[parsed.endpoint.label] === undefined) {
        diagnostics.push({
          code: "endpoint-label-missing",
          severity: "error",
          message: `Nani navigation label '#${parsed.endpoint.label}' does not exist in '${target.scriptPath}'.`,
          scriptPath: script.scriptPath,
          endpoint: parsed.endpoint.raw,
          commandIndex
        });
      }
    }
  }

  return { scripts: [...scripts], scriptsByPath, diagnostics };
}

function navigationEndpoint(command: RuntimeCommand): unknown {
  if (command.commandId === "goto") return command.params.label;
  if (command.commandId === "choice") return command.params.goto;
  return undefined;
}
