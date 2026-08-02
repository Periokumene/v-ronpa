import { describe, expect, it } from "vitest";
import {
  advanceVnSession,
  completeVnSessionPresentationWait,
  createVnSession,
  stepVnSessionInstruction
} from "@v-ronpa/app-vn-session";
import {
  createInitialMediaRuntimeState,
  createInitialUiRuntimeState,
  createVnMediaCheckpoint,
  createVnUiCheckpoint,
  settleUiRuntimePresentationWait
} from "@v-ronpa/app-vn-dispatch";
import {
  PIXI_MAIN_BACKGROUND_ID,
  type RuntimeCommand,
  type SaveableVnState,
  type VnEntryDef,
  type VnRuntimeScriptSource
} from "@v-ronpa/contracts";
import { createInitialPixiStageSnapshot } from "@v-ronpa/pixi-stage-model";
import { projectVnRuntimeStep } from "./runtimeProjection";
import { collectVnSaveCheckpoint } from "./checkpoint";
import {
  inspectVnDebugScript,
  materializeVnDebugTarget,
  type VnDebugScriptInspection
} from "./debugMaterializer";

function projectLiveCheckpointThroughCommand(
  inspection: VnDebugScriptInspection,
  stopCommandIndex: number
): SaveableVnState {
  const boot = createVnSession({
    scriptPath: inspection.source.scriptPath,
    sourceText: inspection.source.sourceText,
    ...(inspection.entry.startLabel ? { startLabel: inspection.entry.startLabel } : {})
  });
  let session = boot.session;
  let mediaState = createInitialMediaRuntimeState();
  let pixiStage = createInitialPixiStageSnapshot();
  let uiState = createInitialUiRuntimeState();

  while (session.story.instructionPointer <= stopCommandIndex) {
    const commandIndex = session.story.instructionPointer;
    const step = stepVnSessionInstruction(session);
    const projected = projectVnRuntimeStep({
      active: !step.session.story.ended,
      animatePixi: false,
      nowMs: 0,
      previousMediaState: mediaState,
      previousPixiStage: pixiStage,
      previousUiState: uiState,
      profile: inspection.entry.profile ?? "vn2d",
      runtimeCommands: step.emittedRuntimeCommands,
      session: step.session
    });

    session = projected.session;
    mediaState = projected.stable.mediaState;
    pixiStage = projected.stable.pixiStage;
    uiState = projected.stable.uiState;
    if (session.story.presentationWait) {
      if (session.story.presentationWait.channel === "ui") {
        uiState = settleUiRuntimePresentationWait(uiState, session.story.presentationWait);
      }
      session = completeVnSessionPresentationWait(session).session;
    }
    if (commandIndex === stopCommandIndex) break;
  }

  const checkpoint = collectVnSaveCheckpoint({
    active: true,
    entryId: inspection.entry.id,
    script: {
      scriptPath: inspection.source.scriptPath,
      scriptRevision: inspection.source.scriptRevision
    },
    story: session.story,
    pixiStage,
    media: createVnMediaCheckpoint(mediaState),
    ui: createVnUiCheckpoint(uiState)
  });
  if (!checkpoint.ok) throw new Error(checkpoint.message);
  return checkpoint.value;
}

interface StableTargetParityCase {
  name: string;
  stopCanonicalName: string;
  targetLabel?: string;
  assertStableState: (checkpoint: SaveableVnState) => void;
}

