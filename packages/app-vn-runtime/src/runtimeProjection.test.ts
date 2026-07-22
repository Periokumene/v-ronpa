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
    const inspection = await inspectVnDebugScript(declaredEntry, source);
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
      const inspection = await inspectVnDebugScript(fixture.entry, fixture.source);
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
