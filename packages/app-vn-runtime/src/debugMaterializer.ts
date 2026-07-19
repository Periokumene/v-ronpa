import {
  createInitialMediaRuntimeState,
  createInitialUiRuntimeState,
  createVnMediaCheckpoint,
  createVnUiCheckpoint,
  deriveUiRuntimeLifecycleState,
  settleUiRuntimePresentationWait,
  type MediaRuntimeState,
  type UiRuntimeState,
  type VnOutputRouteTable,
  type VnRuntimeProfile
} from "@v-ronpa/app-vn-dispatch";
import {
  completeVnSessionPresentationWait,
  completeVnSessionRuntimeWait,
  createVnSession,
  resolveVnSessionChoice,
  resolveVnSessionInput,
  stepVnSessionInstruction,
  switchVnSessionScript,
  type VnSessionState
} from "@v-ronpa/app-vn-session";
import type {
  PixiStageSnapshot,
  RuntimeCommand,
  RuntimeScript,
  SaveableVnState,
  StoryChoiceOption,
  StoryScalar,
  VnEntryDef,
  VnRuntimeScriptCatalog,
  VnRuntimeScriptSource
} from "@v-ronpa/contracts";
import { parseScenario, parseStaticNaniEndpoint, type LabelIR } from "@v-ronpa/nani-parser";
import {
  compileRuntimeScript,
  digestRuntimeScriptSemantics,
  linkRuntimeScriptCatalog
} from "@v-ronpa/nani-runtime-compiler";
import { createInitialPixiStageSnapshot } from "@v-ronpa/pixi-stage-model";
import { collectVnSaveCheckpoint } from "./checkpoint";
import {
  collectVnRuntimeDiagnostics,
  createInitialVnRuntimeDiagnostics,
  createVnRuntimeStartLabelDiagnostics,
  type VnRuntimeDiagnostic
} from "./runtimeDiagnostics";
import { projectVnRuntimeStep } from "./runtimeProjection";

export const DEFAULT_VN_DEBUG_MAX_INSTRUCTIONS = 10_000;
const VN_DEBUG_YIELD_INTERVAL = 128;

export type VnDebugPreviewability = "stable" | "decision" | "degraded" | "no-stable-result" | "blocked";

export interface VnDebugTargetAnchor {
  kind: "command" | "label";
  scriptPath: string;
  revision: string;
  line: number;
  commandIndex: number;
  ordinal: number;
  commandId?: string;
  label?: string;
  stableId?: string;
  fingerprint?: string;
}

export interface VnDebugCommandInspection {
  anchor: VnDebugTargetAnchor;
  command: RuntimeCommand;
  previewability: VnDebugPreviewability;
  previewReason?: string;
}

export interface VnDebugSourceLine {
  line: number;
  text: string;
  anchors: VnDebugTargetAnchor[];
  previewability?: VnDebugPreviewability;
  previewReason?: string;
}

export interface VnDebugLabelOutlineItem {
  name: string;
  line: number;
  anchor: VnDebugTargetAnchor;
}

export interface VnDebugScriptInspection {
  entry: VnEntryDef;
  source: VnRuntimeScriptSource;
  declaredRevisionMatches: boolean;
  script: RuntimeScript;
  revision: string;
  sourceLines: VnDebugSourceLine[];
  commands: VnDebugCommandInspection[];
  labels: VnDebugLabelOutlineItem[];
  diagnostics: VnRuntimeDiagnostic[];
  canMaterialize: boolean;
  degraded: boolean;
}

export interface VnDebugChoiceDecision {
  anchor: VnDebugTargetAnchor;
  choiceId?: string;
  text: string;
  goto?: string;
}

export interface VnDebugInputDecision {
  anchor: VnDebugTargetAnchor;
  value: StoryScalar;
}

export interface VnDebugDecisionTrace {
  choices: VnDebugChoiceDecision[];
  inputs: VnDebugInputDecision[];
}

export const EMPTY_VN_DEBUG_DECISION_TRACE: VnDebugDecisionTrace = { choices: [], inputs: [] };

interface VnDebugMaterializationBase {
  inspection: VnDebugScriptInspection;
  diagnostics: VnRuntimeDiagnostic[];
  executedInstructions: number;
  executedScriptPaths: string[];
  degraded: boolean;
  target: VnDebugTargetAnchor;
  lastStableAnchor?: VnDebugTargetAnchor;
}

export interface VnDebugMaterializationReady extends VnDebugMaterializationBase {
  status: "ready";
  checkpoint: SaveableVnState;
  resolvedTarget: VnDebugTargetAnchor;
}

export interface VnDebugChoiceRequest {
  kind: "choice";
  anchor: VnDebugTargetAnchor;
  choices: StoryChoiceOption[];
  reason: "missing" | "stale";
}

