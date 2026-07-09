import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveDataSchema } from "@v-ronpa/contracts";
import {
  SAVE_SLOT_THUMBNAIL_CAPTURE_OPTIONS,
  SAVE_SLOT_THUMBNAIL_HEIGHT,
  SAVE_SLOT_THUMBNAIL_MIME,
  SAVE_SLOT_THUMBNAIL_QUALITY,
  SAVE_SLOT_THUMBNAIL_WIDTH,
  createFortyPlusQuickSaveSlotPolicy,
  createHowlerAudioPort,
  createMemorySavePort,
  createSaveMigrator,
  createSaveSlotSummary,
  selectManualSaveSlotSummaries,
  selectQuickSaveSlotSummary,
  type SaveSlotPreview
} from "./index";

const howlerMock = vi.hoisted(() => {
  const playImplementations: Array<() => void> = [];
  const instances: Array<{
    config: Record<string, unknown>;
    play: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    fade: ReturnType<typeof vi.fn>;
    volume: ReturnType<typeof vi.fn>;
    once: ReturnType<typeof vi.fn>;
    emit: (event: string, ...args: unknown[]) => void;
  }> = [];
  const Howl = vi.fn(function Howl(config: Record<string, unknown>) {
    const callbacks: Record<string, Array<(...args: unknown[]) => void>> = {};
    const instance = {
      config,
      play: vi.fn(() => playImplementations.shift()?.()),
      stop: vi.fn(),
      fade: vi.fn(),
      volume: vi.fn(() => config.volume ?? 1),
      once: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        callbacks[event] = [...(callbacks[event] ?? []), callback];
        return instance;
      }),
      emit(event: string, ...args: unknown[]) {
        const pending = callbacks[event] ?? [];
        callbacks[event] = [];
        for (const callback of pending) callback(...args);
      }
    };
    instances.push(instance);
    return instance;
  });
  return { Howl, instances, playImplementations };
});

vi.mock("howler", () => ({ Howl: howlerMock.Howl }));

const baseSave = SaveDataSchema.parse({
  version: 5 as const,
  savedAt: "2026-06-14T00:00:00.000Z",
  mode: "navi" as const,
  vn: {
    story: {
      currentScriptPath: "opening.nani",
      instructionPointer: 4,
      variables: {},
      backlog: [{ speaker: "Felix", text: "A saved line." }],
      pendingChoices: [],
      ended: false
    },
    pixiStage: {
      version: 5 as const,
      revision: 2,
      backgroundsById: {
        MainBackground: {
          id: "MainBackground",
          kind: "background",
          appearance: "bg:harness"
        }
      },
      charactersById: {
        Ema: {
          id: "Ema",
          kind: "character",
          appearanceExpression: "Pensive1,ArmR3",
          pos: [0.5, 0]
        }
      },
      actorOrder: ["MainBackground", "Ema"],
      weather: {},
      screenFilters: {}
    }
  },
  navi: { substate: "vn2d-overlay", activeMapId: "map:academy-hall", inputLock: "dialog" },
  trial: null,
  inventory: { items: { "gift:coffee": 1 } },
  evidence: { ownedEvidenceIds: ["evidence:keycard"], submittedEvidenceIds: [] },
  characters: {}
});

const currentTextSave = SaveDataSchema.parse({
  ...baseSave,
  vn: {
    story: {
      ...baseSave.vn!.story,
      text: {
        visible: true,
        current: { speaker: "Mira", text: "Current save line." }
      }
    },
    pixiStage: baseSave.vn!.pixiStage
  }
});

