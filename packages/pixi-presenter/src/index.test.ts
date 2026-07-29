import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Application } from "pixi.js";
import type { NaniCommandCategory, NaniCommandSource, NaniCommandStatus, RuntimeCommand, RuntimeValue } from "@v-ronpa/contracts";
import {
  INNER_BACKGROUND_ID,
  createInitialPixiStageSnapshot,
  reconcilePixiStageScriptScope,
  reducePixiRuntimeCommand
} from "@v-ronpa/pixi-stage-model";
import { createPixiPresenter } from "./index";
import { ActorSystem } from "./internal/systems";
import { resolveRainSettingsFromCommandParams } from "./internal/rain/settings";

describe("pixi presenter port", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("queues snapshot reconciliation before mount without requiring Pixi memory behavior", () => {
    const host = {
      clientWidth: 960,
      clientHeight: 540,
      appendChild() {
        throw new Error("mount should not be required for memory behavior");
      }
    } as unknown as HTMLElement;
    const presenter = createPixiPresenter({ host, active: true, characterOutlineEnabled: true, characterPreloadPlan: [] });

    expect(() => presenter.reconcile(createInitialPixiStageSnapshot())).not.toThrow();
    expect(() => presenter.clear()).not.toThrow();
  });

  it("coalesces host resize into layout-only relayout and cancels pending resize work on destroy", async () => {
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const frame = nextFrame;
      nextFrame += 1;
      frameCallbacks.set(frame, callback);
      return frame;
    });
    const cancelAnimationFrame = vi.fn((frame: number) => {
      frameCallbacks.delete(frame);
    });
    const observerInstances: TestResizeObserver[] = [];
    class TestResizeObserver {
      readonly observe = vi.fn();
      readonly disconnect = vi.fn();

      constructor(readonly callback: ResizeObserverCallback) {
        observerInstances.push(this);
      }
    }

    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    vi.spyOn(Application.prototype, "init").mockImplementation(async function (this: Application) {
      Object.defineProperty(this, "renderer", { configurable: true, value: { width: 960, height: 540 } });
      Object.defineProperty(this, "ticker", {
        configurable: true,
        value: { add: vi.fn(), remove: vi.fn(), start: vi.fn(), stop: vi.fn() }
      });
      Object.defineProperty(this, "canvas", { configurable: true, value: { dataset: {} } });
    });
    vi.spyOn(Application.prototype, "destroy").mockImplementation(() => undefined);
    const reconcile = vi.spyOn(ActorSystem.prototype, "reconcile");
    const relayout = vi.spyOn(ActorSystem.prototype, "relayoutViewport");
    let hostWidth = 960;
    const host = {
      get clientWidth() {
        return hostWidth;
      },
      clientHeight: 540,
      appendChild: vi.fn()
    } as unknown as HTMLElement;
    const presenter = createPixiPresenter({ host, active: true, characterOutlineEnabled: true, characterPreloadPlan: [] });

    await presenter.mount();
    presenter.reconcile(createInitialPixiStageSnapshot());
    hostWidth = 1200;
    observerInstances[0]?.callback([], observerInstances[0] as unknown as ResizeObserver);
    flushFrames(frameCallbacks);

    expect(observerInstances[0]?.observe).toHaveBeenCalledWith(host);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(relayout).toHaveBeenCalledTimes(1);

    hostWidth = 1280;
    observerInstances[0]?.callback([], observerInstances[0] as unknown as ResizeObserver);
    expect(frameCallbacks.size).toBe(1);
    presenter.destroy();
    observerInstances[0]?.callback([], observerInstances[0] as unknown as ResizeObserver);
    flushFrames(frameCallbacks);

    expect(observerInstances[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(relayout).toHaveBeenCalledTimes(1);
  });

  it("keeps queued reconciliation behind the character preparation readiness barrier", async () => {
    const deferred = createDeferred<Awaited<ReturnType<ActorSystem["preloadCharacters"]>>>();
    vi.spyOn(Application.prototype, "init").mockImplementation(async function (this: Application) {
      Object.defineProperty(this, "renderer", { configurable: true, value: { width: 960, height: 540 } });
      Object.defineProperty(this, "ticker", {
        configurable: true,
        value: { add: vi.fn(), remove: vi.fn(), start: vi.fn(), stop: vi.fn() }
      });
      Object.defineProperty(this, "canvas", { configurable: true, value: { dataset: {} } });
    });
    vi.spyOn(Application.prototype, "destroy").mockImplementation(() => undefined);
    const preload = vi.spyOn(ActorSystem.prototype, "preloadCharacters").mockReturnValue(deferred.promise);
    const reconcile = vi.spyOn(ActorSystem.prototype, "reconcile");
    const host = {
      clientWidth: 960,
      clientHeight: 540,
      appendChild: vi.fn()
    } as unknown as HTMLElement;
    const characterPreloadPlan = [{ characterId: "alice", appearanceExpressions: [""] }] as const;
    const presenter = createPixiPresenter({ host, active: true, characterOutlineEnabled: true, characterPreloadPlan });

    const ready = presenter.mount();
    presenter.reconcile(createInitialPixiStageSnapshot());
    await Promise.resolve();
    await Promise.resolve();

    expect(preload).toHaveBeenCalledWith(characterPreloadPlan);
    expect(reconcile).not.toHaveBeenCalled();

    deferred.resolve({ ok: true });
    await ready;

    expect(reconcile).toHaveBeenCalledOnce();
    presenter.destroy();
  });

  it("stops inactive rendering and resumes the same presenter without remounting", async () => {
    const start = vi.fn();
    const stop = vi.fn();
    vi.spyOn(Application.prototype, "init").mockImplementation(async function (this: Application) {
      Object.defineProperty(this, "renderer", { configurable: true, value: { width: 960, height: 540 } });
      Object.defineProperty(this, "ticker", {
        configurable: true,
        value: { add: vi.fn(), remove: vi.fn(), start, stop }
      });
      Object.defineProperty(this, "canvas", { configurable: true, value: { dataset: {} } });
    });
    vi.spyOn(Application.prototype, "destroy").mockImplementation(() => undefined);
    const host = {
      clientWidth: 960,
      clientHeight: 540,
      appendChild: vi.fn()
    } as unknown as HTMLElement;
    const presenter = createPixiPresenter({ host, active: false, characterOutlineEnabled: true, characterPreloadPlan: [] });

    await presenter.mount();
    expect(stop).toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();

    presenter.setActive(true);
    expect(start).toHaveBeenCalledTimes(1);
    presenter.setActive(false);
    expect(stop).toHaveBeenCalledTimes(3);

    presenter.destroy();
    presenter.setActive(true);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("destroys an inactive presenter only once when preparation finishes late", async () => {
    const deferred = createDeferred<Awaited<ReturnType<ActorSystem["preloadCharacters"]>>>();
    const tickerAdd = vi.fn();
    vi.spyOn(Application.prototype, "init").mockImplementation(async function (this: Application) {
      Object.defineProperty(this, "renderer", { configurable: true, value: { width: 960, height: 540 } });
      Object.defineProperty(this, "ticker", {
        configurable: true,
        value: { add: tickerAdd, remove: vi.fn(), start: vi.fn(), stop: vi.fn() }
      });
      Object.defineProperty(this, "canvas", { configurable: true, value: { dataset: {} } });
    });
    const destroy = vi.spyOn(Application.prototype, "destroy").mockImplementation(() => undefined);
    const preload = vi.spyOn(ActorSystem.prototype, "preloadCharacters").mockReturnValue(deferred.promise);
    const host = {
      clientWidth: 960,
      clientHeight: 540,
      appendChild: vi.fn()
    } as unknown as HTMLElement;
    const presenter = createPixiPresenter({ host, active: false, characterOutlineEnabled: true, characterPreloadPlan: [] });

    const ready = presenter.mount();
    await vi.waitFor(() => expect(preload).toHaveBeenCalledOnce());
    presenter.destroy();
    deferred.resolve({ ok: true });
    await ready;

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(tickerAdd).not.toHaveBeenCalled();
  });

  it("reduces persistent VN commands into a terminal Pixi stage snapshot", () => {
    const initial = createInitialPixiStageSnapshot();
    const withBackground = reducePixiRuntimeCommand(initial, runtimeCommand("back", "scene", { appearance: "bg:harness" }));
    const withCharacter = reducePixiRuntimeCommand(
      withBackground.snapshot,
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1,ArmR3",
        pos: [50, 0]
      })
    );

    expect(withBackground).toMatchObject({
      snapshot: {
        version: 5,
        revision: 1,
        backgroundsById: {
          MainBackground: { id: "MainBackground", kind: "background", appearance: "bg:harness", visible: true }
        },
        actorOrder: ["MainBackground"]
      },
      hints: [],
      diagnostics: []
    });
    expect(withBackground.snapshot).not.toHaveProperty("background");
    expect(withCharacter.snapshot).toMatchObject({
      version: 5,
      revision: 2,
      backgroundsById: {
        MainBackground: { id: "MainBackground", kind: "background", appearance: "bg:harness" }
      },
      charactersById: {
        Ema: {
          id: "Ema",
          kind: "character",
          appearanceExpression: "Pensive1,ArmR3",
          pos: [0.5, 0],
          visible: true
        }
      },
      actorOrder: ["MainBackground", "Ema"]
    });
    expect(withCharacter.snapshot).not.toHaveProperty("background");
    expect(withCharacter.snapshot).not.toHaveProperty("slots");
    expect(withCharacter.hints).toEqual([]);
    expect(withCharacter.diagnostics).toEqual([]);
  });

  it("reduces one script-scoped character tone state and one global wait task", () => {
    const initial = createInitialPixiStageSnapshot();
    const enabled = reducePixiRuntimeCommand(
      initial,
      runtimeCommand("chartone", "effect", {
        preset: "rain",
        durationMs: 400,
        wait: true
      }, { canonicalName: "charTone" })
    );

    expect(enabled.snapshot.characterTone).toEqual({
      preset: "rain",
      amount: 1,
      scopeScriptPath: "pixi-presenter-test.nani",
      transition: { durationMs: 400, wait: true }
    });
    expect(enabled.waitTasks).toEqual([{
      kind: "character-tone-transition",
      target: "character-tone",
      revision: enabled.snapshot.revision
    }]);

    const amountOnly = reducePixiRuntimeCommand(
      enabled.snapshot,
      runtimeCommand("chartone", "effect", { amount: 2.5 }, { canonicalName: "charTone" })
    );
    expect(amountOnly.snapshot.characterTone).toMatchObject({ preset: "rain", amount: 2.5 });

    const sameTarget = reducePixiRuntimeCommand(
      amountOnly.snapshot,
      runtimeCommand("chartone", "effect", { amount: 2.5, durationMs: 500, wait: true }, { canonicalName: "charTone" })
    );
    expect(sameTarget).toEqual({ snapshot: amountOnly.snapshot, hints: [], waitTasks: [], diagnostics: [] });
  });

  it("rejects invalid character tone runtime values without mutating state", () => {
    const initial = createInitialPixiStageSnapshot();
    for (const params of [
      { preset: "unknown" },
      { amount: 1 },
      { preset: "rain", amount: Number.POSITIVE_INFINITY },
      { preset: "rain", amount: -1 },
      { preset: "none", amount: 1 }
    ]) {
      const reduction = reducePixiRuntimeCommand(
        initial,
        runtimeCommand("chartone", "effect", params, { canonicalName: "charTone" })
      );
      expect(reduction.snapshot).toBe(initial);
      expect(reduction.diagnostics).toHaveLength(1);
    }
  });

  it("removes character tone idempotently and clears it at a script boundary", () => {
    const enabled = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("chartone", "effect", { preset: "fog" }, { canonicalName: "charTone" })
    ).snapshot;
    const removed = reducePixiRuntimeCommand(
      enabled,
      runtimeCommand("chartone", "effect", {
        preset: "none",
        durationMs: 300,
        wait: true
      }, { canonicalName: "charTone" })
    );
    expect(removed.snapshot.characterTone).toBeUndefined();
    expect(removed.hints).toEqual([{
      type: "character-tone-remove",
      durationMs: 300,
      scopeScriptPath: "pixi-presenter-test.nani",
      wait: true
    }]);
    expect(removed.waitTasks).toEqual([{
      kind: "character-tone-transition",
      target: "character-tone",
      revision: removed.snapshot.revision
    }]);

    const idempotent = reducePixiRuntimeCommand(
      removed.snapshot,
      runtimeCommand("chartone", "effect", { amount: 0, durationMs: 300, wait: true }, { canonicalName: "charTone" })
    );
    expect(idempotent).toEqual({ snapshot: removed.snapshot, hints: [], waitTasks: [], diagnostics: [] });

    const crossed = reconcilePixiStageScriptScope(
      { snapshot: enabled, hints: [], waitTasks: [], diagnostics: [] },
      "game-a/chapter-02.nani"
    );
    expect(crossed.snapshot.characterTone).toBeUndefined();
    expect(crossed.snapshot.revision).toBe(enabled.revision + 1);
    const local = reconcilePixiStageScriptScope(
      { snapshot: enabled, hints: [], waitTasks: [], diagnostics: [] },
      "pixi-presenter-test.nani"
    );
    expect(local.snapshot).toBe(enabled);
  });

  it("reduces inback into the reserved inner background actor without touching main backgrounds", () => {
    const withMain = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { appearance: "bg:harness" })
    ).snapshot;
    const withInner = reducePixiRuntimeCommand(
      withMain,
      runtimeCommand("inback", "scene", {
        appearance: "bg:framed-room",
        transition: "fade",
        durationMs: 200,
        easing: "linear",
        wait: true
      })
    );

    expect(withInner.snapshot.backgroundsById.MainBackground).toMatchObject({ appearance: "bg:harness" });
    expect(withInner.snapshot.innerBackgroundsById[INNER_BACKGROUND_ID]).toMatchObject({
      id: INNER_BACKGROUND_ID,
      kind: "background",
      appearance: "bg:framed-room",
      visible: true,
      transition: { name: "fade", durationMs: 200, easing: "linear", wait: true }
    });
    expect(withInner.snapshot.actorOrder).toEqual(["MainBackground"]);
    expect(withInner.waitTasks).toEqual([
      { kind: "actor-transition", target: INNER_BACKGROUND_ID, revision: withInner.snapshot.revision }
    ]);
    expect(withInner.diagnostics).toEqual([]);
  });

  it("keeps back wildcard targeting scoped to main background actors, not inner backgrounds", () => {
    let stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { appearance: "bg:harness" })
    ).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("back", "scene", { target: "Flower", appearance: "Bloomed" })).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("inback", "scene", { appearance: "bg:framed-room" })).snapshot;

    const replacedMainBackgrounds = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("back", "scene", { target: "*", appearance: "bg:replacement" })
    ).snapshot;

    expect(Object.values(replacedMainBackgrounds.backgroundsById).map((actor) => actor.appearance)).toEqual([
      "bg:replacement",
      "bg:replacement"
    ]);
    expect(replacedMainBackgrounds.innerBackgroundsById[INNER_BACKGROUND_ID]?.appearance).toBe("bg:framed-room");
  });

  it("hides existing inner background actors and no-ops when none exists", () => {
    const initial = createInitialPixiStageSnapshot();
    const noOpHidden = reducePixiRuntimeCommand(initial, runtimeCommand("inback", "scene", { visible: false, wait: true }));

    expect(noOpHidden).toEqual({ snapshot: initial, hints: [], waitTasks: [], diagnostics: [] });

    const withInner = reducePixiRuntimeCommand(initial, runtimeCommand("inback", "scene", { appearance: "bg:framed-room" })).snapshot;
    const hidden = reducePixiRuntimeCommand(
      withInner,
      runtimeCommand("inback", "scene", { visible: false, durationMs: 120, wait: true })
    );

    expect(hidden.snapshot.innerBackgroundsById[INNER_BACKGROUND_ID]).toMatchObject({
      appearance: "bg:framed-room",
      visible: false,
      transition: { durationMs: 120, wait: true }
    });
    expect(hidden.waitTasks).toEqual([
      { kind: "actor-transition", target: INNER_BACKGROUND_ID, revision: hidden.snapshot.revision }
    ]);
  });

  it("keeps transient Pixi runtime commands out of the saveable stage snapshot", () => {
    const initial = createInitialPixiStageSnapshot();
    const flash = runtimeCommand("flash", "effect", { color: "#ffffff", duration: 160 });
    const keyword = runtimeCommand("trialkeyword", "ui", {
      keywordId: "kw:door",
      text: "locked",
      evidenceId: "evidence:keycard"
    });

    expect(reducePixiRuntimeCommand(initial, flash)).toEqual({
      snapshot: initial,
      hints: [{ type: "flash", color: "#ffffff", durationMs: 160, wait: false }],
      waitTasks: [],
      diagnostics: []
    });
    expect(reducePixiRuntimeCommand(initial, keyword)).toEqual({
      snapshot: initial,
      hints: [{ type: "trial-keyword", keywordId: "kw:door", text: "locked", evidenceId: "evidence:keycard" }],
      waitTasks: [],
      diagnostics: []
    });
  });

  it("diagnoses unsupported Pixi-routed runtime commands without changing the snapshot", () => {
    const initial = createInitialPixiStageSnapshot();

    expect(reducePixiRuntimeCommand(initial, runtimeCommand("focus", "effect", { target: "stage", duration: 500 }))).toEqual({
      snapshot: initial,
      hints: [],
      waitTasks: [],
      diagnostics: [
        {
          code: "unsupported-pixi-command",
          commandId: "focus",
          message: "@focus is routed to Pixi but is not consumed by pixi-presenter yet."
        }
      ]
    });
  });

  it("diagnoses unsupported Pixi params without writing fallback stage ids", () => {
    const initial = createInitialPixiStageSnapshot();

    expect(reducePixiRuntimeCommand(initial, runtimeCommand("back", "scene", {}))).toEqual({
      snapshot: initial,
      hints: [],
      waitTasks: [],
      diagnostics: [
        {
          code: "unsupported-pixi-params",
          commandId: "back",
          message: "@back is routed to Pixi but cannot be consumed: missing required params: appearance."
        }
      ]
    });
    expect(
      reducePixiRuntimeCommand(initial, runtimeCommand("slide", "actor", { target: "Missing", to: [50, 0] }))
    ).toEqual({
      snapshot: initial,
      hints: [],
      waitTasks: [],
      diagnostics: [
        {
          code: "unsupported-pixi-params",
          commandId: "slide",
          message: "@slide is routed to Pixi but cannot be consumed: unknown actor target: Missing."
        }
      ]
    });
    expect(reducePixiRuntimeCommand(initial, runtimeCommand("inback", "scene", {}))).toEqual({
      snapshot: initial,
      hints: [],
      waitTasks: [],
      diagnostics: [
        {
          code: "unsupported-pixi-params",
          commandId: "inback",
          message: "@inback is routed to Pixi but cannot be consumed: missing required params: appearance."
        }
      ]
    });
  });

  it("diagnoses unresolved runtime expressions without falling back to default visual params", () => {
    const initial = createInitialPixiStageSnapshot();

    expect(
      reducePixiRuntimeCommand(
        initial,
        runtimeCommand("flash", "effect", {
          color: "#ffffff",
          duration: { type: "expression", source: "flashDuration" }
        })
      )
    ).toEqual({
      snapshot: initial,
      hints: [],
      waitTasks: [],
      diagnostics: [
        {
          code: "unresolved-runtime-expression",
          commandId: "flash",
          message: "@flash contains unresolved expression params; Pixi requires resolved runtime values."
        }
      ]
    });
  });

  it("updates layered character expressions independently and preserves unrelated stage state", () => {
    let stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { appearance: "bg:harness" })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "Ren",
        appearanceExpression: "Default",
        pos: [24, 0]
      })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1",
        pos: [50, 0]
      })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "Mira",
        appearanceExpression: "Default",
        pos: [76, 0]
      })
    ).snapshot;
    const replacedCenter = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1,ArmR3"
      })
    ).snapshot;

    expect(replacedCenter).toMatchObject({
      version: 5,
      revision: 5,
      charactersById: {
        Ren: {
          id: "Ren",
          appearanceExpression: "Default",
          pos: [0.24, 0]
        },
        Ema: {
          id: "Ema",
          appearanceExpression: "Pensive1,ArmR3",
          pos: [0.5, 0]
        },
        Mira: {
          id: "Mira",
          appearanceExpression: "Default",
          pos: [0.76, 0]
        }
      },
      actorOrder: ["MainBackground", "Ren", "Ema", "Mira"]
    });
    expect(replacedCenter).not.toHaveProperty("background");
    expect(replacedCenter).not.toHaveProperty("slots");
  });

  it("uses command-count revision semantics for repeated persistent commands", () => {
    const first = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { appearance: "bg:harness" })
    ).snapshot;
    const second = reducePixiRuntimeCommand(first, runtimeCommand("back", "scene", { appearance: "bg:harness" })).snapshot;

    expect(second).toMatchObject({
      version: 5,
      revision: 2,
      backgroundsById: {
        MainBackground: { id: "MainBackground", kind: "background", appearance: "bg:harness" }
      }
    });
    expect(second).not.toHaveProperty("background");
  });

  it("applies wildcard character commands to visible actors instead of creating a literal star actor", () => {
    let stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("char", "actor", { target: "Ren", appearanceExpression: "Default", pos: [24, 0] })
    ).snapshot;
    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", { target: "Mira", appearanceExpression: "Default", pos: [76, 0] })
    ).snapshot;

    const tinted = reducePixiRuntimeCommand(stage, runtimeCommand("char", "actor", { target: "*", tint: "#ffdc22" })).snapshot;

    expect(tinted.charactersById).not.toHaveProperty("*");
    expect(tinted.charactersById.Ren).toMatchObject({ tint: "#ffdc22", pos: [0.24, 0], appearanceExpression: "" });
    expect(tinted.charactersById.Mira).toMatchObject({ tint: "#ffdc22", pos: [0.76, 0], appearanceExpression: "" });
  });

  it("shows a named character by default after hideChars while preserving explicit visible false", () => {
    let stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Default",
        pos: [50, 0]
      })
    ).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("hidechars", "actor", {})).snapshot;
    expect(stage.charactersById.Ema?.visible).toBe(false);

    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1"
      })
    ).snapshot;
    expect(stage.charactersById.Ema).toMatchObject({
      appearanceExpression: "Pensive1",
      visible: true
    });

    stage = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1,ArmR3",
        visible: false
      })
    ).snapshot;
    expect(stage.charactersById.Ema).toMatchObject({
      appearanceExpression: "Pensive1,ArmR3",
      visible: false
    });
  });

  it("stores explicitly targeted background actors without legacy compatibility fields", () => {
    let stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { target: "MainBackground", appearance: "bg:harness" })
    ).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("back", "scene", { target: "Flower", appearance: "Bloomed" })).snapshot;

    expect(stage.backgroundsById).toMatchObject({
      MainBackground: { id: "MainBackground", appearance: "bg:harness" },
      Flower: { id: "Flower", appearance: "Bloomed" }
    });
    expect(stage).not.toHaveProperty("background");
    expect(stage.actorOrder).toEqual(["MainBackground", "Flower"]);
  });

  it("uses official scene-percent positions for slide and stores from/to transition metadata", () => {
    const stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1",
        pos: [50, 0],
        visible: false
      })
    ).snapshot;
    const slid = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("slide", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1,ArmR3",
        from: [15, 50],
        to: [85, 0],
        durationMs: 500
      })
    ).snapshot;

    expect(slid.charactersById.Ema).toMatchObject({
      appearanceExpression: "Pensive1,ArmR3",
      visible: true,
      pos: [0.85, 0],
      transition: {
        name: "slide",
        durationMs: 500,
        from: [0.15, 0.5],
        to: [0.85, 0]
      }
    });
  });

  it("returns wait task descriptors for waitable Pixi presentation commands", () => {
    const withActor = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("char", "actor", {
        target: "Ema",
        appearanceExpression: "Pensive1",
        durationMs: 400,
        wait: true
      })
    );
    expect(withActor.waitTasks).toEqual([
      { kind: "actor-transition", target: "Ema", revision: withActor.snapshot.revision }
    ]);

    const flash = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("flash", "effect", { color: "#ffffff", durationMs: 120, wait: true })
    );
    expect(flash.waitTasks).toEqual([{ kind: "flash", target: "screen", revision: withActor.snapshot.revision }]);

    const glitch = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("glitch", "effect", {
        power: 0.8,
        durationMs: 240,
        blockJump: 1.2,
        burstJump: 0.7,
        pixelScatter: 1.4,
        colorNoise: 0.6,
        speed: 1.25,
        seed: 21,
        wait: true
      })
    );
    expect(glitch.hints).toEqual([
      {
        type: "glitch",
        power: 0.8,
        durationMs: 240,
        blockJump: 1.2,
        burstJump: 0.7,
        pixelScatter: 1.4,
        colorNoise: 0.6,
        speed: 1.25,
        seed: 21,
        wait: true
      }
    ]);
    expect(glitch.snapshot).toBe(withActor.snapshot);
    expect(glitch.waitTasks).toEqual([{ kind: "glitch", target: "screen", revision: withActor.snapshot.revision }]);

    const glitchFilter = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("glitchfilter", "effect", {
        power: 0.45,
        durationMs: 300,
        easing: "linear",
        blockJump: 0.5,
        burstJump: 0.25,
        pixelScatter: 0.75,
        colorNoise: 0.35,
        speed: 0.8,
        seed: 12,
        wait: true
      })
    );
    expect(glitchFilter.snapshot.screenFilters.glitch).toMatchObject({
      power: 0.45,
      blockJump: 0.5,
      burstJump: 0.25,
      pixelScatter: 0.75,
      colorNoise: 0.35,
      speed: 0.8,
      seed: 12,
      transition: { durationMs: 300, easing: "linear", lazy: false, wait: true }
    });
    expect(glitchFilter.hints).toEqual([]);
    expect(glitchFilter.waitTasks).toEqual([{ kind: "screen-filter-transition", target: "glitch", revision: glitchFilter.snapshot.revision }]);

    const glitchFilterOff = reducePixiRuntimeCommand(
      glitchFilter.snapshot,
      runtimeCommand("glitchfilter", "effect", { power: 0, durationMs: 200, easing: "linear", wait: true })
    );
    expect(glitchFilterOff.snapshot.screenFilters).not.toHaveProperty("glitch");
    expect(glitchFilterOff.hints).toEqual([{ type: "screen-filter-remove", kind: "glitch", durationMs: 200, easing: "linear", wait: true }]);
    expect(glitchFilterOff.waitTasks).toEqual([{ kind: "screen-filter-transition", target: "glitch", revision: glitchFilterOff.snapshot.revision }]);

    const rain = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("rain", "effect", { power: 0.6, wind: -0.25, hue: 205, tint: 0.8, durationMs: 300, wait: true })
    );
    expect(rain.snapshot.weather.rain).toMatchObject({
      kind: "rain",
      commandParams: { power: 0.6, wind: -0.25, hue: 205, tint: 0.8 }
    });
    expect(rain.waitTasks).toEqual([{ kind: "weather-transition", target: "rain", revision: rain.snapshot.revision }]);

    const rainOff = reducePixiRuntimeCommand(
      rain.snapshot,
      runtimeCommand("rain", "effect", { power: 0, durationMs: 300, wait: true })
    );
    expect(rainOff.snapshot.weather).not.toHaveProperty("rain");
    expect(rainOff.hints).toEqual([{ type: "weather-remove", kind: "rain", durationMs: 300, wait: true }]);
    expect(rainOff.waitTasks).toEqual([{ kind: "weather-transition", target: "rain", revision: rainOff.snapshot.revision }]);

    const bokeh = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("bokeh", "effect", { power: 0.5, durationMs: 300, wait: true })
    );
    const bokehOff = reducePixiRuntimeCommand(
      bokeh.snapshot,
      runtimeCommand("bokeh", "effect", { power: 0, durationMs: 180, wait: true })
    );
    expect(bokehOff.snapshot.screenFilters).not.toHaveProperty("bokeh");
    expect(bokehOff.hints).toEqual([{ type: "screen-filter-remove", kind: "bokeh", durationMs: 180, wait: true }]);
    expect(bokehOff.waitTasks).toEqual([{ kind: "screen-filter-transition", target: "bokeh", revision: bokehOff.snapshot.revision }]);

    const inactiveWeatherOff = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("snow", "effect", { power: 0, durationMs: 300, wait: true })
    );
    expect(inactiveWeatherOff.hints).toEqual([]);
    expect(inactiveWeatherOff.waitTasks).toEqual([]);

    const inactiveBokehOff = reducePixiRuntimeCommand(
      withActor.snapshot,
      runtimeCommand("bokeh", "effect", { power: 0, durationMs: 300, wait: true })
    );
    expect(inactiveBokehOff.waitTasks).toEqual([]);
  });

  it("diagnoses unsupported loop shake instead of creating a finite approximation", () => {
    const initial = createInitialPixiStageSnapshot();

    expect(reducePixiRuntimeCommand(initial, runtimeCommand("shake", "effect", { target: "stage", loop: true, wait: true }))).toEqual({
      snapshot: initial,
      hints: [],
      waitTasks: [],
      diagnostics: [
        {
          code: "unsupported-pixi-params",
          commandId: "shake",
          message:
            "@shake is routed to Pixi but cannot be consumed: @shake loop! is not implemented by this Pixi runtime; disable loop or issue a finite shake."
        }
      ]
    });
  });

  it("removes zero-power blur, bokeh, and weather state instead of leaving inert saved filters", () => {
    let stage = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("back", "scene", { appearance: "bg:harness" })
    ).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("blur", "effect", { target: "MainBackground", power: 0.4 })).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("bokeh", "effect", { focus: "MainBackground", power: 0.5 })).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("glitchfilter", "effect", { power: 0.35 })).snapshot;
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("rain", "effect", { power: 0.6 })).snapshot;

    const noBlur = reducePixiRuntimeCommand(stage, runtimeCommand("blur", "effect", { target: "MainBackground", power: 0 })).snapshot;
    const noBokeh = reducePixiRuntimeCommand(noBlur, runtimeCommand("bokeh", "effect", { power: 0 })).snapshot;
    const noGlitch = reducePixiRuntimeCommand(noBokeh, runtimeCommand("glitchfilter", "effect", { power: 0 })).snapshot;
    const noRain = reducePixiRuntimeCommand(noGlitch, runtimeCommand("rain", "effect", { power: 0 })).snapshot;

    const mainBackground = noRain.backgroundsById.MainBackground;
    expect(mainBackground).toBeDefined();
    expect(mainBackground?.filters).not.toHaveProperty("blur");
    expect(noRain.screenFilters).not.toHaveProperty("bokeh");
    expect(noRain.screenFilters).not.toHaveProperty("glitch");
    expect(noRain.weather).not.toHaveProperty("rain");
  });

  it("normalizes rain command params before saving and resolves power presets internally", () => {
    const normalized = reducePixiRuntimeCommand(
      createInitialPixiStageSnapshot(),
      runtimeCommand("rain", "effect", { power: 1.4, wind: -2, hue: 725, tint: 3 })
    );

    expect(normalized.snapshot.weather.rain).toMatchObject({
      kind: "rain",
      commandParams: { power: 1, wind: -1, hue: 5, tint: 2 }
    });
    expect(normalized.snapshot.weather.rain).not.toHaveProperty("rainSettings");
    expect(normalized.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "normalized-pixi-params",
      "normalized-pixi-params",
      "normalized-pixi-params",
      "normalized-pixi-params"
    ]);

    const zero = resolveRainSettingsFromCommandParams({ power: 0, wind: -1, hue: 215, tint: 0.55 });
    const weak = resolveRainSettingsFromCommandParams({ power: 0.2, wind: -1, hue: 215, tint: 0.55 });
    const medium = resolveRainSettingsFromCommandParams({ power: 0.5, wind: -1, hue: 215, tint: 0.55 });
    const full = resolveRainSettingsFromCommandParams({ power: 1, wind: -1, hue: 215, tint: 0.55 });
    expect(zero.rainBase).toEqual(weak.rainBase);
    expect(zero.globalRain.midRain.bands.map((band) => Number(band.density.toFixed(3)))).toEqual([0, 0, 0]);
    expect(zero.rainTrackSelection).toMatchObject({ minActive: 0, maxActive: 0 });
    expect(weak.rainBase).toMatchObject({ speedPerFrame: 0.119, length: 0.256, width: 1.25, strength: 0.54 });
    expect(weak.globalRain.midRain.bands.map((band) => Number(band.density.toFixed(3)))).toEqual([0.83, 0.87, 0.67]);
    expect(medium.rainBase.strength).toBeCloseTo(0.73);
    expect(medium.globalRain.midRain.speedPerFrame).toBeCloseTo(0.334);
    expect(full.rainBase).toMatchObject({ speedPerFrame: 0.178, length: 0.278, width: 1.4, strength: 0.82 });
    expect(full.globalRain.midRain.bands.map((band) => Number(band.density.toFixed(3)))).toEqual([2, 1.06, 0.95]);
  });

  it("preserves shader snow controls and removes weather kinds independently", () => {
    let stage = createInitialPixiStageSnapshot();
    stage = reducePixiRuntimeCommand(stage, runtimeCommand("rain", "effect", { power: 0.7, durationMs: 120 })).snapshot;
    const withSnow = reducePixiRuntimeCommand(
      stage,
      runtimeCommand("snow", "effect", {
        power: 0.9,
        xSpeed: -0.35,
        ySpeed: 0.72,
        density: 1.45,
        flakeScale: 1.2,
        sway: 0.85,
        fog: 0.32,
        noise: 0.04,
        seed: 17,
        durationMs: 300,
        wait: true
      })
    );

    expect(withSnow.snapshot.weather.rain).toMatchObject({ kind: "rain", commandParams: { power: 0.7 } });
    expect(withSnow.snapshot.weather.snow).toMatchObject({
      kind: "snow",
      power: 0.9,
      xSpeed: -0.35,
      ySpeed: 0.72,
      density: 1.45,
      flakeScale: 1.2,
      sway: 0.85,
      fog: 0.32,
      noise: 0.04,
      seed: 17
    });
    expect(withSnow.waitTasks).toEqual([{ kind: "weather-transition", target: "snow", revision: withSnow.snapshot.revision }]);

    const noSnow = reducePixiRuntimeCommand(
      withSnow.snapshot,
      runtimeCommand("snow", "effect", { power: 0, durationMs: 200, wait: true })
    );
    expect(noSnow.snapshot.weather).toHaveProperty("rain");
    expect(noSnow.snapshot.weather).not.toHaveProperty("snow");
    expect(noSnow.hints).toEqual([{ type: "weather-remove", kind: "snow", durationMs: 200, wait: true }]);
    expect(noSnow.waitTasks).toEqual([{ kind: "weather-transition", target: "snow", revision: noSnow.snapshot.revision }]);
  });
});

function flushFrames(frameCallbacks: Map<number, FrameRequestCallback>): void {
  for (const [frame, callback] of [...frameCallbacks]) {
    frameCallbacks.delete(frame);
    callback(16);
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function runtimeCommand(
  commandId: string,
  category: NaniCommandCategory,
  params: Record<string, RuntimeValue>,
  options: {
    canonicalName?: string;
    source?: NaniCommandSource;
    status?: NaniCommandStatus;
  } = {}
): RuntimeCommand {
  return {
    commandId,
    canonicalName: options.canonicalName ?? commandId,
    category,
    source: options.source ?? "v-ronpa",
    status: options.status ?? "implemented",
    params,
    loc: { scriptPath: "pixi-presenter-test.nani", line: 1, column: 1, raw: `@${commandId}` }
  };
}