export interface VnDebugInputRequest {
  kind: "input";
  anchor: VnDebugTargetAnchor;
  variableName: string;
  valueType: "string" | "number" | "boolean";
  summary?: string;
  defaultValue?: StoryScalar;
  reason: "missing" | "stale";
}

export interface VnDebugMaterializationDecisionRequired extends VnDebugMaterializationBase {
  status: "decision-required";
  decision: VnDebugChoiceRequest | VnDebugInputRequest;
}

export type VnDebugMaterializationBlockedCode =
  | "invalid-source"
  | "revision-mismatch"
  | "target-invalid"
  | "target-unreachable"
  | "no-stable-result"
  | "gameplay-event"
  | "expression-error"
  | "decision-invalid"
  | "loop-detected"
  | "instruction-limit"
  | "catalog-link-error"
  | "unstable-checkpoint";

export interface VnDebugMaterializationBlocked extends VnDebugMaterializationBase {
  status: "blocked";
  code: VnDebugMaterializationBlockedCode;
  message: string;
}

export type VnDebugMaterializationResult =
  | VnDebugMaterializationReady
  | VnDebugMaterializationDecisionRequired
  | VnDebugMaterializationBlocked;

export interface MaterializeVnDebugTargetInput {
  entry: VnEntryDef;
  catalog: VnRuntimeScriptCatalog;
  target: VnDebugTargetAnchor;
  decisions?: VnDebugDecisionTrace;
  expectedRevision?: string;
  inspection?: VnDebugScriptInspection;
  maxInstructions?: number;
  nowMs?: number;
  profile?: VnRuntimeProfile;
  routeTable?: VnOutputRouteTable;
  signal?: AbortSignal;
}

export async function inspectVnDebugScript(
  entry: VnEntryDef,
  source: VnRuntimeScriptSource
): Promise<VnDebugScriptInspection> {
  const parsed = parseScenario({ sourceText: source.sourceText, scriptPath: source.scriptPath });
  const compiled = compileRuntimeScript(parsed);
  const revision = await digestRuntimeScriptSemantics(compiled.script);
  const diagnostics = [
    ...createInitialVnRuntimeDiagnostics(parsed.diagnostics, compiled.diagnostics),
    ...(source.scriptPath === entry.initialScriptPath
      ? createVnRuntimeStartLabelDiagnostics(compiled.script, entry.startLabel)
      : [])
  ];
  const commandAnchors = createCommandAnchors(compiled.script, revision);
  const commands = compiled.script.commands.map((command, commandIndex) => {
    const preview = classifyVnDebugCommand(command);
    return {
      anchor: commandAnchors[commandIndex]!,
      command,
      previewability: preview.previewability,
      ...(preview.reason ? { previewReason: preview.reason } : {})
    } satisfies VnDebugCommandInspection;
  });
  const labels = parsed.scenario.statements
    .filter((statement): statement is LabelIR => statement.kind === "label")
    .map((label) => ({
      name: label.name,
      line: label.loc.line,
      anchor: createLabelAnchor(compiled.script, revision, label)
    }));
  const labelsByLine = new Map(labels.map((label) => [label.line, label]));
  const commandsByLine = new Map<number, VnDebugCommandInspection[]>();
  for (const command of commands) {
    const lineCommands = commandsByLine.get(command.command.loc.line) ?? [];
    lineCommands.push(command);
    commandsByLine.set(command.command.loc.line, lineCommands);
  }
  const sourceLines = source.sourceText.split(/\r?\n/u).map((text, offset) => {
    const line = offset + 1;
    const lineCommands = commandsByLine.get(line) ?? [];
    const label = labelsByLine.get(line);
    const preview = mostRestrictivePreview(lineCommands);
    return {
      line,
      text,
      anchors: [...(label ? [label.anchor] : []), ...lineCommands.map((command) => command.anchor)],
      ...(preview ? { previewability: preview.previewability } : label ? { previewability: "stable" as const } : {}),
      ...(preview?.previewReason ? { previewReason: preview.previewReason } : {})
    } satisfies VnDebugSourceLine;
  });
  const candidateSource = { ...source, scriptRevision: revision };
  const canMaterialize = !diagnostics.some((diagnostic) => diagnostic.severity === "error");
  return {
    entry,
    source: candidateSource,
    declaredRevisionMatches: source.scriptRevision === revision,
    script: compiled.script,
    revision,
    sourceLines,
    commands,
    labels,
    diagnostics,
    canMaterialize,
    degraded:
      commands.some((command) => command.previewability === "degraded")
      || diagnostics.some((diagnostic) => diagnostic.severity === "warning")
  };
}

