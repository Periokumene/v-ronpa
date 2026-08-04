import {
  advanceVnSession,
  switchVnSessionScript,
  type VnSessionPlayStep,
  type VnSessionState
} from "@v-ronpa/app-vn-session";
import type { RuntimeCommand } from "@v-ronpa/contracts";
import { parseStaticNaniEndpoint } from "@v-ronpa/nani-parser";
import type { StoryStepperDiagnostic } from "@v-ronpa/story-engine";
import type { StoryPlayAdvanceSource } from "@v-ronpa/story-play";
import type { CompiledVnRuntimeCatalog } from "./runtimeCatalog";

export type VnRuntimeScriptPreparationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export interface CoordinateVnScriptNavigationInput {
  catalog: CompiledVnRuntimeCatalog;
  isCancelled(): boolean;
  maxTransitions?: number;
  prepareScript(scriptPath: string): Promise<VnRuntimeScriptPreparationResult>;
  source: StoryPlayAdvanceSource;
  step: VnSessionPlayStep;
}

export type CoordinateVnScriptNavigationResult =
  | {
      ok: true;
      session: VnSessionState;
      runtimeCommands: RuntimeCommand[];
      storyDiagnostics: StoryStepperDiagnostic[];
      executedScriptPaths: string[];
      crossedScript: boolean;
    }
  | { ok: false; cancelled: boolean; code: string; message: string };

export async function coordinateVnScriptNavigation({
  catalog,
  isCancelled,
  maxTransitions = 32,
  prepareScript,
  source,
  step
}: CoordinateVnScriptNavigationInput): Promise<CoordinateVnScriptNavigationResult> {
  let nextSession = step.session;
  let navigationRequest = step.playStep.story.navigationRequest;
  const runtimeCommands = [...step.emittedRuntimeCommands];
  const storyDiagnostics = [...step.playStep.story.diagnostics];
  const executedScriptPaths = [nextSession.script.scriptPath];
  let navigationCount = 0;
  let crossedScript = false;

  while (navigationRequest) {
    navigationCount += 1;
    if (navigationCount > maxTransitions) {
      return failure("script-navigation-loop", `Script navigation exceeded ${maxTransitions} consecutive cross-script transitions.`);
    }
    if (isCancelled()) return failure("operation-cancelled", "Script navigation was cancelled.", true);
    const parsed = parseStaticNaniEndpoint(navigationRequest.endpoint, nextSession.script.scriptPath);
    if (!parsed.ok) return failure(parsed.code, parsed.message);
    const target = catalog.recordsByPath.get(parsed.endpoint.scriptPath);
    if (!target) {
      return failure("endpoint-script-missing", `Nani navigation target '${parsed.endpoint.scriptPath}' is not registered.`);
    }
    const instructionPointer = parsed.endpoint.label ? target.script.labels[parsed.endpoint.label] : 0;
    if (instructionPointer === undefined) {
      return failure(
        "endpoint-label-missing",
        `Nani navigation label '#${parsed.endpoint.label}' does not exist in '${target.script.scriptPath}'.`
      );
    }
    const prepared = await prepareScript(target.script.scriptPath);
    if (isCancelled()) return failure("operation-cancelled", "Script navigation was cancelled.", true);
    if (!prepared.ok) return failure("presentation-prepare-failed", prepared.message);

    if (target.script.scriptPath !== nextSession.script.scriptPath) {
      crossedScript = true;
      discardPinpCommands(runtimeCommands);
    }
    nextSession = switchVnSessionScript(nextSession, {
      script: target.script,
      instructionPointer,
      diagnostics: target.bootSession.diagnostics
    });
    executedScriptPaths.push(target.script.scriptPath);
    const continued = advanceVnSession(nextSession, source);
    nextSession = continued.session;
    runtimeCommands.push(...continued.emittedRuntimeCommands);
    storyDiagnostics.push(...continued.playStep.story.diagnostics);
    navigationRequest = continued.playStep.story.navigationRequest;
  }

  if (isCancelled()) return failure("operation-cancelled", "VN runtime operation was cancelled.", true);
  return {
    ok: true,
    session: nextSession,
    runtimeCommands,
    storyDiagnostics,
    executedScriptPaths: [...new Set(executedScriptPaths)],
    crossedScript
  };
}

function discardPinpCommands(commands: RuntimeCommand[]): void {
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    if (commands[index]?.commandId === "pinp") commands.splice(index, 1);
  }
}

function failure(code: string, message: string, cancelled = false): CoordinateVnScriptNavigationResult {
  return { ok: false, cancelled, code, message };
}