describe("media save contracts", () => {
  beforeEach(() => {
    howlerMock.Howl.mockClear();
    howlerMock.instances.length = 0;
    howlerMock.playImplementations.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("validates saves through the versioned migrator boundary", () => {
    const result = createSaveMigrator().migrate({
      version: 5,
      savedAt: "2026-06-14T00:00:00.000Z",
      mode: "trial",
      vn: {
        story: {
          currentScriptPath: "trial.nani",
          instructionPointer: 4,
          variables: {},
          backlog: [],
          pendingChoices: [],
          ended: false
        },
        pixiStage: {
          version: 5,
          revision: 0,
          backgroundsById: {},
          charactersById: {},
          actorOrder: [],
          weather: {},
          screenFilters: {}
        }
      },
      navi: null,
      inventory: { items: { "gift:coffee": 1 } },
      evidence: { ownedEvidenceIds: ["evidence:keycard"], submittedEvidenceIds: [] },
      characters: {},
      trial: {
        trialId: "trial:case-01",
        currentSegmentId: "debate:door",
        presentation: "debate3d",
        inputLock: "trial-targeting"
      }
    });

    expect(result).toMatchObject({
      migrated: false,
      data: {
        version: 5,
        trial: { keywordStates: {} }
      }
    });
  });

  it("rejects old save versions instead of migrating them", () => {
    expect(() =>
      createSaveMigrator().migrate({
        ...baseSave,
        version: 3
      })
    ).toThrow();
  });

  it("derives text slot summaries from save data", () => {
    expect(createSaveSlotSummary("slot:1", "Slot 1", baseSave)).toEqual({
      id: "slot:1",
      label: "Slot 1",
      savedAt: "2026-06-14T00:00:00.000Z",
      mode: "navi",
      speaker: "Felix",
      text: "A saved line."
    });
    expect(createSaveSlotSummary("slot:1", "Slot 1", currentTextSave)).toMatchObject({
      speaker: "Mira",
      text: "Current save line."
    });
    expect(
      createSaveSlotSummary(
        "slot:navi",
        "Navi",
        SaveDataSchema.parse({
          ...baseSave,
          vn: null
        })
      )
    ).toEqual({
      id: "slot:navi",
      label: "Navi",
      savedAt: "2026-06-14T00:00:00.000Z",
      mode: "navi"
    });
  });

  it("lists summaries and deletes slots through the save port", async () => {
    const port = createMemorySavePort();
    const summary = createSaveSlotSummary("slot:1", "Slot 1", baseSave);

    await expect(port.save({
      id: "slot:1",
      label: "Slot 1",
      data: baseSave
    })).resolves.toEqual({ ok: true, value: summary });

    await expect(port.listSummaries()).resolves.toEqual({ ok: true, value: [summary] });
    await expect(port.load("slot:1")).resolves.toMatchObject({
      ok: true,
      value: { id: "slot:1", data: { vn: { story: { instructionPointer: 4 } } } }
    });

    await expect(port.delete("slot:1")).resolves.toEqual({ ok: true, value: undefined });

    await expect(port.load("slot:1")).resolves.toEqual({ ok: true, value: undefined });
    await expect(port.list()).resolves.toEqual({ ok: true, value: [] });
  });

  it("returns undefined for invalid slots without mutating stored summaries", async () => {
    const summary = createSaveSlotSummary("slot:1", "Slot 1", baseSave);
    const port = createMemorySavePort([{ id: "slot:1", label: "Slot 1", summary, data: baseSave }]);

    await expect(port.load("slot:missing")).resolves.toEqual({ ok: true, value: undefined });
    await expect(port.delete("slot:missing")).resolves.toEqual({ ok: true, value: undefined });

    await expect(port.listSummaries()).resolves.toEqual({ ok: true, value: [summary] });
  });

  it("regenerates stale slot summaries from save data", async () => {
    const staleSummary = {
      id: "slot:1",
      label: "Slot 1",
      savedAt: "2026-06-14T00:00:00.000Z",
      mode: "navi" as const,
      speaker: "Old",
      text: "Stale line."
    };
    const expectedSummary = createSaveSlotSummary("slot:1", "Slot 1", baseSave);
    const port = createMemorySavePort([{ id: "slot:1", label: "Slot 1", summary: staleSummary, data: baseSave }]);

    await expect(port.listSummaries()).resolves.toEqual({ ok: true, value: [expectedSummary] });
    await expect(port.load("slot:1")).resolves.toMatchObject({ ok: true, value: { summary: expectedSummary } });
  });

  it("keeps preview blobs out of summaries and lazily loads them by slot id", async () => {
    const port = createMemorySavePort();
    const preview = createPreviewBlob("first-preview");
    const summary = createSaveSlotSummary("slot:1", "Slot 1", baseSave);

    await expect(port.save({ id: "slot:1", label: "Slot 1", data: baseSave, preview })).resolves.toEqual({ ok: true, value: summary });

    await expect(port.listSummaries()).resolves.toEqual({ ok: true, value: [summary] });
    const previews = await port.loadPreviews(["slot:1", "slot:missing"]);
    expect(previews).toMatchObject({
      ok: true,
      value: {
        "slot:1": {
          metadata: {
            kind: "image",
            mime: SAVE_SLOT_THUMBNAIL_MIME,
            width: SAVE_SLOT_THUMBNAIL_WIDTH,
            height: SAVE_SLOT_THUMBNAIL_HEIGHT
          }
        }
      }
    });
    expect(previews.ok ? previews.value["slot:1"]?.blob : undefined).toBe(preview.blob);
    await expect(port.load("slot:1")).resolves.toMatchObject({ ok: true, value: { preview: { metadata: { byteLength: preview.blob.size } } } });
  });

  it("cleans up previews when slots are deleted or overwritten without a preview", async () => {
    const port = createMemorySavePort();
    const preview = createPreviewBlob("delete-me");

    await port.save({ id: "slot:1", label: "Slot 1", data: baseSave, preview });
    await expect(port.loadPreviews(["slot:1"])).resolves.toMatchObject({ ok: true, value: { "slot:1": expect.any(Object) } });

    await port.save({ id: "slot:1", label: "Slot 1", data: currentTextSave });
    await expect(port.loadPreviews(["slot:1"])).resolves.toEqual({ ok: true, value: {} });

    await port.save({ id: "slot:1", label: "Slot 1", data: baseSave, preview });
    await port.delete("slot:1");
    await expect(port.loadPreviews(["slot:1"])).resolves.toEqual({ ok: true, value: {} });
  });

  it("returns structured errors for invalid writes without mutating existing slots", async () => {
    const port = createMemorySavePort();
    const summary = createSaveSlotSummary("slot:1", "Slot 1", baseSave);
    await port.save({ id: "slot:1", label: "Slot 1", data: baseSave });

    const result = await port.save({
      id: "slot:bad",
      label: "Bad",
      data: { ...baseSave, version: 3 } as unknown as typeof baseSave
    });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid-save" } });
    await expect(port.listSummaries()).resolves.toEqual({ ok: true, value: [summary] });
  });

  it("rejects previews that drift from the shared thumbnail policy", async () => {
    const port = createMemorySavePort();
    const preview = createPreviewBlob("wrong-size");

    const result = await port.save({
      id: "slot:1",
      label: "Slot 1",
      data: baseSave,
      preview: {
        ...preview,
        metadata: {
          ...preview.metadata,
          width: SAVE_SLOT_THUMBNAIL_WIDTH + 1
        }
      }
    });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid-save" } });
    await expect(port.listSummaries()).resolves.toEqual({ ok: true, value: [] });
    await expect(port.loadPreviews(["slot:1"])).resolves.toEqual({ ok: true, value: {} });
  });

  it("shares forty manual slots plus one quick slot through the media-save policy helper", () => {
    const policy = createFortyPlusQuickSaveSlotPolicy("game-a", { manualLabelPrefix: "Game A" });
    const manual = createSaveSlotSummary("slot:game-a:1", "Game A 1", baseSave);
    const quick = createSaveSlotSummary(policy.quickSlotId, policy.labelForSlot(policy.quickSlotId), baseSave);

    expect(policy.manualSlotIds).toHaveLength(40);
    expect(policy.manualSlotIds.slice(0, 3)).toEqual(["slot:game-a:1", "slot:game-a:2", "slot:game-a:3"]);
    expect(policy.manualSlotIds.at(-1)).toBe("slot:game-a:40");
    expect(policy.allSlotIds).toEqual([...policy.manualSlotIds, "slot:game-a:quick"]);
    expect(policy.labelForSlot("slot:game-a:2")).toBe("Game A 2");
    expect(selectManualSaveSlotSummaries(policy, [quick, manual]).map((slot) => slot.id)).toEqual(["slot:game-a:1"]);
    expect(selectQuickSaveSlotSummary(policy, [manual, quick])).toBe(quick);
  });

  it("publishes one thumbnail capture policy for app providers", () => {
    expect(SAVE_SLOT_THUMBNAIL_CAPTURE_OPTIONS).toEqual({
      width: 320,
      height: 180,
      mime: "image/webp",
      quality: 0.8
    });
    expect(SAVE_SLOT_THUMBNAIL_WIDTH / SAVE_SLOT_THUMBNAIL_HEIGHT).toBeCloseTo(16 / 9);
    expect(SAVE_SLOT_THUMBNAIL_QUALITY).toBeGreaterThan(0);
    expect(SAVE_SLOT_THUMBNAIL_QUALITY).toBeLessThanOrEqual(1);
  });

  it("passes loop options through playSfx and releases one-shot handles on end", () => {
    const port = createHowlerAudioPort();

    port.playSfx("sfx:door", "/door.ogg", { volume: 0.6 });
    port.playSfx("sfx:rain", "/rain.ogg", { loop: true, volume: 0.35 });

    expect(howlerMock.instances[0]?.config).toMatchObject({ src: ["/door.ogg"], loop: false, volume: 0.6 });
    expect(howlerMock.instances[1]?.config).toMatchObject({ src: ["/rain.ogg"], loop: true, volume: 0.35 });
    expect(howlerMock.instances[0]?.once).toHaveBeenCalledWith("end", expect.any(Function));
    expect(registeredHowlerEvents(0)).toEqual(["end", "loaderror", "playerror"]);
    expect(registeredHowlerEvents(1)).toEqual(["loaderror", "playerror"]);

    howlerMock.instances[0]?.emit("end");
    port.stopAll();

    expect(howlerMock.instances[0]?.stop).not.toHaveBeenCalled();
    expect(howlerMock.instances[1]?.stop).toHaveBeenCalledTimes(1);
  });

  it("fades BGM and SFX in from zero to the target volume", () => {
    const port = createHowlerAudioPort();

    port.playBgm("bgm:main", "/main.ogg", { volume: 0.7, fadeInMs: 300 });
    port.playSfx("sfx:rain", "/rain.ogg", { loop: true, volume: 0.35, fadeInMs: 250 });

    expect(howlerMock.instances[0]?.config).toMatchObject({ src: ["/main.ogg"], loop: true, volume: 0 });
    expect(howlerMock.instances[0]?.fade).toHaveBeenCalledWith(0, 0.7, 300);
    expect(howlerMock.instances[1]?.config).toMatchObject({ src: ["/rain.ogg"], loop: true, volume: 0 });
    expect(howlerMock.instances[1]?.fade).toHaveBeenCalledWith(0, 0.35, 250);
  });

  it("plays dialogue bleep as a looped handle until stopped", async () => {
    const port = createHowlerAudioPort();

    const handle = port.playDialogueBleep("dialogue-bleep:line", "/bleep.ogg", { volume: 0.4 });

    expect(howlerMock.instances[0]?.config).toMatchObject({ src: ["/bleep.ogg"], loop: true, volume: 0.4 });
    expect(registeredHowlerEvents(0)).toEqual(["loaderror", "playerror"]);

    handle.stop();

    await expect(handle.finished).resolves.toEqual({ reason: "stopped" });
    expect(howlerMock.instances[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it("plays voice as a one-shot handle and resolves finished on end", async () => {
    const port = createHowlerAudioPort();

    const handle = port.playVoice("voice:zh:line", "/voice.ogg", { volume: 0.5 });

    expect(howlerMock.instances[0]?.config).toMatchObject({ src: ["/voice.ogg"], loop: false, volume: 0.5 });
    expect(howlerMock.instances[0]?.once).toHaveBeenCalledWith("end", expect.any(Function));
    expect(registeredHowlerEvents(0)).toEqual(["end", "loaderror", "playerror"]);

    howlerMock.instances[0]?.emit("end");
    await expect(handle.finished).resolves.toEqual({ reason: "ended" });
    port.stopAll();

    expect(howlerMock.instances[0]?.stop).not.toHaveBeenCalled();
  });

  it("fades to zero and resolves stopped exactly once", async () => {
    vi.useFakeTimers();
    const port = createHowlerAudioPort();
    const handle = port.playBgm("bgm:main", "/main.ogg", { volume: 0.7 });
    const howl = howlerMock.instances[0];

    handle.fadeOutAndStop(250);
    expect(howl?.fade).toHaveBeenCalledWith(0.7, 0, 250);
    expect(howl?.stop).not.toHaveBeenCalled();

    vi.advanceTimersByTime(249);
    expect(howl?.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(howl?.stop).toHaveBeenCalledTimes(1);
    await expect(handle.finished).resolves.toEqual({ reason: "stopped" });

    handle.fadeOutAndStop(250);
    handle.stop();
    vi.advanceTimersByTime(250);
    expect(howl?.stop).toHaveBeenCalledTimes(1);
  });

  it("clears fade timers when a handle is stopped immediately", async () => {
    vi.useFakeTimers();
    const port = createHowlerAudioPort();
    const handle = port.playBgm("bgm:main", "/main.ogg");
    const howl = howlerMock.instances[0];

    handle.fadeOutAndStop(500);
    handle.stop();
    vi.advanceTimersByTime(500);

    expect(howl?.stop).toHaveBeenCalledTimes(1);
    await expect(handle.finished).resolves.toEqual({ reason: "stopped" });
  });

  it("resolves stopped when handles are replaced or stopAll is called", async () => {
    const port = createHowlerAudioPort();
    const first = port.playVoice("voice:zh:line", "/first.ogg");
    const second = port.playVoice("voice:zh:line", "/second.ogg");
    const bgm = port.playBgm("bgm:main", "/main.ogg");

    await expect(first.finished).resolves.toEqual({ reason: "stopped" });
    expect(howlerMock.instances[0]?.stop).toHaveBeenCalledTimes(1);

    port.stopAll();

    await expect(second.finished).resolves.toEqual({ reason: "stopped" });
    await expect(bgm.finished).resolves.toEqual({ reason: "stopped" });
    expect(howlerMock.instances[1]?.stop).toHaveBeenCalledTimes(1);
    expect(howlerMock.instances[2]?.stop).toHaveBeenCalledTimes(1);
  });

  it("resolves failed when Howler reports asynchronous load or play errors", async () => {
    const port = createHowlerAudioPort();
    const loadFailure = port.playVoice("voice:zh:missing", "/missing.ogg");
    const playFailure = port.playBgm("bgm:locked", "/locked.ogg");

    howlerMock.instances[0]?.emit("loaderror", 1, "missing asset");
    howlerMock.instances[1]?.emit("playerror", 2, "autoplay denied");

    await expect(loadFailure.finished).resolves.toEqual({ reason: "failed" });
    await expect(playFailure.finished).resolves.toEqual({ reason: "failed" });

    howlerMock.instances[0]?.emit("end");
    loadFailure.stop();
    playFailure.fadeOutAndStop(0);
    port.stopAll();

    expect(howlerMock.instances[0]?.stop).not.toHaveBeenCalled();
    expect(howlerMock.instances[1]?.stop).not.toHaveBeenCalled();
  });

  it("returns a failed handle when Howler throws while starting playback", async () => {
    howlerMock.playImplementations.push(() => {
      throw new Error("playback blocked");
    });
    const port = createHowlerAudioPort();

    const handle = port.playVoice("voice:zh:blocked", "/blocked.ogg");

    expect(registeredHowlerEvents(0)).toEqual(["end", "loaderror", "playerror"]);
    await expect(handle.finished).resolves.toEqual({ reason: "failed" });
    expect(howlerMock.instances[0]?.stop).not.toHaveBeenCalled();
  });
});

function registeredHowlerEvents(index: number): string[] {
  return howlerMock.instances[index]?.once.mock.calls.map(([event]) => event as string) ?? [];
}

function createPreviewBlob(value: string): SaveSlotPreview {
  const blob = new Blob([value], { type: SAVE_SLOT_THUMBNAIL_MIME });
  return {
    metadata: {
      kind: "image" as const,
      mime: SAVE_SLOT_THUMBNAIL_MIME,
      width: SAVE_SLOT_THUMBNAIL_WIDTH,
      height: SAVE_SLOT_THUMBNAIL_HEIGHT,
      byteLength: blob.size,
      capturedAt: "2026-07-09T00:00:00.000Z"
    },
    blob
  };
}