export async function materializeVnDebugTarget({
  catalog,
  decisions = EMPTY_VN_DEBUG_DECISION_TRACE,
  entry,
  expectedRevision,
  inspection: providedInspection,
  maxInstructions = DEFAULT_VN_DEBUG_MAX_INSTRUCTIONS,
  nowMs = 0,
  profile,
  routeTable,
  signal,
  target
}: MaterializeVnDebugTargetInput): Promise<VnDebugMaterializationResult> {
  const inspections = await Promise.all(catalog.map((source) => inspectVnDebugScript(entry, source)));
  const inspectionsByPath = new Map(inspections.map((candidate) => [candidate.source.scriptPath, candidate]));
  if (providedInspection) inspectionsByPath.set(providedInspection.source.scriptPath, providedInspection);
  const inspection = inspectionsByPath.get(target.scriptPath) ?? providedInspection ?? inspections[0];
  if (!inspection) throw new Error("The VN debug catalog is empty.");
  const base = () => ({
    inspection,
    diagnostics,
    executedInstructions,
    executedScriptPaths: [...new Set(executedScriptPaths)],
    degraded,
    target,
    ...(lastStableAnchor ? { lastStableAnchor } : {})
  });
  let diagnostics = [...inspection.diagnostics];
  let executedInstructions = 0;
  let executedScriptPaths: string[] = [];
  let degraded = inspection.diagnostics.some(
    (diagnostic) => diagnostic.severity === "warning" && diagnostic.code !== "declared-only-command"
  );
  let lastStableAnchor: VnDebugTargetAnchor | undefined;

  if (signal?.aborted) throw abortError();
  const linked = linkRuntimeScriptCatalog(entry, inspections.map((candidate) => candidate.script));
  if (linked.diagnostics.length > 0) {
    return blocked(base(), "catalog-link-error", linked.diagnostics[0]!.message);
  }
  const invalidCatalogScript = inspections.find((candidate) => !candidate.canMaterialize);
  if (invalidCatalogScript) {
    return blocked(
      base(),
      "invalid-source",
      `The candidate catalog script '${invalidCatalogScript.source.scriptPath}' contains parser or compiler errors.`
    );
  }
  if (providedInspection && !catalog.some((source) => sameDebugScriptSource(source, providedInspection.source))) {
    return blocked(base(), "invalid-source", "The supplied inspection does not belong to the requested runtime entry source.");
  }
  if (!inspection.canMaterialize) {
    return blocked(base(), "invalid-source", "The candidate source contains parser, compiler, or start-label errors.");
  }
  // expectedRevision authenticates the candidate source supplied by the
  // server/browser handshake. During a cross-script fixed-point replay that
  // candidate can be a predecessor of the target, so comparing the target
  // script's revision would reject a valid catalog transaction.
  const revisionInspection = providedInspection ?? inspection;
  if (expectedRevision && revisionInspection.revision !== expectedRevision) {
    return blocked(
      base(),
      "revision-mismatch",
      `Browser revision ${revisionInspection.revision} for '${revisionInspection.source.scriptPath}' does not match server revision ${expectedRevision}.`
    );
  }
  const resolvedTarget = resolveVnDebugAnchor(inspection, target);
  if (!resolvedTarget) {
    return blocked(base(), "target-invalid", "The pinned target no longer has a unique match in the candidate script.");
  }
  const targetCommand = resolvedTarget.kind === "command"
    ? inspection.commands[resolvedTarget.commandIndex]
    : undefined;
  if (targetCommand?.previewability === "blocked") {
    return blocked(base(), "gameplay-event", targetCommand.previewReason ?? "Gameplay commands require a host checkpoint transaction.");
  }
  if (targetCommand?.previewability === "no-stable-result") {
    return blocked(base(), "no-stable-result", targetCommand.previewReason ?? "The command has no stable checkpoint result.");
  }

  const initialInspection = inspectionsByPath.get(entry.initialScriptPath);
  if (!initialInspection) {
    return blocked(base(), "invalid-source", `The entry initial script '${entry.initialScriptPath}' is not in the debug catalog.`);
  }
  const boot = createVnSession({
    scriptPath: initialInspection.source.scriptPath,
    sourceText: initialInspection.source.sourceText,
    ...(entry.startLabel ? { startLabel: entry.startLabel } : {})
  });
  let session = boot.session;
  let currentInspection = initialInspection;
  executedScriptPaths = [initialInspection.source.scriptPath];
  let pixiStage = createInitialPixiStageSnapshot();
  let mediaState = createInitialMediaRuntimeState();
  let uiState = createInitialUiRuntimeState();
  let targetChoiceSeen = false;
  let labelReached = false;
  let choiceGroupAnchor: VnDebugTargetAnchor | undefined;
  let navigationCount = 0;
  const seenStates = new Set<string>();
  const limit = Math.max(1, Math.floor(maxInstructions));

  while (executedInstructions < limit) {
    if (executedInstructions > 0 && executedInstructions % VN_DEBUG_YIELD_INTERVAL === 0) {
      await yieldMaterializerControl();
    }
    if (signal?.aborted) throw abortError();
    if (session.story.ended) {
      return blocked(base(), "target-unreachable", "The story ended before the target produced a stable checkpoint.");
    }

    if (session.story.presentationWait) {
      if (session.story.presentationWait.channel === "ui") {
        uiState = settleUiRuntimePresentationWait(uiState, session.story.presentationWait);
      }
      session = completeVnSessionPresentationWait(session).session;
      continue;
    }

    if (session.story.runtimeWait) {
      const wait = session.story.runtimeWait;
      const waitAnchor = currentInspection.commands[wait.commandIndex]?.anchor ?? lastStableAnchor ?? resolvedTarget;
      if (wait.kind === "input") {
        const decision = findInputDecision(decisions, waitAnchor);
        if (!decision) {
          return requireInputDecision(
            base(),
            waitAnchor,
            wait,
            decisions.inputs.some((candidate) => anchorsShareIdentity(candidate.anchor, waitAnchor)) ? "stale" : "missing"
          );
        }
        const resolved = resolveVnSessionInput(session, decision.value);
        diagnostics.push(...collectVnRuntimeDiagnostics({ storyDiagnostics: resolved.storyStep.diagnostics }));
        if (resolved.storyStep.diagnostics.some(isErrorDiagnostic)) {
          return blocked(base(), "decision-invalid", "The supplied input does not satisfy the runtime input contract.");
        }
        if (resolved.session.story.runtimeWait?.kind === "input") {
          return requireInputDecision(base(), waitAnchor, wait, "stale");
        }
        session = resolved.session;
        uiState = deriveUiRuntimeLifecycleState(uiState, session.story);
        lastStableAnchor = waitAnchor;
        if (
          resolvedTarget.scriptPath === currentInspection.source.scriptPath
          && resolvedTarget.kind === "command"
          && resolvedTarget.commandIndex === wait.commandIndex
        ) {
          return ready(base(), entry, currentInspection.source, session, pixiStage, mediaState, uiState, resolvedTarget);
        }
        continue;
      }
      const waitTargeted = resolvedTarget.scriptPath === currentInspection.source.scriptPath
        && resolvedTarget.kind === "command"
        && resolvedTarget.commandIndex === wait.commandIndex;
      if (waitTargeted) {
        return blocked(base(), "no-stable-result", `@${wait.commandId} has no stable checkpoint at its active runtime wait.`);
      }
      degraded = true;
      session = completeVnSessionRuntimeWait(session, wait.kind).session;
      continue;
    }

    const nextCommand = session.script.commands[session.story.instructionPointer];
    if (session.story.pendingChoices.length > 0 && !isChoiceGroupCommand(nextCommand)) {
      if (targetChoiceSeen || (resolvedTarget.kind === "label" && labelReached)) {
        return ready(base(), entry, currentInspection.source, session, pixiStage, mediaState, uiState, resolvedTarget);
      }
      const enabledChoices = session.story.pendingChoices.filter((choice) => choice.enabled !== false);
      if (enabledChoices.length === 0) {
        return blocked(base(), "decision-invalid", "The choice group has no enabled option.");
      }
      const decisionAnchor = choiceGroupAnchor ?? lastStableAnchor ?? resolvedTarget;
      const choiceIndex = enabledChoices.length === 1
        ? session.story.pendingChoices.indexOf(enabledChoices[0]!)
        : selectChoiceDecisionIndex(decisions, decisionAnchor, session.story.pendingChoices);
      if (choiceIndex === undefined) {
        return {
          ...base(),
          status: "decision-required",
          decision: {
            kind: "choice",
            anchor: decisionAnchor,
            choices: session.story.pendingChoices,
            reason: decisions.choices.some((candidate) => anchorsShareIdentity(candidate.anchor, decisionAnchor)) ? "stale" : "missing"
          }
        };
      }
      const resolved = resolveVnSessionChoice(session, choiceIndex);
      diagnostics.push(...collectVnRuntimeDiagnostics({ storyDiagnostics: resolved.storyStep.diagnostics }));
      if (resolved.storyStep.diagnostics.some(isErrorDiagnostic)) {
        return blocked(base(), "decision-invalid", "The selected choice is no longer enabled or valid.");
      }
      if (resolved.storyStep.navigationRequest) {
        navigationCount += 1;
        if (navigationCount > 32) return blocked(base(), "loop-detected", "Debug navigation exceeded 32 cross-script transitions.");
        const navigation = switchDebugNavigation(
          resolved.session,
          resolved.storyStep.navigationRequest.endpoint,
          inspectionsByPath
        );
        if (!navigation.ok) return blocked(base(), "catalog-link-error", navigation.message);
        session = navigation.session;
        currentInspection = navigation.inspection;
        executedScriptPaths.push(navigation.inspection.source.scriptPath);
      } else {
        session = resolved.session;
      }
      choiceGroupAnchor = undefined;
      continue;
    }

    const cycleKey = materializationCycleKey(session);
    if (seenStates.has(cycleKey)) {
      return blocked(base(), "loop-detected", "The materializer revisited the same instruction, variables, choices, and wait state.");
    }
    seenStates.add(cycleKey);

    const commandIndex = session.story.instructionPointer;
    const commandInspection = currentInspection.commands[commandIndex];
    const command = commandInspection?.command;
    if (!commandInspection || !command) {
      return blocked(base(), "target-unreachable", "The target is beyond the executable command stream.");
    }
    const commandAnchor = commandInspection.anchor;
    if (
      resolvedTarget.scriptPath === currentInspection.source.scriptPath
      && resolvedTarget.kind === "label"
      && commandIndex === resolvedTarget.commandIndex
    ) labelReached = true;
    if (isChoiceGroupCommand(command) && !choiceGroupAnchor) {
      choiceGroupAnchor = createChoiceGroupDecisionAnchor(currentInspection, commandIndex);
    }

    const step = stepVnSessionInstruction(session);
    executedInstructions += 1;
    const projected = projectVnRuntimeStep({
      active: !step.session.story.ended,
      animatePixi: false,
      nowMs,
      previousMediaState: mediaState,
      previousPixiStage: pixiStage,
      previousUiState: uiState,
      profile: profile ?? entry.profile,
      runtimeCommands: step.emittedRuntimeCommands,
      session: step.session,
      ...(routeTable ? { routeTable } : {})
    });
    const stepDiagnostics = collectVnRuntimeDiagnostics({
      storyDiagnostics: step.storyStep.diagnostics,
      transactionDiagnostics: projected.transaction.diagnostics,
      mediaDiagnostics: projected.transaction.mediaDiagnostics,
      uiDiagnostics: projected.transaction.uiDiagnostics
    });
    diagnostics.push(...stepDiagnostics);
    if (stepDiagnostics.some(isErrorDiagnostic)) {
      return blocked(base(), "expression-error", `@${command.canonicalName} could not be projected deterministically.`);
    }
    if (projected.transient.gameplayEvents.length > 0) {
      return blocked(base(), "gameplay-event", "A gameplay event was encountered before the target; the debug materializer cannot restore host-owned gameplay state atomically.");
    }
    if (commandInspection.previewability === "degraded" || stepDiagnostics.length > 0) degraded = true;
    session = projected.session;
    pixiStage = projected.stable.pixiStage;
    mediaState = projected.stable.mediaState;
    uiState = projected.stable.uiState;
    const commandIsTarget = resolvedTarget.scriptPath === currentInspection.source.scriptPath
      && resolvedTarget.kind === "command"
      && resolvedTarget.commandIndex === commandIndex;
    if (commandIsTarget && command.commandId === "choice") targetChoiceSeen = true;

    if (step.storyStep.navigationRequest) {
      navigationCount += 1;
      if (navigationCount > 32) return blocked(base(), "loop-detected", "Debug navigation exceeded 32 cross-script transitions.");
      const navigation = switchDebugNavigation(
        session,
        step.storyStep.navigationRequest.endpoint,
        inspectionsByPath
      );
      if (!navigation.ok) return blocked(base(), "catalog-link-error", navigation.message);
      session = navigation.session;
      currentInspection = navigation.inspection;
      executedScriptPaths.push(navigation.inspection.source.scriptPath);
      choiceGroupAnchor = undefined;
      continue;
    }

    if (session.story.presentationWait) {
      if (session.story.presentationWait.channel === "ui") {
        uiState = settleUiRuntimePresentationWait(uiState, session.story.presentationWait);
      }
      session = completeVnSessionPresentationWait(session).session;
    }
    if (!session.story.runtimeWait && !session.story.presentationWait && !session.story.ended) {
      lastStableAnchor = commandAnchor;
    }

    if (session.story.ended) {
      return blocked(base(), "no-stable-result", "@end cannot be restored as an active VN checkpoint.");
    }
    if (
      commandIsTarget
      && command.commandId === "choice"
      && session.story.pendingChoices.length === 0
      && !isChoiceGroupCommand(session.script.commands[session.story.instructionPointer])
      && !session.story.runtimeWait
      && !session.story.presentationWait
    ) {
      return ready(base(), entry, currentInspection.source, session, pixiStage, mediaState, uiState, resolvedTarget);
    }
    if (commandIsTarget && command.commandId !== "choice" && !session.story.runtimeWait) {
      return ready(base(), entry, currentInspection.source, session, pixiStage, mediaState, uiState, resolvedTarget);
    }
    if (
      resolvedTarget.kind === "label"
      && labelReached
      && !session.story.runtimeWait
      && !session.story.presentationWait
      && isObservableStableCommand(commandInspection)
    ) {
      if (command.commandId !== "choice" || !isChoiceGroupCommand(session.script.commands[session.story.instructionPointer])) {
        return ready(base(), entry, currentInspection.source, session, pixiStage, mediaState, uiState, resolvedTarget);
      }
    }
  }

  return blocked(base(), "instruction-limit", `Materialization exceeded the ${limit.toLocaleString()} instruction limit.`);
}

