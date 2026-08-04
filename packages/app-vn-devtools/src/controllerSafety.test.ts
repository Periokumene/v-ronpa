import { describe, expect, it } from "vitest";
import type {
  VnDebugDecisionTrace,
  VnDebugScriptInspection,
  VnDebugMaterializationDecisionRequired,
  VnDebugTargetAnchor
} from "@v-ronpa/app-vn-runtime/debug";
import {
  appendVnDevtoolsDecision,
  applyVnDevtoolsRuntimeDegradation,
  canMaterializeVnDevtoolsInspection,
  canPinCurrentVnDevtoolsInspection,
  canReauthorizeVnDevtoolsInspection,
  createVnDevtoolsPreviewAuthorization,
  createCatalogVerifiedVnDevtoolsInspectionDisplay,
  createReadOnlyVnDevtoolsInspectionDisplay,
  createVerifiedLocalVnDevtoolsInspectionDisplay,
  resolveCurrentVnDevtoolsAnchor,
  vnDebugAnchorIdentity
} from "./controllerSafety";

describe("VN devtools controller safety", () => {
  it("keeps a rejected candidate visible without granting materialization access", () => {
    const entry = {
      id: "opening",
      title: "Opening",
      initialScriptPath: "game-a/opening.nani",
      startLabel: "Start",
      profile: "vn2d" as const,
      requirements: []
    };
    const source = {
      scriptPath: "game-a/opening.nani",
      scriptRevision: "sha256:verified",
      sourceText: "#Start\nNarrator: Hello."
    };
    const candidate = {
      entry,
      source,
      catalog: [source],
      sourceDiagnosticPolicy: "allow-recoverable-command-errors" as const
    };
    const inspection = { entry, source, canMaterialize: true } as unknown as VnDebugScriptInspection;
    const rejected = createReadOnlyVnDevtoolsInspectionDisplay(inspection);
    const local = createVerifiedLocalVnDevtoolsInspectionDisplay(inspection, "sha256:verified");
    const accepted = createCatalogVerifiedVnDevtoolsInspectionDisplay(inspection, "sha256:verified");

    expect(rejected).toEqual({
      access: "read-only",
      inspection
    });
    expect(accepted).toEqual({
      access: "catalog-verified",
      inspection,
      expectedRevision: "sha256:verified"
    });
    expect(local).toEqual({
      access: "verified-local",
      inspection,
      expectedRevision: "sha256:verified"
    });
    expect(canMaterializeVnDevtoolsInspection(rejected, "fast-current-script")).toBe(false);
    expect(canPinCurrentVnDevtoolsInspection(rejected, candidate)).toBe(false);
    expect(canMaterializeVnDevtoolsInspection(local, "fast-current-script")).toBe(true);
    expect(canMaterializeVnDevtoolsInspection(local, "canonical-entry")).toBe(false);
    expect(canPinCurrentVnDevtoolsInspection(local, candidate)).toBe(false);
    expect(canMaterializeVnDevtoolsInspection(accepted, "canonical-entry")).toBe(true);
    expect(canPinCurrentVnDevtoolsInspection(accepted, candidate)).toBe(true);
    expect(canReauthorizeVnDevtoolsInspection(rejected, candidate)).toBe(true);
    expect(canReauthorizeVnDevtoolsInspection(rejected, {
      ...candidate,
      source: { ...source, sourceText: "changed" },
      catalog: [{ ...source, sourceText: "changed" }]
    })).toBe(false);
  });

  it("freezes stale preview synchronously when a source update starts", () => {
    const authorization = createVnDevtoolsPreviewAuthorization();
    authorization.authorize();
    expect(authorization.isAuthorized()).toBe(true);

    authorization.freeze();
    expect(authorization.isAuthorized()).toBe(false);
    authorization.authorize(false);
    expect(authorization.isAuthorized()).toBe(false);
  });

  it("does not fabricate a current source line while the VN runtime is inactive", () => {
    const currentAnchor = anchor("current");
    const inspection = {
      commands: [{ anchor: currentAnchor }]
    } as VnDebugScriptInspection;

    expect(resolveCurrentVnDevtoolsAnchor({
      inspection,
      instructionPointer: 0,
      mapsInstalledScript: true,
      runtimeActive: false
    })).toBeUndefined();
    expect(resolveCurrentVnDevtoolsAnchor({
      inspection,
      instructionPointer: 1,
      mapsInstalledScript: true,
      runtimeActive: true
    })).toBe(currentAnchor);
  });

  it("marks a ready workbench degraded when presentation reports an asset fallback", () => {
    expect(applyVnDevtoolsRuntimeDegradation(
      { phase: "ready", message: "Stable checkpoint installed." },
      [{ source: "asset", severity: "warning" }]
    )).toEqual({ phase: "ready", message: "Stable checkpoint installed.", degraded: true });
    expect(applyVnDevtoolsRuntimeDegradation(
      { phase: "ready" },
      [{ source: "story", severity: "error" }, { source: "asset", severity: "info" }]
    )).toEqual({ phase: "ready" });
  });

  it("rejects a stale choice form whose decision id no longer matches the pending anchor", () => {
    const trace: VnDebugDecisionTrace = { choices: [], inputs: [] };
    const pending = choiceDecision(anchor("current"));

    expect(appendVnDevtoolsDecision(trace, pending, {
      kind: "choice",
      decisionId: vnDebugAnchorIdentity(anchor("stale")),
      optionId: "left"
    })).toBeUndefined();
    expect(appendVnDevtoolsDecision(trace, pending, {
      kind: "choice",
      decisionId: vnDebugAnchorIdentity(pending.decision.anchor),
      optionId: "left"
    })?.choices).toEqual([{
      anchor: pending.decision.anchor,
      choiceId: "left",
      text: "Left",
      goto: "LeftRoute"
    }]);
  });

  it("rejects a stale input form and accepts only the current input decision", () => {
    const trace: VnDebugDecisionTrace = { choices: [], inputs: [] };
    const currentAnchor = anchor("input-current");
    const pending = {
      status: "decision-required",
      decision: {
        kind: "input",
        anchor: currentAnchor,
        variableName: "name",
        valueType: "string"
      }
    } as VnDebugMaterializationDecisionRequired;

    expect(appendVnDevtoolsDecision(trace, pending, {
      kind: "input",
      decisionId: vnDebugAnchorIdentity(anchor("input-stale")),
      value: "Stale"
    })).toBeUndefined();
    expect(appendVnDevtoolsDecision(trace, pending, {
      kind: "input",
      decisionId: vnDebugAnchorIdentity(currentAnchor),
      value: "Makoto"
    })?.inputs).toEqual([{ anchor: currentAnchor, value: "Makoto" }]);
  });
});

function anchor(stableId: string): VnDebugTargetAnchor {
  return {
    kind: "command",
    scriptPath: "game-a/opening.nani",
    revision: "sha256:test",
    commandIndex: 1,
    line: 2,
    ordinal: 0,
    stableId
  };
}

function choiceDecision(decisionAnchor: VnDebugTargetAnchor): VnDebugMaterializationDecisionRequired {
  return {
    status: "decision-required",
    decision: {
      kind: "choice",
      anchor: decisionAnchor,
      choices: [{ id: "left", text: "Left", goto: "LeftRoute", enabled: true }]
    }
  } as VnDebugMaterializationDecisionRequired;
}