const stableTargetParityCases: StableTargetParityCase[] = [
  {
    name: "label target through its first observable Pixi command",
    stopCanonicalName: "back",
    targetLabel: "Visual",
    assertStableState: (checkpoint) => {
      expect(checkpoint.pixiStage.backgroundsById[PIXI_MAIN_BACKGROUND_ID]?.appearance).toBe("bg:harness");
    }
  },
  {
    name: "Pixi command target",
    stopCanonicalName: "char",
    assertStableState: (checkpoint) => {
      expect(checkpoint.pixiStage.charactersById.Ema).toMatchObject({
        appearanceExpression: "Pensive1",
        pos: [0.5, 0]
      });
    }
  },
  {
    name: "UI command target",
    stopCanonicalName: "hideUI",
    assertStableState: (checkpoint) => {
      expect(checkpoint.ui.commandBar).toBe(false);
    }
  },
  {
    name: "persistent BGM target",
    stopCanonicalName: "bgm",
    assertStableState: (checkpoint) => {
      expect(checkpoint.media.bgmByGroup.music).toEqual({ sourceRef: "bgm:harness", volume: 0.4 });
    }
  },
  {
    name: "persistent looping SFX target",
    stopCanonicalName: "sfx",
    assertStableState: (checkpoint) => {
      expect(checkpoint.media.loopingSfxByKey.rain).toEqual({
        sourceRef: "sfx:rain",
        group: "rain",
        volume: 0.25
      });
    }
  }
];