export function resolveVnDebugAnchor(
  inspection: VnDebugScriptInspection,
  anchor: VnDebugTargetAnchor
): VnDebugTargetAnchor | undefined {
  if (anchor.scriptPath !== inspection.source.scriptPath) return undefined;
  if (anchor.kind === "label") {
    const matches = inspection.labels.filter((candidate) => candidate.name === anchor.label);
    if (matches.length === 1) return matches[0]!.anchor;
    if (anchor.revision === inspection.revision) {
      return inspection.labels.find((candidate) => candidate.anchor.line === anchor.line)?.anchor;
    }
    return undefined;
  }
  if (anchor.stableId) {
    const matches = inspection.commands.filter((candidate) => candidate.anchor.stableId === anchor.stableId);
    if (matches.length === 1) return matches[0]!.anchor;
  }
  if (anchor.fingerprint) {
    const matches = inspection.commands.filter((candidate) => candidate.anchor.fingerprint === anchor.fingerprint);
    if (matches.length === 1) return matches[0]!.anchor;
  }
  if (anchor.revision !== inspection.revision) return undefined;
  const byIndex = inspection.commands[anchor.commandIndex]?.anchor;
  if (byIndex?.commandId === anchor.commandId) return byIndex;
  const ordinalMatches = inspection.commands.filter(
    (candidate) => candidate.anchor.commandId === anchor.commandId && candidate.anchor.ordinal === anchor.ordinal
  );
  if (ordinalMatches.length === 1) return ordinalMatches[0]!.anchor;
  const lineMatches = inspection.commands.filter(
    (candidate) => candidate.anchor.commandId === anchor.commandId && candidate.anchor.line === anchor.line
  );
  return lineMatches.length === 1 ? lineMatches[0]!.anchor : undefined;
}

