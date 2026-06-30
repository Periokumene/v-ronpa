import { describe, expect, it } from "vitest";
import {
  createDialogPlaybackSchedulePlan,
  dialogPlaybackScheduleDelayMs,
  selectDialogPlaybackAdvanceRequest,
  selectDialogPlaybackAdvanceGate,
  shouldDriveDialogReveal
} from "./dialogPlaybackGate";
import { advanceDialogReveal, createDialogRevealState } from "./dialogRevealRuntime";

describe("dialog playback gate", () => {
  it("schedules AUTO from the committed line start so reveal elapsed counts toward the wait budget", () => {
    const reveal = createDialogRevealState({
      lineKey: "line:auto",
      text: "ABCDE",
      startedAtMs: 1000,
      durationMs: 900
    });

    expect(dialogPlaybackScheduleDelayMs({ type: "wait", source: "auto", delayMs: 1200 }, reveal, 1600)).toBe(600);
    expect(dialogPlaybackScheduleDelayMs({ type: "wait", source: "auto-next", delayMs: 1200 }, reveal, 2300)).toBe(0);
  });

  it("keeps SKIP scheduling relative while reveal gate controls non-skip auto advance", () => {
    const revealing = createDialogRevealState({
      lineKey: "line:skip",
      text: "ABCDE",
      startedAtMs: 1000,
      durationMs: 900
    });
    const complete = advanceDialogReveal(revealing, 1900).state;

    expect(dialogPlaybackScheduleDelayMs({ type: "wait", source: "skip", delayMs: 90 }, revealing, 1800)).toBe(90);
    expect(selectDialogPlaybackAdvanceGate({ source: "auto", reveal: revealing })).toEqual({
      ready: false,
      source: "auto",
      blockedBy: "reveal"
    });
    expect(selectDialogPlaybackAdvanceGate({ source: "auto-next", reveal: complete })).toEqual({
      ready: true,
      source: "auto-next"
    });
    expect(selectDialogPlaybackAdvanceGate({ source: "skip", reveal: revealing })).toEqual({ ready: true, source: "skip" });
  });

  it("aggregates delay and reveal gate into one schedule plan", () => {
    const reveal = createDialogRevealState({
      lineKey: "line:plan",
      text: "ABCDE",
      startedAtMs: 1000,
      durationMs: 1200
    });

    expect(
      createDialogPlaybackSchedulePlan({
        schedule: { type: "wait", source: "auto-next", delayMs: 1500 },
        reveal,
        nowMs: 1800
      })
    ).toEqual({
      type: "scheduled",
      source: "auto-next",
      delayMs: 700,
      advanceGate: { ready: false, source: "auto-next", blockedBy: "reveal" }
    });
    expect(createDialogPlaybackSchedulePlan({ schedule: { type: "idle" }, reveal, nowMs: 1800 })).toEqual({
      type: "idle",
      delayMs: 0
    });
  });

  it("aggregates reveal and voice gates into one advance request", () => {
    expect(
      selectDialogPlaybackAdvanceRequest({
        revealGate: { ready: false, source: "auto", blockedBy: "reveal" },
        voiceReady: true
      })
    ).toEqual({ type: "blocked", source: "auto", blockedBy: "reveal" });
    expect(
      selectDialogPlaybackAdvanceRequest({
        revealGate: { ready: true, source: "auto-next" },
        voiceReady: false
      })
    ).toEqual({ type: "blocked", source: "auto-next", blockedBy: "voice" });
    expect(
      selectDialogPlaybackAdvanceRequest({
        revealGate: { ready: true, source: "skip" },
        voiceReady: true
      })
    ).toEqual({ type: "advance", source: "skip" });
  });

  it("keeps a reveal driver active until the line completes", () => {
    const reveal = createDialogRevealState({
      lineKey: "line:driver",
      text: "AB",
      startedAtMs: 1000,
      durationMs: 1000
    });
    const complete = advanceDialogReveal(reveal, 2000).state;

    expect(shouldDriveDialogReveal({ active: true, reveal })).toBe(true);
    expect(shouldDriveDialogReveal({ active: false, reveal })).toBe(false);
    expect(shouldDriveDialogReveal({ active: true, reveal: complete })).toBe(false);
  });
});