describe("projectVnRuntimeStep", () => {
  it("projects Story, Pixi, UI, and persistent media without applying host side effects", () => {
    const boot = createVnSession({
      scriptPath: "projection.nani",
      sourceText: [
        "@back bg:harness",
        "@bgm bgm:harness volume:0.4",
        "@hideUI dialog time:0.2",
        "Felix: Projected."
      ].join("\n")
    });
    const advanced = advanceVnSession(boot.session);
    const projected = projectVnRuntimeStep({
      active: true,
      animatePixi: false,
      nowMs: 100,
      previousMediaState: createInitialMediaRuntimeState(),
      previousPixiStage: createInitialPixiStageSnapshot(),
      previousUiState: createInitialUiRuntimeState(),
      profile: "vn2d",
      runtimeCommands: advanced.emittedRuntimeCommands,
      session: advanced.session
    });

    expect(projected.session.story.backlog.at(-1)).toEqual({ speaker: "Felix", text: "Projected." });
    expect(projected.stable.pixiStage.backgroundsById[PIXI_MAIN_BACKGROUND_ID]?.appearance).toBe("bg:harness");
    expect(projected.stable.mediaState.bgmByGroup.bgm).toEqual({ sourceRef: "bgm:harness", volume: 0.4 });
    expect(projected.stable.uiState.surfaces.dialog).toMatchObject({
      targetVisible: false,
      mounted: false,
      phase: "hidden"
    });
    expect(projected.transient.mediaEffects.some((effect) => effect.type === "play-bgm")).toBe(true);
  });

  it("projects cue visibility, hideCue wait, and stable checkpoint terminal state", () => {
    const boot = createVnSession({
      scriptPath: "projection-cue.nani",
      sourceText: [
        '@cue "<b>Do not turn around.</b>" author:Narrator textId:cue_projection',
        "@hideCue time:0.4 wait!",
        'Narrator: Safe now.'
      ].join("\n")
    });
    const cueStep = advanceVnSession(boot.session);
    const cueProjection = projectVnRuntimeStep({
      active: true,
      animatePixi: true,
      nowMs: 1000,
      previousMediaState: createInitialMediaRuntimeState(),
      previousPixiStage: createInitialPixiStageSnapshot(),
      previousUiState: createInitialUiRuntimeState(),
      profile: "vn2d",
      runtimeCommands: cueStep.emittedRuntimeCommands,
      session: cueStep.session
    });

    expect(cueProjection.session.story.text?.current).toMatchObject({
      channel: "cue",
      speaker: "Narrator",
      text: "Do not turn around."
    });
    expect(cueProjection.runtime.uiState.surfaces.cue).toMatchObject({
      targetVisible: true,
      mounted: true,
      phase: "shown"
    });
    expect(createVnUiCheckpoint(cueProjection.stable.uiState).cue).toBe(true);

    const hideStep = advanceVnSession(cueProjection.session);
    const hideProjection = projectVnRuntimeStep({
      active: true,
      animatePixi: true,
      nowMs: 1000,
      previousMediaState: cueProjection.stable.mediaState,
      previousPixiStage: cueProjection.stable.pixiStage,
      previousUiState: cueProjection.stable.uiState,
      profile: "vn2d",
      runtimeCommands: hideStep.emittedRuntimeCommands,
      session: hideStep.session
    });

    expect(hideStep.session.story.presentationWait).toMatchObject({ channel: "ui", targets: ["cue"] });
    expect(hideProjection.runtime.uiState.surfaces.cue).toMatchObject({
      targetVisible: false,
      mounted: true,
      opacity: 1,
      phase: "hiding"
    });
    const settled = settleUiRuntimePresentationWait(
      hideProjection.runtime.uiState,
      hideStep.session.story.presentationWait as Extract<NonNullable<typeof hideStep.session.story.presentationWait>, { channel: "ui" }>
    );
    expect(settled.surfaces.cue.phase).toBe("hidden");
    expect(createVnUiCheckpoint(settled).cue).toBe(false);
    expect(hideProjection.session.story.text?.current?.channel).toBe("cue");
  });

  it("keeps no-target hideUI isolated from a shown cue", () => {
    const boot = createVnSession({ scriptPath: "projection-cue-ui.nani", sourceText: '@cue "Cue"' });
    const cueStep = advanceVnSession(boot.session);
    const cueProjection = projectVnRuntimeStep({
      active: true,
      animatePixi: true,
      nowMs: 0,
      previousMediaState: createInitialMediaRuntimeState(),
      previousPixiStage: createInitialPixiStageSnapshot(),
      previousUiState: createInitialUiRuntimeState(),
      profile: "vn2d",
      runtimeCommands: cueStep.emittedRuntimeCommands,
      session: cueStep.session
    });
    const hideUi: RuntimeCommand = {
      commandId: "hideui",
      canonicalName: "hideUI",
      category: "ui",
      source: "naninovel",
      status: "implemented",
      params: { visible: false, wait: false },
      loc: { scriptPath: "projection-cue-ui.nani", line: 2, column: 1, raw: "@hideUI" }
    };
    const hidden = projectVnRuntimeStep({
      active: true,
      animatePixi: true,
      nowMs: 0,
      previousMediaState: cueProjection.stable.mediaState,
      previousPixiStage: cueProjection.stable.pixiStage,
      previousUiState: cueProjection.stable.uiState,
      profile: "vn2d",
      runtimeCommands: [hideUi],
      session: cueProjection.session
    });

    expect(hidden.runtime.uiState.surfaces.cue.phase).toBe("shown");
    expect(hidden.runtime.uiState.surfaces.dialog.phase).toBe("hidden");
    expect(hidden.runtime.uiState.surfaces.commandBar.phase).toBe("hidden");
  });

  it("records terminal Pixi state while suppressing presentation tasks for settled debug projection", () => {
    const boot = createVnSession({
      scriptPath: "projection-wait.nani",
      sourceText: "@back bg:harness effect:fade time:0.2 wait!"
    });
    const advanced = advanceVnSession(boot.session);
    const projected = projectVnRuntimeStep({
      active: true,
      animatePixi: false,
      nowMs: 0,
      previousMediaState: createInitialMediaRuntimeState(),
      previousPixiStage: createInitialPixiStageSnapshot(),
      previousUiState: createInitialUiRuntimeState(),
      profile: "vn2d",
      runtimeCommands: advanced.emittedRuntimeCommands,
      session: advanced.session
    });

    expect(projected.session.story.presentationWait).toMatchObject({
      channel: "pixi",
      expectedTasks: [],
      stageRevision: projected.stable.pixiStage.revision
    });
    expect(projected.transaction.pixiWaitTasks).not.toEqual([]);
  });

  it("keeps character tone for local progression and clears commands scoped to another script", () => {
    const stageWithTone = {
      ...createInitialPixiStageSnapshot(),
      revision: 1,
      characterTone: {
        preset: "rain" as const,
        amount: 1,
        scopeScriptPath: "opening.nani",
        transition: { durationMs: 0, wait: false }
      }
    };
    const opening = createVnSession({ scriptPath: "opening.nani", sourceText: "Narrator: Here." }).session;
    const retained = projectVnRuntimeStep({
      active: true,
      animatePixi: true,
      nowMs: 0,
      previousMediaState: createInitialMediaRuntimeState(),
      previousPixiStage: stageWithTone,
      previousUiState: createInitialUiRuntimeState(),
      profile: "vn2d",
      runtimeCommands: [],
      session: opening
    });
    expect(retained.stable.pixiStage.characterTone).toEqual(stageWithTone.characterTone);

    const chapter = createVnSession({ scriptPath: "chapter-02.nani", sourceText: "Narrator: There." }).session;
    const crossed = projectVnRuntimeStep({
      active: true,
      animatePixi: true,
      nowMs: 0,
      previousMediaState: createInitialMediaRuntimeState(),
      previousPixiStage: stageWithTone,
      previousUiState: createInitialUiRuntimeState(),
      profile: "vn2d",
      runtimeCommands: [],
      session: chapter
    });
    expect(crossed.stable.pixiStage.characterTone).toBeUndefined();

    const intermediateCommand: RuntimeCommand = {
      commandId: "chartone",
      canonicalName: "charTone",
      category: "effect",
      source: "v-ronpa",
      status: "implemented",
      params: { preset: "fog", amount: 1, durationMs: 200, wait: true },
      loc: { scriptPath: "intermediate.nani", line: 1, column: 1, raw: "@charTone fog" }
    };
    const chained = projectVnRuntimeStep({
      active: true,
      animatePixi: true,
      nowMs: 0,
      previousMediaState: createInitialMediaRuntimeState(),
      previousPixiStage: createInitialPixiStageSnapshot(),
      previousUiState: createInitialUiRuntimeState(),
      profile: "vn2d",
      runtimeCommands: [intermediateCommand],
      session: chapter
    });
    expect(chained.stable.pixiStage.characterTone).toBeUndefined();
    expect(chained.transaction.pixiWaitTasks).toEqual([]);
  });

  it("keeps toast payloads in live runtime state but excludes them from stable materialization", () => {
    const boot = createVnSession({
      scriptPath: "projection-toast.nani",
      sourceText: '@toast "Saved"\nNarrator: Continue.'
    });
    const advanced = advanceVnSession(boot.session);
    const projected = projectVnRuntimeStep({
      active: true,
      animatePixi: false,
      nowMs: 0,
      previousMediaState: createInitialMediaRuntimeState(),
      previousPixiStage: createInitialPixiStageSnapshot(),
      previousUiState: createInitialUiRuntimeState(),
      profile: "vn2d",
      runtimeCommands: advanced.emittedRuntimeCommands,
      session: advanced.session
    });

    expect(projected.runtime.uiState.toasts).toEqual([expect.objectContaining({ id: "toast:1", text: "Saved" })]);
    expect(projected.stable.uiState).toMatchObject({ toasts: [], toastSequence: 0 });
    expect(projected.stable.uiState).not.toHaveProperty("inputPrompt");
    expect(projected.stable.uiState).not.toHaveProperty("movieOverlay");
  });

  it("produces the same checkpoint for live batch progression and single-instruction materialization", async () => {
    const sourceText = [
      "#Start",
      '@set route:"preview"',
      "@back bg:harness",
      "@sfx sfx:rain group:rain loop:true volume:0.3",
      "@hideUI commandBar",
      "Narrator: Parity.|#parity_line|"
    ].join("\n");
    const { entry: declaredEntry, source } = debugFixture({
      id: "vn:projection-parity",
      scriptPath: "projection-parity.nani",
      sourceText,
    });
    const inspection = await inspectVnDebugScript(
      declaredEntry,
      source,
      "allow-recoverable-command-errors"
    );
    const boot = createVnSession({ scriptPath: source.scriptPath, sourceText, startLabel: "Start" });
    const advanced = advanceVnSession(boot.session);
    const projected = projectVnRuntimeStep({
      active: true,
      animatePixi: false,
      nowMs: 0,
      previousMediaState: createInitialMediaRuntimeState(),
      previousPixiStage: createInitialPixiStageSnapshot(),
      previousUiState: createInitialUiRuntimeState(),
      profile: "vn2d",
      runtimeCommands: advanced.emittedRuntimeCommands,
      session: advanced.session
    });
    const live = collectVnSaveCheckpoint({
      active: true,
      entryId: inspection.entry.id,
      script: {
        scriptPath: inspection.source.scriptPath,
        scriptRevision: inspection.source.scriptRevision
      },
      story: projected.session.story,
      pixiStage: projected.stable.pixiStage,
      media: createVnMediaCheckpoint(projected.stable.mediaState),
      ui: createVnUiCheckpoint(projected.stable.uiState)
    });
    const target = inspection.commands.find((command) => command.anchor.stableId === "print:parity_line")!.anchor;
    const materialized = await materializeVnDebugTarget({
      mode: "canonical-entry",
      sourceDiagnosticPolicy: "allow-recoverable-command-errors",
      entry: inspection.entry,
      catalog: [inspection.source],
      inspection,
      target
    });

    expect(live.ok).toBe(true);
    expect(materialized.status).toBe("ready");
    if (!live.ok || materialized.status !== "ready") return;
    expect(materialized.checkpoint).toEqual(live.value);
  });

  it.each(stableTargetParityCases)(
    "matches formal instruction stepping and debug materialization at $name",
    async ({ assertStableState, stopCanonicalName, targetLabel }) => {
      const sourceText = [
        "#Start",
        '@set route:"preview"',
        "#Visual",
        "@back bg:harness",
        "@char Ema.Pensive1 pos:50",
        "@hideUI commandBar",
        "@bgm bgm:harness group:music volume:0.4",
        "@sfx sfx:rain group:rain loop:true volume:0.25",
        "Narrator: Stable target parity.|#stable_target_parity|"
      ].join("\n");
      const fixture = debugFixture({
        id: "vn:projection-stable-target-parity",
        scriptPath: "projection-stable-target-parity.nani",
        sourceText
      });
      const inspection = await inspectVnDebugScript(
        fixture.entry,
        fixture.source,
        "allow-recoverable-command-errors"
      );
      const stopCommand = inspection.commands.find(
        ({ command }) => command.canonicalName === stopCanonicalName
      );
      expect(stopCommand, `missing @${stopCanonicalName} command`).toBeDefined();
      if (!stopCommand) return;
      const target = targetLabel
        ? inspection.labels.find((label) => label.name === targetLabel)?.anchor
        : stopCommand.anchor;
      expect(target, `missing #${targetLabel ?? stopCanonicalName} target`).toBeDefined();
      if (!target) return;

      const live = projectLiveCheckpointThroughCommand(inspection, stopCommand.anchor.commandIndex);
      const materialized = await materializeVnDebugTarget({
        mode: "canonical-entry",
        sourceDiagnosticPolicy: "allow-recoverable-command-errors",
        entry: inspection.entry,
        catalog: [inspection.source],
        inspection,
        target
      });

      expect(materialized.status).toBe("ready");
      if (materialized.status !== "ready") return;
      expect(materialized.checkpoint).toEqual(live);
      assertStableState(materialized.checkpoint);
    }
  );
});

function debugFixture({
  id,
  scriptPath,
  sourceText
}: {
  id: string;
  scriptPath: string;
  sourceText: string;
}): { entry: VnEntryDef; source: VnRuntimeScriptSource } {
  return {
    entry: {
      id,
      title: id,
      initialScriptPath: scriptPath,
      startLabel: "Start",
      profile: "vn2d",
      assetRefs: []
    },
    source: { scriptPath, sourceText, scriptRevision: "sha256:placeholder" }
  };
}