function createCommandAnchors(script: RuntimeScript, revision: string): VnDebugTargetAnchor[] {
  const ordinals = new Map<string, number>();
  const sortedLabels = Object.entries(script.labels).sort((left, right) => left[1] - right[1]);
  return script.commands.map((command, commandIndex) => {
    const ordinal = ordinals.get(command.commandId) ?? 0;
    ordinals.set(command.commandId, ordinal + 1);
    const nearestLabel = sortedLabels.filter(([, pointer]) => pointer <= commandIndex).at(-1)?.[0] ?? "";
    const context = [script.commands[commandIndex - 1], command, script.commands[commandIndex + 1]]
      .map((candidate) => candidate ? normalizeSource(candidate.loc.raw) : "")
      .join("\u241f");
    const stableId = stableCommandId(command);
    return {
      kind: "command",
      scriptPath: script.scriptPath,
      revision,
      line: command.loc.line,
      commandIndex,
      ordinal,
      commandId: command.commandId,
      ...(stableId ? { stableId } : {}),
      fingerprint: shortFingerprint(`${nearestLabel}\u241e${command.commandId}\u241e${context}`)
    };
  });
}

function createLabelAnchor(script: RuntimeScript, revision: string, label: LabelIR): VnDebugTargetAnchor {
  return {
    kind: "label",
    scriptPath: script.scriptPath,
    revision,
    line: label.loc.line,
    commandIndex: script.labels[label.name] ?? script.commands.length,
    ordinal: 0,
    label: label.name,
    stableId: `label:${label.name}`
  };
}

