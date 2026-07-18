import { describe, expect, it } from "vitest";
import { PIXI_MAIN_BACKGROUND_ID } from "@v-ronpa/contracts";
import type { VnRuntimeEntry } from "./runtimeTypes";
import {
  inspectVnDebugEntry,
  materializeVnDebugTarget,
  type VnDebugChoiceRequest,
  type VnDebugInputRequest
} from "./debugMaterializer";

describe("VN debug inspection and materialization", () => {
  it("materializes Story, Pixi, UI, and persistent media from the canonical start label", async () => {
    const inspection = await inspectVnDebugEntry(entry([
      "#Start",
      '@set route:"preview"',
      "@back bg:harness effect:fade time:0.2 wait!",
      "@char Ema.Pensive1 pos:50 time:0.1 wait!",
      "@rain power:0.5 wind:-1 hue:215 tint:0.55 time:0.1 wait!",
      "@bgm bgm:harness group:music volume:0.4",
      "@sfx sfx:rain group:rain loop:true volume:0.25",
      "@hideUI commandBar time:0.2 wait!",
      "Felix: Stable preview.|#preview_line|",
      "@end"
    ].join("\n")));
    const target = inspection.commands.find((command) => command.anchor.stableId === "print:preview_line")!.anchor;
    const result = await materializeVnDebugTarget({ entry: inspection.entry, inspection, target });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.checkpoint.story).toMatchObject({
      variables: { route: "preview" },
      text: { current: { speaker: "Felix", text: "Stable preview." } }
    });
    expect(result.checkpoint.pixiStage).toMatchObject({
      backgroundsById: { [PIXI_MAIN_BACKGROUND_ID]: { appearance: "bg:harness" } },
      charactersById: { Ema: { appearanceExpression: "Pensive1", pos: [0.5, 0] } },
      weather: { rain: { commandParams: { power: 0.5, wind: -1, hue: 215, tint: 0.55 } } }
    });
    expect(result.checkpoint.ui.commandBar).toBe(false);
    expect(result.checkpoint.media.bgmByGroup.music).toEqual({ sourceRef: "bgm:harness", volume: 0.4 });
    expect(result.checkpoint.media.loopingSfxByKey.rain).toEqual({ sourceRef: "sfx:rain", group: "rain", volume: 0.25 });
  });

  it("stops at a complete choice group, and requests a decision only when traversing beyond it", async () => {
    const inspection = await inspectVnDebugEntry(entry([
      "#Start",
      '@choice "Left" goto:#Left id:left',
      '@choice "Right" goto:#Right id:right',
      "#Left",
      "Narrator: Left route.|#left_line|",
      "@end",
      "#Right",
      "Narrator: Right route.|#right_line|",
      "@end"
    ].join("\n")));
    const choiceTarget = inspection.commands.find((command) => command.command.commandId === "choice")!.anchor;
    const choicePreview = await materializeVnDebugTarget({ entry: inspection.entry, inspection, target: choiceTarget });
    expect(choicePreview.status).toBe("ready");
    if (choicePreview.status === "ready") {
      expect(choicePreview.checkpoint.story.pendingChoices.map((choice) => choice.id)).toEqual(["left", "right"]);
    }

    const rightTarget = inspection.commands.find((command) => command.anchor.stableId === "print:right_line")!.anchor;
    const requested = await materializeVnDebugTarget({ entry: inspection.entry, inspection, target: rightTarget });
    expect(requested.status).toBe("decision-required");
    if (requested.status !== "decision-required") return;
    const decision = requested.decision as VnDebugChoiceRequest;
    expect(decision.kind).toBe("choice");
    expect(decision.choices.map((choice) => choice.id)).toEqual(["left", "right"]);

    const resolved = await materializeVnDebugTarget({
      entry: inspection.entry,
      inspection,
      target: rightTarget,
      decisions: {
        inputs: [],
        choices: [{ anchor: decision.anchor, choiceId: "right", text: "Right", goto: "Right" }]
      }
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status === "ready") expect(resolved.checkpoint.story.text?.current?.text).toBe("Right route.");
  });

  it("requires a separate decision for choice groups that reuse the same option ids", async () => {
    const inspection = await inspectVnDebugEntry(entry([
      "#Start",
      '@choice "First yes" goto:#FirstYes id:yes',
      '@choice "First no" goto:#FirstNo id:no',
      "#FirstYes",
      "@goto #Second",
      "#FirstNo",
      "@goto #Second",
      "#Second",
      '@choice "Second yes" goto:#SecondYes id:yes',
      '@choice "Second no" goto:#SecondNo id:no',
      "#SecondYes",
      "Narrator: Second yes route.|#second_yes|",
      "@end",
      "#SecondNo",
      "Narrator: Second no route.|#second_no|",
      "@end"
    ].join("\n")));
    const target = inspection.commands.find((command) => command.anchor.stableId === "print:second_no")!.anchor;

    const firstRequest = await materializeVnDebugTarget({ entry: inspection.entry, inspection, target });
    expect(firstRequest.status).toBe("decision-required");
    if (firstRequest.status !== "decision-required" || firstRequest.decision.kind !== "choice") return;
    expect(firstRequest.decision.anchor).toMatchObject({ commandId: "choice-group" });
    expect(firstRequest.decision.anchor.stableId).toMatch(/^choice-group:/u);

    const firstDecision = {
      anchor: firstRequest.decision.anchor,
      choiceId: "yes",
      text: "First yes",
      goto: "FirstYes"
    };
    const secondRequest = await materializeVnDebugTarget({
      entry: inspection.entry,
      inspection,
      target,
      decisions: { choices: [firstDecision], inputs: [] }
    });

    expect(secondRequest.status).toBe("decision-required");
    if (secondRequest.status !== "decision-required" || secondRequest.decision.kind !== "choice") return;
    expect(secondRequest.decision).toMatchObject({ reason: "missing" });
    expect(secondRequest.decision.choices.map((choice) => choice.id)).toEqual(["yes", "no"]);
    expect(secondRequest.decision.anchor.stableId).toMatch(/^choice-group:/u);
    expect(secondRequest.decision.anchor.stableId).not.toBe(firstRequest.decision.anchor.stableId);

    const resolved = await materializeVnDebugTarget({
      entry: inspection.entry,
      inspection,
      target,
      decisions: {
        choices: [
          firstDecision,
          {
            anchor: secondRequest.decision.anchor,
            choiceId: "no",
            text: "Second no",
            goto: "SecondNo"
          }
        ],
        inputs: []
      }
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status === "ready") expect(resolved.checkpoint.story.text?.current?.text).toBe("Second no route.");
  });

  it("requires explicit input even when a default exists, then checkpoints the submitted value", async () => {
    const inspection = await inspectVnDebugEntry(entry([
      "#Start",
      '@input codename type:string summary:"Codename" value:Felix',
      "Narrator: After input.|#after_input|"
    ].join("\n")));
    const inputTarget = inspection.commands.find((command) => command.command.commandId === "input")!.anchor;
    const requested = await materializeVnDebugTarget({ entry: inspection.entry, inspection, target: inputTarget });
    expect(requested.status).toBe("decision-required");
    if (requested.status !== "decision-required") return;
    const decision = requested.decision as VnDebugInputRequest;
    expect(decision).toMatchObject({ kind: "input", variableName: "codename", defaultValue: "Felix" });

    const resolved = await materializeVnDebugTarget({
      entry: inspection.entry,
      inspection,
      target: inputTarget,
      decisions: { choices: [], inputs: [{ anchor: decision.anchor, value: "Mira" }] }
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status === "ready") expect(resolved.checkpoint.story.variables.codename).toBe("Mira");
  });

  it("rejects an invalid typed input decision without entering a synchronous replay loop", async () => {
    const inspection = await inspectVnDebugEntry(entry([
      "#Start",
      '@input score type:number summary:"Score"',
      "Narrator: After input.|#after_number_input|"
    ].join("\n")));
    const inputTarget = inspection.commands.find((command) => command.command.commandId === "input")!.anchor;
    const requested = await materializeVnDebugTarget({ entry: inspection.entry, inspection, target: inputTarget });
    expect(requested.status).toBe("decision-required");
    if (requested.status !== "decision-required") return;

    const stale = await materializeVnDebugTarget({
      entry: inspection.entry,
      inspection,
      target: inputTarget,
      decisions: { choices: [], inputs: [{ anchor: requested.decision.anchor, value: "not-a-number" }] }
    });

    expect(stale).toMatchObject({
      status: "decision-required",
      decision: { kind: "input", variableName: "score", valueType: "number", reason: "stale" }
    });
    expect(stale.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "input-validation", severity: "warning" })
    ]));
  });

  it("requests input when a label resolves to an input as its first observable point", async () => {
    const inspection = await inspectVnDebugEntry(entry([
      "#Start",
      "@goto #Profile",
      "#Profile",
      '@input codename type:string summary:"Codename" value:Felix',
      "Narrator: After input.|#after_label_input|"
    ].join("\n")));
    const labelTarget = inspection.labels.find((label) => label.name === "Profile")!.anchor;
    const requested = await materializeVnDebugTarget({ entry: inspection.entry, inspection, target: labelTarget });

    expect(requested.status).toBe("decision-required");
    if (requested.status !== "decision-required") return;
    expect(requested.decision).toMatchObject({ kind: "input", variableName: "codename", defaultValue: "Felix" });
  });

  it("automatically traverses one enabled choice and reuses a unique text/goto decision without an id", async () => {
    const automatic = await inspectVnDebugEntry(entry([
      "#Start",
      '@choice "Locked" goto:#Locked enabled:false',
      '@choice "Open" goto:#Open enabled:true',
      "#Locked",
      "Narrator: Locked.|#locked|",
      "#Open",
      "Narrator: Open route.|#open|"
    ].join("\n")));
    const openTarget = automatic.commands.find((command) => command.anchor.stableId === "print:open")!.anchor;
    const autoResult = await materializeVnDebugTarget({ entry: automatic.entry, inspection: automatic, target: openTarget });
    expect(autoResult.status).toBe("ready");
    if (autoResult.status === "ready") expect(autoResult.checkpoint.story.text?.current?.text).toBe("Open route.");

    const branching = await inspectVnDebugEntry(entry([
      "#Start",
      '@choice "Left" goto:#Left',
      '@choice "Right" goto:#Right',
      "#Left",
      "Narrator: Left.|#left_no_id|",
      "#Right",
      "Narrator: Right.|#right_no_id|"
    ].join("\n")));
    const rightTarget = branching.commands.find((command) => command.anchor.stableId === "print:right_no_id")!.anchor;
    const request = await materializeVnDebugTarget({ entry: branching.entry, inspection: branching, target: rightTarget });
    expect(request.status).toBe("decision-required");
    if (request.status !== "decision-required" || request.decision.kind !== "choice") return;
    const rightChoice = request.decision.choices.find((choice) => choice.text === "Right")!;
    expect(rightChoice.id).toBeUndefined();
    const resolved = await materializeVnDebugTarget({
      entry: branching.entry,
      inspection: branching,
      target: rightTarget,
      decisions: {
        inputs: [],
        choices: [{
          anchor: request.decision.anchor,
          text: rightChoice.text,
          ...(rightChoice.goto ? { goto: rightChoice.goto } : {})
        }]
      }
    });
    expect(resolved.status).toBe("ready");
    if (resolved.status === "ready") expect(resolved.checkpoint.story.text?.current?.text).toBe("Right.");
  });

  it("honors conditions and goto, and blocks expression failures, limits, and end targets", async () => {
    const conditional = await inspectVnDebugEntry(entry([
      "#Start",
      "@set showBg:true",
      "@back bg:harness if:{showBg}",
      "@goto #Result",
      "@back bg:unused",
      "#Result",
      "Narrator: Conditional.|#conditional|"
    ].join("\n")));
    const conditionalTarget = conditional.commands.find((command) => command.anchor.stableId === "print:conditional")!.anchor;
    const conditionalResult = await materializeVnDebugTarget({
      entry: conditional.entry,
      inspection: conditional,
      target: conditionalTarget
    });
    expect(conditionalResult.status).toBe("ready");
    if (conditionalResult.status === "ready") {
      expect(conditionalResult.checkpoint.pixiStage.backgroundsById[PIXI_MAIN_BACKGROUND_ID]?.appearance).toBe("bg:harness");
    }

    const expression = await inspectVnDebugEntry(entry([
      "#Start",
      "@back bg:harness if:{missingVariable}",
      "Narrator: Never.|#after_expression|"
    ].join("\n")));
    const expressionTarget = expression.commands.find((command) => command.anchor.stableId === "print:after_expression")!.anchor;
    expect(await materializeVnDebugTarget({ entry: expression.entry, inspection: expression, target: expressionTarget }))
      .toMatchObject({ status: "blocked", code: "expression-error" });

    const limited = await inspectVnDebugEntry(entry("#Start\n@set a:1\n@set b:2\nNarrator: Late.|#late|"));
    const limitedTarget = limited.commands.find((command) => command.anchor.stableId === "print:late")!.anchor;
    expect(await materializeVnDebugTarget({
      entry: limited.entry,
      inspection: limited,
      target: limitedTarget,
      maxInstructions: 1
    })).toMatchObject({ status: "blocked", code: "instruction-limit" });

    const ended = await inspectVnDebugEntry(entry("#Start\n@end"));
    expect(await materializeVnDebugTarget({ entry: ended.entry, inspection: ended, target: ended.commands[0]!.anchor }))
      .toMatchObject({ status: "blocked", code: "no-stable-result" });
  });

  it("reuses explicit ids across revisions but refuses ambiguous or deleted targets", async () => {
    const first = await inspectVnDebugEntry(entry("#Start\nNarrator: Before.|#stable_text|"));
    const anchor = first.commands[0]!.anchor;
    const edited = await inspectVnDebugEntry(entry("#Start\n// inserted\nNarrator: After.|#stable_text|"));
    const remapped = await materializeVnDebugTarget({ entry: edited.entry, inspection: edited, target: anchor });
    expect(remapped.status).toBe("ready");
    if (remapped.status === "ready") expect(remapped.checkpoint.story.text?.current?.text).toBe("After.");

    const deleted = await inspectVnDebugEntry(entry("#Start\nNarrator: Other.|#other_text|"));
    const invalid = await materializeVnDebugTarget({ entry: deleted.entry, inspection: deleted, target: anchor });
    expect(invalid).toMatchObject({ status: "blocked", code: "target-invalid" });
  });

  it("refuses to materialize an inspection paired with a different entry source", async () => {
    const inspection = await inspectVnDebugEntry(entry("#Start\nNarrator: Inspected.|#inspected|"));
    const mismatchedEntry = entry("#Start\nNarrator: Different.|#different|");

    expect(await materializeVnDebugTarget({
      entry: mismatchedEntry,
      inspection,
      target: inspection.commands[0]!.anchor
    })).toMatchObject({
      status: "blocked",
      code: "invalid-source",
      message: expect.stringContaining("does not belong")
    });
  });

  it("blocks host gameplay effects, transient-only targets, loops, and revision disagreements", async () => {
    const gameplay = await inspectVnDebugEntry(entry([
      "#Start",
      "@gameplay grant-item item:key",
      "Narrator: Never commit.|#after_gameplay|"
    ].join("\n")));
    const gameplayTarget = gameplay.commands.find((command) => command.anchor.stableId === "print:after_gameplay")!.anchor;
    expect(await materializeVnDebugTarget({ entry: gameplay.entry, inspection: gameplay, target: gameplayTarget }))
      .toMatchObject({ status: "blocked", code: "gameplay-event" });

    const transient = await inspectVnDebugEntry(entry("#Start\n@flash color:#fff time:0.1"));
    expect(await materializeVnDebugTarget({ entry: transient.entry, inspection: transient, target: transient.commands[0]!.anchor }))
      .toMatchObject({ status: "blocked", code: "no-stable-result" });

    const trialKeyword = await inspectVnDebugEntry(entry('#Start\n@trialKeyword id:door text:"Door"'));
    expect(await materializeVnDebugTarget({
      entry: trialKeyword.entry,
      inspection: trialKeyword,
      target: trialKeyword.commands[0]!.anchor
    })).toMatchObject({ status: "blocked", code: "no-stable-result" });

    const stubbed = await inspectVnDebugEntry(entry("#Start\n@wait i"));
    expect(await materializeVnDebugTarget({ entry: stubbed.entry, inspection: stubbed, target: stubbed.commands[0]!.anchor }))
      .toMatchObject({ status: "ready", degraded: true });

    const looping = await inspectVnDebugEntry(entry("#Start\n@goto #Start\nNarrator: Unreachable.|#unreachable|"));
    const loopTarget = looping.commands.find((command) => command.anchor.stableId === "print:unreachable")!.anchor;
    expect(await materializeVnDebugTarget({ entry: looping.entry, inspection: looping, target: loopTarget }))
      .toMatchObject({ status: "blocked", code: "loop-detected" });

    expect(await materializeVnDebugTarget({
      entry: gameplay.entry,
      inspection: gameplay,
      target: gameplayTarget,
      expectedRevision: "sha256:not-the-server-revision"
    })).toMatchObject({ status: "blocked", code: "revision-mismatch" });
  });

  it("yields during long replay so a newer task can abort before the commit boundary", async () => {
    const setup = Array.from({ length: 512 }, (_, index) => `@set replay_step:${index}`);
    const inspection = await inspectVnDebugEntry(entry([
      "#Start",
      ...setup,
      "Narrator: Must not install.|#after_long_replay|"
    ].join("\n")));
    const target = inspection.commands.find((command) => command.anchor.stableId === "print:after_long_replay")!.anchor;
    const abortController = new AbortController();
    const materialization = materializeVnDebugTarget({
      entry: inspection.entry,
      inspection,
      target,
      signal: abortController.signal
    });

    queueMicrotask(() => abortController.abort());

    await expect(materialization).rejects.toMatchObject({ name: "AbortError" });
  });

  it("commits deterministic fallback diagnostics as degraded instead of discarding the stable result", async () => {
    const inspection = await inspectVnDebugEntry(entry([
      "#Start",
      "@rain power:2 hue:999",
      "Narrator: Normalized preview.|#normalized_preview|"
    ].join("\n")));
    const target = inspection.commands.find((command) => command.anchor.stableId === "print:normalized_preview")!.anchor;
    const result = await materializeVnDebugTarget({ entry: inspection.entry, inspection, target });

    expect(result.status).toBe("ready");
    expect(result.degraded).toBe(true);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "normalized-pixi-params", severity: "warning" })
    ]));
  });

  it("marks degradation from the executed path rather than unreachable stubbed commands", async () => {
    const inspection = await inspectVnDebugEntry(entry([
      "#Start",
      "Narrator: Stable first.|#stable_first|",
      "@goto #End",
      "#Unused",
      "@wait i",
      "#End",
      "Narrator: Done.|#done|"
    ].join("\n")));
    const firstTarget = inspection.commands.find((command) => command.anchor.stableId === "print:stable_first")!.anchor;
    const result = await materializeVnDebugTarget({ entry: inspection.entry, inspection, target: firstTarget });

    expect(inspection.degraded).toBe(true);
    expect(result).toMatchObject({ status: "ready", degraded: false });
  });

  it("returns the stable no-op state when a targeted conditional choice is disabled", async () => {
    const inspection = await inspectVnDebugEntry(entry([
      "#Start",
      "@set enabled:false",
      '@choice "Hidden" goto:#Hidden if:{enabled}',
      "Narrator: After choice.|#after_disabled_choice|",
      "#Hidden",
      "Narrator: Hidden."
    ].join("\n")));
    const target = inspection.commands.find((command) => command.command.commandId === "choice")!.anchor;
    const result = await materializeVnDebugTarget({ entry: inspection.entry, inspection, target });

    expect(result).toMatchObject({ status: "ready" });
    if (result.status !== "ready") return;
    expect(result.checkpoint.story.pendingChoices).toEqual([]);
    expect(result.checkpoint.story.variables.enabled).toBe(false);
  });
});

function entry(sourceText: string): VnRuntimeEntry {
  return {
    id: "vn:debug-test",
    scriptPath: "game-a/debug-test.nani",
    scriptRevision: "sha256:generated-placeholder",
    sourceText,
    startLabel: "Start",
    profile: "vn2d"
  };
}
