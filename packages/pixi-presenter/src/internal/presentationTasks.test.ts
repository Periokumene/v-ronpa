import { describe, expect, it } from "vitest";
import { PresentationTaskController } from "./presentationTasks";

describe("PresentationTaskController", () => {
  it("starts running task snapshots and notifies subscribers", () => {
    const notifications: string[] = [];
    const controller = new PresentationTaskController((tasks) => {
      notifications.push(tasks.map((task) => `${task.kind}:${task.target}:${task.status}`).join(",") || "empty");
    });

    controller.tick(120);
    const task = controller.start({ kind: "flash", target: "screen", revision: 3, durationMs: 240 });

    expect(task).toMatchObject({
      kind: "flash",
      target: "screen",
      revision: 3,
      durationMs: 240,
      status: "running",
      startedAtMs: 120
    });
    expect(controller.snapshot()).toHaveLength(1);
    expect(notifications).toEqual(["flash:screen:running"]);
  });

  it("settles the old task when a new task starts for the same target and kind", () => {
    const settled: string[] = [];
    const controller = new PresentationTaskController();
    const first = controller.start({
      kind: "actor-transition",
      target: "character:felix",
      revision: 1,
      durationMs: 400,
      onSettle: () => settled.push("first")
    });
    const unrelated = controller.start({ kind: "shake", target: "character:felix", revision: 1, durationMs: 120 });
    const second = controller.start({ kind: "actor-transition", target: "character:felix", revision: 2, durationMs: 200 });

    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    expect(unrelated.isCurrent()).toBe(true);
    expect(settled).toEqual(["first"]);
    expect(controller.snapshot().map((task) => task.id)).toEqual([unrelated.id, second.id]);
  });

  it("ignores stale completion handles after cancelAll", () => {
    const completed: string[] = [];
    const cancelled: string[] = [];
    const controller = new PresentationTaskController();
    const task = controller.start({
      kind: "glitch",
      target: "screen",
      revision: 8,
      durationMs: 300,
      onComplete: () => completed.push("complete"),
      onCancel: () => cancelled.push("cancel")
    });

    controller.cancelAll();
    task.complete();

    expect(controller.snapshot()).toEqual([]);
    expect(cancelled).toEqual(["cancel"]);
    expect(completed).toEqual([]);
  });

  it("settles active tasks without keeping terminal snapshots active", () => {
    const settled: string[] = [];
    const controller = new PresentationTaskController();
    controller.start({ kind: "screen-filter-transition", target: "bokeh", revision: 4, durationMs: 500, onSettle: () => settled.push("bokeh") });
    controller.start({ kind: "weather-transition", target: "rain", revision: 4, durationMs: 500, onSettle: () => settled.push("rain") });

    controller.settleAllNonHold();

    expect(controller.snapshot()).toEqual([]);
    expect(settled).toEqual(["bokeh", "rain"]);
  });

  it("cancels all active tasks for a removed target", () => {
    const cancelled: string[] = [];
    const controller = new PresentationTaskController();
    controller.start({ kind: "actor-transition", target: "character:mira", revision: 1, durationMs: 200, onCancel: () => cancelled.push("actor") });
    controller.start({ kind: "shake", target: "character:mira", revision: 1, durationMs: 200, onCancel: () => cancelled.push("shake") });
    controller.start({ kind: "flash", target: "screen", revision: 1, durationMs: 200 });

    controller.cancelTarget("character:mira");

    expect(cancelled).toEqual(["actor", "shake"]);
    expect(controller.snapshot()).toMatchObject([{ kind: "flash", target: "screen" }]);
  });
});