function stableCommandId(command: RuntimeCommand): string | undefined {
  const value = command.commandId === "print"
    ? command.params.textId
    : command.commandId === "choice"
      ? command.params.id
      : undefined;
  return typeof value === "string" && value ? `${command.commandId}:${value}` : undefined;
}

function createChoiceGroupDecisionAnchor(
  inspection: VnDebugScriptInspection,
  commandIndex: number
): VnDebugTargetAnchor {
  const commandAnchor = inspection.commands[commandIndex]!.anchor;
  const commands = inspection.script.commands;
  let groupEnd = commandIndex;
  while (isChoiceGroupCommand(commands[groupEnd])) groupEnd += 1;

  let groupOrdinal = 0;
  let previousWasChoiceGroupCommand = false;
  for (let index = 0; index < commandIndex; index += 1) {
    const currentIsChoiceGroupCommand = isChoiceGroupCommand(commands[index]);
    if (currentIsChoiceGroupCommand && !previousWasChoiceGroupCommand) groupOrdinal += 1;
    previousWasChoiceGroupCommand = currentIsChoiceGroupCommand;
  }

  const nearestLabel = Object.entries(inspection.script.labels)
    .filter(([, pointer]) => pointer <= commandIndex)
    .sort((left, right) => left[1] - right[1])
    .at(-1)?.[0] ?? "";
  const groupSource = commands
    .slice(commandIndex, groupEnd)
    .map((command) => normalizeSource(command.loc.raw))
    .join("\u241f");
  const previousSource = commands[commandIndex - 1]
    ? normalizeSource(commands[commandIndex - 1]!.loc.raw)
    : "";
  const nextSource = commands[groupEnd] ? normalizeSource(commands[groupEnd]!.loc.raw) : "";
  const fingerprint = shortFingerprint(
    `${nearestLabel}\u241e${previousSource}\u241f${groupSource}\u241f${nextSource}`
  );

  return {
    ...commandAnchor,
    commandId: "choice-group",
    ordinal: groupOrdinal,
    stableId: `choice-group:${groupOrdinal}:${fingerprint}`,
    fingerprint
  };
}

