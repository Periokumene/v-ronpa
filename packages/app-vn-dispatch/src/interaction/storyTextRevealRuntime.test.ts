import { describe, expect, it } from "vitest";
import {
  advanceStoryTextReveal,
  completeStoryTextReveal,
  createStoryTextPacingPlan,
  createStoryTextRevealState,
  selectVisibleRevealRichText,
  selectVisibleRevealText
} from "./storyTextRevealRuntime";

describe("story text reveal runtime", () => {
  it("reveals text by grapheme units", () => {
    const state = createStoryTextRevealState({
      lineKey: "line:grapheme",
      text: "你a\u0301👩‍💻",
      startedAtMs: 1000,
      durationMs: 300
    });

    expect(state.units).toEqual(["你", "a\u0301", "👩‍💻"]);
    const first = advanceStoryTextReveal(state, 1100);
    expect(selectVisibleRevealText(first.state)).toBe("你");
  });

  it("emits reveal lifecycle and tick events without duplicates", () => {
    const state = createStoryTextRevealState({
      lineKey: "line:events",
      text: "ABC",
      startedAtMs: 0,
      durationMs: 300
    });

    const started = advanceStoryTextReveal(state, 0);
    expect(started.events.map((event) => event.type)).toEqual(["reveal-start"]);

    const ticked = advanceStoryTextReveal(started.state, 200);
    expect(ticked.events.map((event) => event.type)).toEqual(["reveal-tick", "reveal-tick"]);
    expect(ticked.events).toEqual([
      expect.objectContaining({ type: "reveal-tick", unit: "A", unitIndex: 0, visibleUnitCount: 1 }),
      expect.objectContaining({ type: "reveal-tick", unit: "B", unitIndex: 1, visibleUnitCount: 2 })
    ]);

    const completed = completeStoryTextReveal(ticked.state, 250);
    expect(completed.events.map((event) => event.type)).toEqual(["reveal-finish"]);
    expect(selectVisibleRevealText(completed.state)).toBe("ABC");

    expect(completeStoryTextReveal(completed.state, 300).events).toEqual([]);
  });

  it("keeps an appended prefix visible and emits ticks only for the new suffix", () => {
    const state = createStoryTextRevealState({
      lineKey: "line:append",
      text: "ABCDEF",
      initialVisibleUnitCount: 3,
      startedAtMs: 0,
      durationMs: 300
    });

    expect(selectVisibleRevealText(state)).toBe("ABC");
    expect(state.eventCursor.tickUnitCount).toBe(3);
    const started = advanceStoryTextReveal(state, 0);
    expect(started.events.map((event) => event.type)).toEqual(["reveal-start"]);
    const ticked = advanceStoryTextReveal(started.state, 100);
    expect(ticked.events).toEqual([
      expect.objectContaining({ type: "reveal-tick", unit: "D", unitIndex: 3, visibleUnitCount: 4 })
    ]);
    expect(selectVisibleRevealText(ticked.state)).toBe("ABCD");
  });

  it("does not synthesize catch-up tick events when a reveal is completed immediately", () => {
    const revealing = createStoryTextRevealState({
      lineKey: "line:complete",
      text: "ABCDE",
      startedAtMs: 0,
      durationMs: 500
    });
    const completed = completeStoryTextReveal(revealing, 100);
    const instant = advanceStoryTextReveal(
      createStoryTextRevealState({
        lineKey: "line:instant",
        text: "ABCDE",
        startedAtMs: 0,
        durationMs: 0
      }),
      0
    );

    expect(completed.events.map((event) => event.type)).toEqual(["reveal-start", "reveal-finish"]);
    expect(instant.events.map((event) => event.type)).toEqual(["reveal-start", "reveal-finish"]);
  });

  it("keeps progress based on absolute elapsed time after no-op early ticks", () => {
    const state = createStoryTextRevealState({
      lineKey: "line:absolute",
      text: "ABCD",
      startedAtMs: 1000,
      durationMs: 400
    });

    const started = advanceStoryTextReveal(state, 1000);
    const early = advanceStoryTextReveal(started.state, 1010);
    const later = advanceStoryTextReveal(early.state, 1200);
    const finished = advanceStoryTextReveal(later.state, 1400);

    expect(early.events).toEqual([]);
    expect(selectVisibleRevealText(early.state)).toBe("");
    expect(selectVisibleRevealText(later.state)).toBe("AB");
    expect(selectVisibleRevealText(finished.state)).toBe("ABCD");
    expect(finished.events.at(-1)).toEqual(expect.objectContaining({ type: "reveal-finish" }));
  });

  it("clips rich text runs to the visible reveal text", () => {
    const state = createStoryTextRevealState({
      lineKey: "line:rich",
      text: "Bold mark",
      startedAtMs: 0,
      durationMs: 100
    });
    const revealed = advanceStoryTextReveal(state, 50).state;

    expect(
      selectVisibleRevealRichText(
        {
          text: "Bold mark",
          runs: [
            { start: 0, end: 4, style: { bold: true } },
            { start: 5, end: 9, style: { markColor: "default" } }
          ]
        },
        revealed
      )
    ).toEqual({
      text: "Bold",
      runs: [{ start: 0, end: 4, style: { bold: true } }]
    });
  });

  it("keeps reveal duration inside the AUTO line budget ratio", () => {
    const plan = createStoryTextPacingPlan({
      unitCount: 100,
      textSpeed: 0.5,
      totalDelayMs: 2000
    });

    expect(plan.revealBudgetRatio).toBe(0.75);
    expect(plan.rawRevealDurationMs).toBe(4500);
    expect(plan.revealDurationMs).toBe(1500);
  });

  it("uses print speed as a reveal speed multiplier", () => {
    const normal = createStoryTextPacingPlan({ unitCount: 10, textSpeed: 0.5 });
    const faster = createStoryTextPacingPlan({ unitCount: 10, textSpeed: 0.5, scriptSpeed: 2 });
    const slower = createStoryTextPacingPlan({ unitCount: 10, textSpeed: 0.5, scriptSpeed: 0.5 });

    expect(faster.revealDurationMs).toBeLessThan(normal.revealDurationMs);
    expect(slower.revealDurationMs).toBeGreaterThan(normal.revealDurationMs);
  });
});
