import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveDataSchema } from "@v-ronpa/contracts";
import { createHowlerAudioPort, createMemorySavePort, createSaveMigrator, createSaveSlotSummary } from "./index";

const howlerMock = vi.hoisted(() => {
  const instances: Array<{
    config: Record<string, unknown>;
    play: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    fade: ReturnType<typeof vi.fn>;
    volume: ReturnType<typeof vi.fn>;
    once: ReturnType<typeof vi.fn>;
    emit: (event: string) => void;
  }> = [];
  const Howl = vi.fn(function Howl(config: Record<string, unknown>) {
    const callbacks: Record<string, Array<() => void>> = {};
    const instance = {
      config,
      play: vi.fn(),
      stop: vi.fn(),
      fade: vi.fn(),
      volume: vi.fn(() => config.volume ?? 1),
      once: vi.fn((event: string, callback: () => void) => {
        callbacks[event] = [...(callbacks[event] ?? []), callback];
        return instance;
      }),
      emit(event: string) {
        const pending = callbacks[event] ?? [];
        callbacks[event] = [];
        for (const callback of pending) callback();
      }
    };
    instances.push(instance);
    return instance;
  });
  return { Howl, instances };
});

vi.mock("howler", () => ({ Howl: howlerMock.Howl }));

const baseSave = SaveDataSchema.parse({
  version: 2 as const,
  savedAt: "2026-06-14T00:00:00.000Z",
  mode: "navi" as const,
  story: {
    currentScriptPath: "opening.nani",
    instructionPointer: 4,
    variables: {},
    backlog: [{ speaker: "Felix", text: "A saved line." }],
    pendingChoices: [],
    ended: false
  },
  pixiStage: {
    version: 3 as const,
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
  },
  inventory: { items: { "gift:coffee": 1 } },
  evidence: { ownedEvidenceIds: ["evidence:keycard"], submittedEvidenceIds: [] },
  characters: {}
});

describe("media save contracts", () => {
  beforeEach(() => {
    howlerMock.Howl.mockClear();
    howlerMock.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("validates saves through the versioned migrator boundary", () => {
    const result = createSaveMigrator().migrate({
      version: 2,
      savedAt: "2026-06-14T00:00:00.000Z",
      mode: "trial",
      story: {
        currentScriptPath: "trial.nani",
        instructionPointer: 4,
        variables: {},
        backlog: [],
        pendingChoices: [],
        ended: false
      },
      pixiStage: {
        version: 3,
        revision: 0,
        backgroundsById: {},
        charactersById: {},
        actorOrder: [],
        weather: {},
        screenFilters: {}
      },
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
        version: 2,
        trial: { keywordStates: {} }
      }
    });
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
  });

  it("lists summaries and deletes slots through the save port", async () => {
    const port = createMemorySavePort();
    const summary = createSaveSlotSummary("slot:1", "Slot 1", baseSave);

    await port.save({
      id: "slot:1",
      label: "Slot 1",
      summary,
      data: baseSave
    });

    await expect(port.listSummaries()).resolves.toEqual([summary]);
    await expect(port.load("slot:1")).resolves.toMatchObject({ id: "slot:1", data: { story: { instructionPointer: 4 } } });

    await port.delete("slot:1");

    await expect(port.load("slot:1")).resolves.toBeUndefined();
    await expect(port.list()).resolves.toEqual([]);
  });

  it("returns undefined for invalid slots without mutating stored summaries", async () => {
    const summary = createSaveSlotSummary("slot:1", "Slot 1", baseSave);
    const port = createMemorySavePort([{ id: "slot:1", label: "Slot 1", summary, data: baseSave }]);

    await expect(port.load("slot:missing")).resolves.toBeUndefined();
    await port.delete("slot:missing");

    await expect(port.listSummaries()).resolves.toEqual([summary]);
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

    await expect(port.listSummaries()).resolves.toEqual([expectedSummary]);
    await expect(port.load("slot:1")).resolves.toMatchObject({ summary: expectedSummary });
  });

  it("passes loop options through playSfx and releases one-shot handles on end", () => {
    const port = createHowlerAudioPort();

    port.playSfx("sfx:door", "/door.ogg", { volume: 0.6 });
    port.playSfx("sfx:rain", "/rain.ogg", { loop: true, volume: 0.35 });

    expect(howlerMock.instances[0]?.config).toMatchObject({ src: ["/door.ogg"], loop: false, volume: 0.6 });
    expect(howlerMock.instances[1]?.config).toMatchObject({ src: ["/rain.ogg"], loop: true, volume: 0.35 });
    expect(howlerMock.instances[0]?.once).toHaveBeenCalledWith("end", expect.any(Function));
    expect(howlerMock.instances[1]?.once).not.toHaveBeenCalled();

    howlerMock.instances[0]?.emit("end");
    port.stopAll();

    expect(howlerMock.instances[0]?.stop).not.toHaveBeenCalled();
    expect(howlerMock.instances[1]?.stop).toHaveBeenCalledTimes(1);
  });

  it("fades to zero and releases handles exactly once", () => {
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

    handle.fadeOutAndStop(250);
    handle.stop();
    vi.advanceTimersByTime(250);
    expect(howl?.stop).toHaveBeenCalledTimes(1);
  });

  it("clears fade timers when a handle is stopped immediately", () => {
    vi.useFakeTimers();
    const port = createHowlerAudioPort();
    const handle = port.playBgm("bgm:main", "/main.ogg");
    const howl = howlerMock.instances[0];

    handle.fadeOutAndStop(500);
    handle.stop();
    vi.advanceTimersByTime(500);

    expect(howl?.stop).toHaveBeenCalledTimes(1);
  });
});