function classifyVnDebugCommand(command: RuntimeCommand): { previewability: VnDebugPreviewability; reason?: string } {
  if (command.commandId === "gameplay") {
    return { previewability: "blocked", reason: "The debug materializer cannot atomically restore host-owned gameplay state." };
  }
  if (command.status !== "implemented") {
    return { previewability: "degraded", reason: `@${command.canonicalName} is stubbed and is materialized as the formal runtime no-op.` };
  }
  if (command.commandId === "choice" || command.commandId === "input") return { previewability: "decision" };
  if (command.commandId === "end") {
    return { previewability: "no-stable-result", reason: "@end has no active checkpoint to restore." };
  }
  if (command.commandId === "wait") {
    return { previewability: "no-stable-result", reason: "@wait remains stubbed and an active runtime wait is not saveable." };
  }
  if (["flash", "shake", "glitch", "toast", "movie", "sfxfast", "trialkeyword"].includes(command.commandId)) {
    return { previewability: "no-stable-result", reason: `@${command.canonicalName} is transient and has no stable checkpoint result.` };
  }
  if (command.commandId === "sfx" && command.params.loop !== true) {
    return { previewability: "no-stable-result", reason: "One-shot SFX playback is transient and is excluded from VN checkpoints." };
  }
  return { previewability: "stable" };
}

function mostRestrictivePreview(commands: VnDebugCommandInspection[]): VnDebugCommandInspection | undefined {
  const priority: Record<VnDebugPreviewability, number> = {
    blocked: 5,
    "no-stable-result": 4,
    decision: 3,
    degraded: 2,
    stable: 1
  };
  return commands.reduce<VnDebugCommandInspection | undefined>(
    (current, command) => !current || priority[command.previewability] > priority[current.previewability] ? command : current,
    undefined
  );
}

function resolveAnchorIdentity(anchor: VnDebugTargetAnchor): string {
  return anchor.stableId ?? anchor.fingerprint ?? `${anchor.revision}:${anchor.commandIndex}:${anchor.commandId ?? anchor.label ?? ""}`;
}

function anchorsShareIdentity(left: VnDebugTargetAnchor, right: VnDebugTargetAnchor): boolean {
  return left.scriptPath === right.scriptPath && resolveAnchorIdentity(left) === resolveAnchorIdentity(right);
}

function findInputDecision(trace: VnDebugDecisionTrace, anchor: VnDebugTargetAnchor): VnDebugInputDecision | undefined {
  return trace.inputs.find((decision) => anchorsShareIdentity(decision.anchor, anchor));
}

function selectChoiceDecisionIndex(
  trace: VnDebugDecisionTrace,
  anchor: VnDebugTargetAnchor,
  choices: StoryChoiceOption[]
): number | undefined {
  const decision = trace.choices.find((candidate) => anchorsShareIdentity(candidate.anchor, anchor));
  if (!decision) return undefined;
  if (decision.choiceId) {
    const matches = choices
      .map((choice, index) => ({ choice, index }))
      .filter(({ choice }) => choice.enabled !== false && choice.id === decision.choiceId);
    if (matches.length === 1) return matches[0]!.index;
  }
  const matches = choices
    .map((choice, index) => ({ choice, index }))
    .filter(({ choice }) => choice.enabled !== false && choice.text === decision.text && choice.goto === decision.goto);
  return matches.length === 1 ? matches[0]!.index : undefined;
}

