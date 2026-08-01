import {
  type VnDebugDecisionTrace,
  type VnDebugMaterializationMode,
  type VnDebugScriptInspection,
  type VnDebugMaterializationDecisionRequired,
  type VnDebugTargetAnchor
} from "@v-ronpa/app-vn-runtime/debug";
import type { VnDevtoolsDecisionSubmission, VnDevtoolsStatus } from "./types";
import type { VnDevtoolsScriptCandidate } from "./scriptCandidate";

/**
 * The Dock always displays the newest saved source, including a rejected
 * candidate. Local verification may authorize FastDebug calculation; only a
 * catalog-verified display represents a source already proven installable.
 */
export type VnDevtoolsInspectionDisplay =
  | {
    access: "read-only";
    inspection: VnDebugScriptInspection;
  }
  | {
    access: "verified-local";
    inspection: VnDebugScriptInspection;
    expectedRevision?: string;
  }
  | {
    access: "catalog-verified";
    inspection: VnDebugScriptInspection;
    expectedRevision?: string;
  };

export interface VnDevtoolsPreviewAuthorization {
  authorize(allowed?: boolean): void;
  freeze(): void;
  isAuthorized(): boolean;
}

/** Synchronous guard used while React is still rendering a read-only HMR display. */
export function createVnDevtoolsPreviewAuthorization(): VnDevtoolsPreviewAuthorization {
  let authorized = false;
  return {
    authorize(allowed = true) {
      authorized = allowed;
    },
    freeze() {
      authorized = false;
    },
    isAuthorized: () => authorized
  };
}

export function createReadOnlyVnDevtoolsInspectionDisplay(
  inspection: VnDebugScriptInspection
): VnDevtoolsInspectionDisplay {
  return { access: "read-only", inspection };
}

export function createVerifiedLocalVnDevtoolsInspectionDisplay(
  inspection: VnDebugScriptInspection,
  expectedRevision?: string
): VnDevtoolsInspectionDisplay {
  return {
    access: "verified-local",
    inspection,
    ...(expectedRevision ? { expectedRevision } : {})
  };
}

export function createCatalogVerifiedVnDevtoolsInspectionDisplay(
  inspection: VnDebugScriptInspection,
  expectedRevision?: string
): VnDevtoolsInspectionDisplay {
  return {
    access: "catalog-verified",
    inspection,
    ...(expectedRevision ? { expectedRevision } : {})
  };
}

export function canMaterializeVnDevtoolsInspection(
  display: VnDevtoolsInspectionDisplay | undefined,
  mode: VnDebugMaterializationMode
): display is Exclude<VnDevtoolsInspectionDisplay, { access: "read-only" }> {
  return display?.access === "catalog-verified"
    || (mode === "fast-current-script" && display?.access === "verified-local");
}

export function canPinCurrentVnDevtoolsInspection(
  display: VnDevtoolsInspectionDisplay | undefined,
  installedEntry: VnDevtoolsScriptCandidate
): boolean {
  return display?.access === "catalog-verified"
    && vnDebugScriptIdentity(display.inspection) === vnDebugScriptIdentity(installedEntry);
}

/** A cancelled candidate may restore preview access only to the installed source. */
export function canReauthorizeVnDevtoolsInspection(
  display: VnDevtoolsInspectionDisplay | undefined,
  installedEntry: VnDevtoolsScriptCandidate
): boolean {
  return Boolean(
    display?.inspection.canMaterialize
    && vnDebugScriptIdentity(display.inspection) === vnDebugScriptIdentity(installedEntry)
  );
}

export function resolveCurrentVnDevtoolsAnchor({
  inspection,
  instructionPointer,
  mapsInstalledScript,
  runtimeActive
}: {
  inspection: VnDebugScriptInspection | undefined;
  instructionPointer: number;
  mapsInstalledScript: boolean;
  runtimeActive: boolean;
}): VnDebugTargetAnchor | undefined {
  if (!inspection || !runtimeActive || !mapsInstalledScript || inspection.commands.length === 0) return undefined;
  const activeCommandIndex = Math.max(0, Math.min(inspection.commands.length - 1, instructionPointer - 1));
  return inspection.commands[activeCommandIndex]?.anchor;
}

/** Presenter/resource fallback diagnostics remain visible after an async commit. */
export function applyVnDevtoolsRuntimeDegradation(
  status: VnDevtoolsStatus,
  diagnostics: readonly { source: string; severity: "info" | "warning" | "error" }[]
): VnDevtoolsStatus {
  if (status.degraded || !diagnostics.some(
    (diagnostic) => diagnostic.source === "asset" && diagnostic.severity !== "info"
  )) return status;
  return { ...status, degraded: true };
}

export function appendVnDevtoolsDecision(
  trace: VnDebugDecisionTrace,
  pending: VnDebugMaterializationDecisionRequired,
  submission: VnDevtoolsDecisionSubmission
): VnDebugDecisionTrace | undefined {
  const request = pending.decision;
  if (submission.decisionId !== vnDebugAnchorIdentity(request.anchor)) return undefined;
  if (request.kind === "choice" && submission.kind === "choice") {
    const choice = request.choices.find((candidate, index) => (candidate.id ?? String(index)) === submission.optionId);
    if (!choice) return undefined;
    const choices = trace.choices.filter((decision) => !vnDebugAnchorsEqual(decision.anchor, request.anchor));
    return {
      ...trace,
      choices: [...choices, {
        anchor: request.anchor,
        ...(choice.id ? { choiceId: choice.id } : {}),
        text: choice.text,
        ...(choice.goto ? { goto: choice.goto } : {})
      }]
    };
  }
  if (request.kind === "input" && submission.kind === "input") {
    const inputs = trace.inputs.filter((decision) => !vnDebugAnchorsEqual(decision.anchor, request.anchor));
    return { ...trace, inputs: [...inputs, { anchor: request.anchor, value: submission.value }] };
  }
  return undefined;
}

export function vnDebugAnchorsEqual(left: VnDebugTargetAnchor, right: VnDebugTargetAnchor): boolean {
  return left.scriptPath === right.scriptPath && vnDebugAnchorIdentity(left) === vnDebugAnchorIdentity(right);
}

export function vnDebugAnchorIdentity(anchor: VnDebugTargetAnchor): string {
  return anchor.stableId
    ?? anchor.fingerprint
    ?? `${anchor.revision}:${anchor.kind}:${anchor.commandIndex}:${anchor.label ?? anchor.commandId ?? ""}`;
}

export function vnDebugScriptIdentity(value: VnDevtoolsScriptCandidate | VnDebugScriptInspection): string {
  const entry = value.entry;
  const source = value.source;
  return [
    entry.id,
    source.scriptPath,
    source.scriptRevision,
    source.sourceText,
    entry.startLabel ?? "",
    entry.profile ?? ""
  ].join("\u0000");
}
