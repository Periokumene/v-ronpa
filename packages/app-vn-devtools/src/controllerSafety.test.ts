import { describe, expect, it } from "vitest";
import type {
  VnDebugDecisionTrace,
  VnDebugEntryInspection,
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
  createInstallableVnDevtoolsInspectionDisplay,
  createReadOnlyVnDevtoolsInspectionDisplay,
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
      assetRefs: []
    };
    const source = {
      scriptPath: "game-a/opening.nani",
      scriptRevision: "sha256:verified",
      sourceText: "#Start\nNarrator: Hello."
    };
    const candidate = { entry, source, catalog: [source] };
    const inspection = { entry, source, canMaterialize: true } as unknown as VnDebugEntryInspection;
    const rejected = createReadOnlyVnDevtoolsInspectionDisplay(inspection);
    const accepted = createInstallableVnDevtoolsInspectionDisplay(inspection, "sha256:verified");

    expect(rejected).toEqual({
      access: "read-only",
      inspection
    });
    expect(accepted).toEqual({
      access: "installable",
      inspection,
      expectedRevision: "sha256:verified"
    });
    expect(canMaterializeVnDevtoolsInspection(rejected)).toBe(false);
    expect(canPinCurrentVnDevtoolsInspection(rejected, candidate)).toBe(false);
    expect(canMaterializeVnDevtoolsInspection(accepted)).toBe(true);
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
    } as VnDebugEntryInspection;

    expect(resolveCurrentVnDevtoolsAnchor({
      inspection,
      instructionPointer: 0,
      mapsInstalledEntry: true,
      runtimeActive: false
    })).toBeUndefined();
    expect(resolveCurrentVnDevtoolsAnchor({
      inspection,
      instructionPointer: 1,
      mapsInstalledEntry: true,
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