function switchDebugNavigation(
  session: VnSessionState,
  endpoint: string,
  inspectionsByPath: ReadonlyMap<string, VnDebugScriptInspection>
):
  | { ok: true; session: VnSessionState; inspection: VnDebugScriptInspection }
  | { ok: false; message: string } {
  const parsed = parseStaticNaniEndpoint(endpoint, session.script.scriptPath);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  const inspection = inspectionsByPath.get(parsed.endpoint.scriptPath);
  if (!inspection) {
    return { ok: false, message: `Nani navigation target '${parsed.endpoint.scriptPath}' is not in the debug catalog.` };
  }
  const instructionPointer = parsed.endpoint.label
    ? inspection.script.labels[parsed.endpoint.label]
    : 0;
  if (instructionPointer === undefined) {
    return {
      ok: false,
      message: `Nani navigation label '#${parsed.endpoint.label}' does not exist in '${inspection.source.scriptPath}'.`
    };
  }
  return {
    ok: true,
    inspection,
    session: switchVnSessionScript(session, { script: inspection.script, instructionPointer })
  };
}

function ready(
  base: Omit<VnDebugMaterializationBase, "status">,
  entry: VnEntryDef,
  source: VnRuntimeScriptSource,
  session: VnSessionState,
  pixiStage: PixiStageSnapshot,
  mediaState: MediaRuntimeState,
  uiState: UiRuntimeState,
  resolvedTarget: VnDebugTargetAnchor
): VnDebugMaterializationResult {
  const checkpoint = collectVnSaveCheckpoint({
    active: session.active,
    allowInactive: false,
    entryId: entry.id,
    script: { scriptPath: source.scriptPath, scriptRevision: source.scriptRevision },
    story: session.story,
    pixiStage,
    media: createVnMediaCheckpoint(mediaState),
    ui: createVnUiCheckpoint(uiState)
  });
  if (!checkpoint.ok) {
    return blocked(base, "unstable-checkpoint", checkpoint.message);
  }
  return { ...base, status: "ready", checkpoint: checkpoint.value, resolvedTarget };
}

function blocked(
  base: Omit<VnDebugMaterializationBase, "status">,
  code: VnDebugMaterializationBlockedCode,
  message: string
): VnDebugMaterializationBlocked {
  return { ...base, status: "blocked", code, message };
}

function requireInputDecision(
  base: Omit<VnDebugMaterializationBase, "status">,
  anchor: VnDebugTargetAnchor,
  wait: Extract<NonNullable<VnSessionState["story"]["runtimeWait"]>, { kind: "input" }>,
  reason: VnDebugInputRequest["reason"]
): VnDebugMaterializationDecisionRequired {
  return {
    ...base,
    status: "decision-required",
    decision: {
      kind: "input",
      anchor,
      variableName: wait.variableName,
      valueType: wait.valueType,
      ...(wait.summary ? { summary: wait.summary } : {}),
      ...(wait.defaultValue !== undefined ? { defaultValue: wait.defaultValue } : {}),
      reason
    }
  };
}

function isChoiceGroupCommand(command: RuntimeCommand | undefined): boolean {
  return command?.category === "choice" || command?.commandId === "clearchoice";
}

function isObservableStableCommand(command: VnDebugCommandInspection): boolean {
  if (command.previewability === "blocked" || command.previewability === "no-stable-result") return false;
  return command.command.commandId === "print"
    || command.command.commandId === "choice"
    || command.command.commandId === "input"
    || command.command.category === "actor"
    || command.command.category === "scene"
    || command.command.category === "effect"
    || command.command.category === "media"
    || command.command.category === "ui";
}

function materializationCycleKey(session: VnSessionState): string {
  return stableJson({
    scriptPath: session.story.currentScriptPath,
    instructionPointer: session.story.instructionPointer,
    variables: session.story.variables,
    choices: session.story.pendingChoices,
    presentationWait: session.story.presentationWait,
    runtimeWait: session.story.runtimeWait
  });
}

function isErrorDiagnostic(diagnostic: { severity?: "info" | "warning" | "error" }): boolean {
  return diagnostic.severity === "error";
}

function normalizeSource(source: string): string {
  return source.trim().replace(/\s+/gu, " ");
}

function shortFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sameDebugScriptSource(left: VnRuntimeScriptSource, right: VnRuntimeScriptSource): boolean {
  return left.scriptPath === right.scriptPath
    && left.sourceText === right.sourceText
    && left.scriptRevision === right.scriptRevision;
}

function abortError(): Error {
  const error = new Error("Nani debug materialization was cancelled.");
  error.name = "AbortError";
  return error;
}

function yieldMaterializerControl(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}
