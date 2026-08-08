import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.setTimeout(240_000);
const enforcePerformanceBudget = process.env.PIXI_EFFECT_PERF_ASSERT === "1";

test("Game A runs the isolated and composition Pixi effect scripts with independent cleanup", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    indexedDB.deleteDatabase("v-ronpa-game-a-saves-v13");
    sessionStorage.removeItem("v-ronpa:game-a:nani-devtools:v4");
  });
  await page.setViewportSize({ width: 1_920, height: 1_080 });
  await page.goto("/");

  const workbench = page.getByTestId("vn-devtools-dock");
  await expect(workbench).toBeVisible();
  await expect.poll(async () => (await readSnapshot(page)).workbench.phase).toBe("ready");
  const devViewport = page.getByTestId("game-a-dev-viewport");
  await expect(devViewport).toHaveAttribute("data-logical-width", "1920");
  await expect(devViewport).toHaveAttribute("data-logical-height", "1080");
  const canvasSize = await page.locator('canvas[data-testid="pixi-canvas"]').evaluate((canvas) => ({
    width: (canvas as HTMLCanvasElement).width,
    height: (canvas as HTMLCanvasElement).height
  }));
  expect(canvasSize).toEqual({ width: 1_920, height: 1_080 });
  const renderer = await readRendererProfile(page);
  const scriptPicker = workbench.locator("details.vn-devtools-script-picker");
  await scriptPicker.locator("summary").click();
  const labOption = workbench.getByRole("option", { name: /pixi-effect-lab\.nani/ });
  await expect(labOption).toContainText("development");
  await labOption.click();
  await expect.poll(async () => (await readSnapshot(page)).workbench.viewedScriptPath)
    .toBe("game-a/dev/pixi-effect-lab.nani");

  const warningLine = workbench.locator('[data-testid^="vn-devtools-line-"]')
    .filter({ hasText: "本脚本包含高频闪烁" })
    .first();
  await expect(warningLine.locator(".vn-devtools-preview-button")).toBeEnabled();
  await warningLine.locator(".vn-devtools-preview-button").click();
  await expect.poll(async () => (await readSnapshot(page)).workbench.phase).toBe("ready");
  await expect.poll(async () => (await readSnapshot(page)).workbench.runtimeScriptPath)
    .toBe("game-a/dev/pixi-effect-lab.nani");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("本脚本包含高频闪烁");

  await advanceUntilChoices(page);
  await page.getByTestId("vn-choice-0").click();
  await advanceUntilStoryText(page, "CHECKPOINT LAB 01 IMPACT LOW");

  const transientCases = [
    { checkpoint: "CHECKPOINT LAB 03 IMPACT HIGH", next: "CHECKPOINT LAB 04 AFTERIMAGE LOW", kind: "impact", target: "screen", shot: "impact", captureDelayMs: 0 },
    { checkpoint: "CHECKPOINT LAB 06 AFTERIMAGE HIGH", next: "CHECKPOINT LAB 07 SHUTTER EYELID", kind: "afterimage", target: "alice", shot: "afterimage", captureDelayMs: 160 },
    { checkpoint: "CHECKPOINT LAB 09 SHUTTER SLICE", next: "CHECKPOINT LAB 10 FLICKER LOW", kind: "shutter", target: "screen", shot: "shutter", captureDelayMs: 120 },
    { checkpoint: "CHECKPOINT LAB 12 FLICKER HIGH", next: "CHECKPOINT LAB 13 VIGNETTE", kind: "flicker", target: "screen", shot: "flicker", captureDelayMs: 28, captureFrames: 5 }
  ] as const;
  let afterimageProfile: FrameProfile | undefined;
  for (const effect of transientCases) {
    await advanceUntilStoryText(page, effect.checkpoint);
    const active = await triggerAndObserveTask(page, effect.checkpoint, effect.kind, effect.target);
    expect(active.pixi.hints).toEqual([expect.objectContaining({ type: effect.kind })]);
    expect(active.pixi.screenFilters).toEqual({});
    expect(active.pixi.weatherEffects).toEqual({});
    expect(active.pixi.actorEffects).toEqual({});
    if (effect.captureDelayMs > 0) await page.waitForTimeout(effect.captureDelayMs);
    await capturePlayfield(page, `game-a-effects-lab-${effect.shot}.png`);
    for (let frame = 2; frame <= ("captureFrames" in effect ? effect.captureFrames : 1); frame += 1) {
      await page.waitForTimeout(24);
      await capturePlayfield(page, `game-a-effects-lab-${effect.shot}-frame-${frame}.png`);
    }
    if (effect.kind === "afterimage") afterimageProfile = await measureFrameProfile(page, 30, 5);
    await advanceUntilStoryText(page, effect.next, 20);
  }

  const persistentCases = [
    { checkpoint: "CHECKPOINT LAB 13 VIGNETTE", active: "VIGNETTE ACTIVE", next: "CHECKPOINT LAB 14 STATIC FILTER", task: "screen-filter-transition", target: "vignette", key: "vignette", family: "screen" },
    { checkpoint: "CHECKPOINT LAB 14 STATIC FILTER", active: "STATIC FILTER ACTIVE", next: "CHECKPOINT LAB 15 WATER VEIL", task: "screen-filter-transition", target: "staticFilter", key: "staticFilter", family: "screen" },
    { checkpoint: "CHECKPOINT LAB 15 WATER VEIL", active: "WATER VEIL ACTIVE", next: "CHECKPOINT LAB 16 SIGNAL MASK", task: "screen-filter-transition", target: "waterVeil", key: "waterVeil", family: "screen" },
    { checkpoint: "CHECKPOINT LAB 16 SIGNAL MASK", active: "SIGNAL MASK ACTIVE", next: "CHECKPOINT LAB 17 PULSE", task: "actor-transition", target: "alice", key: "signalMask", family: "actor" },
    { checkpoint: "CHECKPOINT LAB 17 PULSE", active: "PULSE ACTIVE", next: "CHECKPOINT LAB INDIVIDUAL COMPLETE", task: "screen-filter-transition", target: "pulse", key: "pulse", family: "screen", captureFrames: 4 }
  ] as const;
  let singleProfile: FrameProfile | undefined;
  for (const effect of persistentCases) {
    await waitForStoryText(page, effect.checkpoint);
    await triggerAndObserveTask(page, effect.checkpoint, effect.task, effect.target);
    await waitForStoryText(page, effect.active, 12_000);
    const active = await readSnapshot(page);
    expect(Object.keys(active.pixi.screenFilters)).toEqual(effect.family === "screen" ? [effect.key] : []);
    expect(Object.keys(active.pixi.weatherEffects)).toEqual(effect.family === "weather" ? [effect.key] : []);
    expect(Object.keys(active.pixi.actorEffects)).toEqual(effect.family === "actor" ? ["alice"] : []);
    if (effect.family === "actor") expect(Object.keys(active.pixi.actorEffects.alice ?? {})).toEqual([effect.key]);
    await capturePlayfield(page, `game-a-effects-lab-${effect.key}.png`);
    for (let frame = 2; frame <= ("captureFrames" in effect ? effect.captureFrames : 1); frame += 1) {
      await page.waitForTimeout(45);
      await capturePlayfield(page, `game-a-effects-lab-${effect.key}-frame-${frame}.png`);
    }
    if (effect.key === "pulse") singleProfile = await measureFrameProfile(page, 90, 20);
    await advanceUntilStoryText(page, effect.next, 20);
  }

  await expect.poll(async () => (await readSnapshot(page)).pixi.presentationTasks).toEqual([]);
  const isolatedCleaned = await readSnapshot(page);
  expect(isolatedCleaned.pixi.screenFilters).toEqual({});
  expect(isolatedCleaned.pixi.weatherEffects).toEqual({});
  expect(isolatedCleaned.pixi.actorEffects).toEqual({});
  expect(isolatedCleaned.pixi.hints).toEqual([]);
  await capturePlayfield(page, "game-a-effects-lab-individual-cleanup.png");

  await scriptPicker.locator("summary").click();
  const compositionOption = workbench.getByRole("option", { name: /pixi-effect-compositions\.nani/ });
  await expect(compositionOption).toContainText("development");
  await compositionOption.click();
  await expect.poll(async () => (await readSnapshot(page)).workbench.viewedScriptPath)
    .toBe("game-a/dev/pixi-effect-compositions.nani");
  const compositionWarningLine = workbench.locator('[data-testid^="vn-devtools-line-"]')
    .filter({ hasText: "复合效果脚本包含高频闪烁" })
    .first();
  await expect(compositionWarningLine.locator(".vn-devtools-preview-button")).toBeEnabled();
  await compositionWarningLine.locator(".vn-devtools-preview-button").click();
  await expect.poll(async () => (await readSnapshot(page)).workbench.phase).toBe("ready");
  await expect.poll(async () => (await readSnapshot(page)).workbench.runtimeScriptPath)
    .toBe("game-a/dev/pixi-effect-compositions.nani");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("复合效果脚本包含高频闪烁");
  await advanceUntilChoices(page);
  await page.getByTestId("vn-choice-0").click();
  await advanceUntilStoryText(page, "CHECKPOINT COMPOSITION 01 DOMESTIC PRESSURE");

  await advanceUntilStoryText(page, "你能不能不要再问了。");
  let composition = await readSnapshot(page);
  expect(Object.keys(composition.pixi.screenFilters)).toEqual(expect.arrayContaining(["vignette", "pulse"]));
  expect(composition.pixi.weatherEffects).toEqual({});
  await capturePlayfield(page, "game-a-effects-lab-domestic-pressure.png");
  const domesticProfile = await measureFrameProfile(page, 90, 20);

  await advanceUntilStoryText(page, "CHECKPOINT COMPOSITION 02 BROKEN TELEVISION", 20);
  await advanceUntilStoryText(page, "在身边的人变成都市怪谈里的电波头之前。");
  composition = await readSnapshot(page);
  expect(composition.pixi.screenFilters).toHaveProperty("staticFilter");
  expect(composition.pixi.actorEffects.alice).toHaveProperty("signalMask");
  expect(composition.pixi.weatherEffects).toEqual({});
  await capturePlayfield(page, "game-a-effects-lab-broken-television.png");

  await advanceUntilStoryText(page, "CHECKPOINT COMPOSITION 03 DROWNING", 20);
  await advanceUntilStoryText(page, "我只是很想在雨声里寻找一场可以把自己淹没的好梦。");
  composition = await readSnapshot(page);
  expect(composition.pixi.screenFilters).toHaveProperty("waterVeil");
  expect(composition.pixi.screenFilters).not.toHaveProperty("staticFilter");
  expect(composition.pixi.weatherEffects).toHaveProperty("rain");
  expect(composition.pixi.actorEffects).toEqual({});
  await capturePlayfield(page, "game-a-effects-lab-drowning.png");

  await advanceUntilStoryText(page, "CHECKPOINT COMPOSITION 04 STRESS AND ISOLATION", 20);
  await advanceUntilStoryText(page, "所有屏幕效果同时存在；下面逐项移除，其他效果必须保留。");
  composition = await readSnapshot(page);
  expect(Object.keys(composition.pixi.screenFilters)).toEqual(expect.arrayContaining([
    "bokeh", "waterVeil", "pulse", "staticFilter", "glitch", "vignette"
  ]));
  expect(composition.pixi.weatherEffects).toEqual({});
  expect(composition.pixi.actorEffects).toEqual({});
  await capturePlayfield(page, "game-a-effects-lab-stress-stack.png");
  const stressProfile = await measureFrameProfile(page, 90, 20);
  const performance = {
    viewport: canvasSize,
    renderer,
    profiles: { pulse: singleProfile, afterimage: afterimageProfile, domestic: domesticProfile, stress: stressProfile }
  };
  await writeFile("test-results/game-a-effects-lab-performance.json", JSON.stringify(performance, null, 2));
  await testInfo.attach("effect-lab-performance", { body: JSON.stringify(performance, null, 2), contentType: "application/json" });
  if (enforcePerformanceBudget) {
    expect(renderer.hardwareAccelerated).toBe(true);
    expect(singleProfile?.medianMs).toBeLessThanOrEqual(16.7);
    expect(afterimageProfile?.medianMs).toBeLessThanOrEqual(16.7);
    expect(domesticProfile.medianMs).toBeLessThanOrEqual(22.2);
    expect(stressProfile.medianMs).toBeLessThanOrEqual(33.3);
    expect(singleProfile?.over16_7Ratio).toBeLessThanOrEqual(0.1);
    expect(stressProfile.over33_3Ratio).toBeLessThanOrEqual(0.1);
  }

  await advanceUntilStoryText(page, "CHECKPOINT COMPOSITION COMPLETE", 20);
  await expect.poll(async () => (await readSnapshot(page)).pixi.presentationTasks).toEqual([]);
  const cleaned = await readSnapshot(page);
  expect(cleaned.pixi.screenFilters).toEqual({});
  expect(cleaned.pixi.weatherEffects).toEqual({});
  expect(cleaned.pixi.actorEffects).toEqual({});
  expect(cleaned.pixi.hints).toEqual([]);
  await capturePlayfield(page, "game-a-effects-lab-cleanup.png");

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

async function triggerAndObserveTask(
  page: Page,
  currentText: string,
  kind: string,
  target?: string
): Promise<GameAEffectsSnapshot> {
  await advanceVn(page);
  await page.waitForTimeout(24);
  let snapshot = await readSnapshot(page);
  if (snapshot.story.text?.includes(currentText) && !findRunningTask(snapshot, kind, target)) {
    await advanceVn(page);
  }
  await expect.poll(async () => Boolean(findRunningTask(await readSnapshot(page), kind, target)), {
    intervals: [8, 12, 20, 30],
    timeout: 1_500
  }).toBe(true);
  snapshot = await readSnapshot(page);
  expect(snapshot.pixi.animate).toBe(true);
  const statefulKinds = new Set(["actor-transition", "screen-filter-transition", "weather-transition"]);
  expect(snapshot.pixi.presentationTasks.filter((task) =>
    task.status === "running" && (task.kind === kind || statefulKinds.has(task.kind))
  )).toEqual([
    expect.objectContaining({ kind, ...(target === undefined ? {} : { target }) })
  ]);
  return snapshot;
}

function findRunningTask(snapshot: GameAEffectsSnapshot, kind: string, target?: string) {
  return snapshot.pixi.presentationTasks.find((task) =>
    task.kind === kind && task.status === "running" && (target === undefined || task.target === target)
  );
}

async function advanceUntilChoices(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if ((await readSnapshot(page)).story.choices.length > 0) return;
    await advanceVn(page);
    await page.waitForTimeout(80);
  }
  await expect(page.getByTestId("vn-choice-0")).toBeVisible();
}

async function advanceUntilStoryText(page: Page, expected: string, maxSteps = 12): Promise<void> {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if ((await readSnapshot(page)).story.text?.includes(expected)) return;
    await advanceVn(page);
    await page.waitForTimeout(120);
  }
  await expect.poll(async () => (await readSnapshot(page)).story.text, { timeout: 12_000 })
    .toContain(expected);
}

async function waitForStoryText(page: Page, expected: string, timeout = 12_000): Promise<void> {
  await expect.poll(async () => (await readSnapshot(page)).story.text, { timeout }).toContain(expected);
}

async function advanceVn(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-testid="vn-advance-hit-plane"]')?.click();
  });
}

async function capturePlayfield(page: Page, fileName: string): Promise<void> {
  await page.getByTestId("game-a-dev-viewport-stage").screenshot({
    animations: "allow",
    path: `test-results/${fileName}`
  });
}

interface FrameProfile {
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  samples: number;
  over16_7Ratio: number;
  over33_3Ratio: number;
}

async function measureFrameProfile(page: Page, sampleCount: number, warmupFrames: number): Promise<FrameProfile> {
  return page.evaluate(async ({ count, warmupFrames: warmupCount }) => new Promise<FrameProfile>((resolve) => {
    const samples: number[] = [];
    let previous: number | undefined;
    let warmup = warmupCount;
    const frame = (now: number) => {
      if (previous !== undefined) {
        if (warmup > 0) warmup -= 1;
        else samples.push(now - previous);
      }
      previous = now;
      if (samples.length < count) requestAnimationFrame(frame);
      else {
        const ordered = [...samples].sort((a, b) => a - b);
        const percentile = (amount: number) => ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * amount))] ?? 0;
        resolve({
          medianMs: percentile(0.5),
          p95Ms: percentile(0.95),
          maxMs: ordered.at(-1) ?? 0,
          samples: ordered.length,
          over16_7Ratio: ordered.filter((sample) => sample > 16.7).length / ordered.length,
          over33_3Ratio: ordered.filter((sample) => sample > 33.3).length / ordered.length
        });
      }
    };
    requestAnimationFrame(frame);
  }), { count: sampleCount, warmupFrames });
}

async function readRendererProfile(page: Page): Promise<{ renderer: string; vendor: string; hardwareAccelerated: boolean }> {
  return page.locator('canvas[data-testid="pixi-canvas"]').evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2") ?? (canvas as HTMLCanvasElement).getContext("webgl");
    if (!gl) return { renderer: "unavailable", vendor: "unavailable", hardwareAccelerated: false };
    const extension = gl.getExtension("WEBGL_debug_renderer_info") as {
      UNMASKED_RENDERER_WEBGL: number;
      UNMASKED_VENDOR_WEBGL: number;
    } | null;
    const renderer = extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    const vendor = extension ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR));
    return {
      renderer,
      vendor,
      hardwareAccelerated: !/swiftshader|llvmpipe|software/iu.test(`${renderer} ${vendor}`)
    };
  });
}

interface GameAEffectsSnapshot {
  workbench: {
    phase: string;
    viewedScriptPath: string;
    runtimeScriptPath: string;
  };
  story: {
    text: string | null;
    choices: string[];
  };
  pixi: {
    revision: number;
    animate: boolean;
    weather: string[];
    weatherEffects: Record<string, unknown>;
    screenFilters: Record<string, unknown>;
    actorEffects: Record<string, Record<string, unknown>>;
    hints: Array<{ type: string }>;
    presentationTasks: Array<{
      kind: string;
      target: string;
      revision: number;
      status: "running" | "completed" | "cancelled" | "settled";
      durationMs: number;
    }>;
  };
}

async function readSnapshot(page: Page): Promise<GameAEffectsSnapshot> {
  return page.evaluate(() => {
    const render = (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
    if (!render) throw new Error("Game A text snapshot is unavailable.");
    return JSON.parse(render()) as GameAEffectsSnapshot;
  });
}
