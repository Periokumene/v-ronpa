import { createHash } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export interface FrameProfile {
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  samples: number;
  over16_7Ratio: number;
  over33_3Ratio: number;
}

export interface GameAEffectsSnapshot {
  workbench: { phase: string; viewedScriptPath: string; runtimeScriptPath: string };
  story: { text: string | null; choices: string[] };
  pixi: {
    snapshot: {
      revision: number;
      backgroundsById: Record<string, unknown>;
      innerBackgroundsById: Record<string, unknown>;
      charactersById: Record<string, { filters: Record<string, unknown> }>;
      weather: Record<string, unknown>;
      screenFilters: Record<string, unknown>;
    };
    animate: boolean;
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

export async function prepareEffectsPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    indexedDB.deleteDatabase("v-ronpa-game-a-saves-v13");
    sessionStorage.removeItem("v-ronpa:game-a:nani-devtools:v4");
  });
  await page.setViewportSize({ width: 1_920, height: 1_080 });
  await page.goto("/");
  await expect(page.getByTestId("vn-devtools-dock")).toBeVisible();
  await expect.poll(async () => (await readEffectsSnapshot(page)).workbench.phase).toBe("ready");
}

export async function selectDevelopmentScript(page: Page, fileName: string, previewText: string): Promise<void> {
  const workbench = page.getByTestId("vn-devtools-dock");
  const picker = workbench.locator("details.vn-devtools-script-picker");
  await picker.locator("summary").click();
  const option = workbench.getByRole("option", { name: new RegExp(fileName.replace(".", "\\.")) });
  await expect(option).toContainText("development");
  await option.click();
  await expect.poll(async () => (await readEffectsSnapshot(page)).workbench.viewedScriptPath)
    .toBe(`game-a/dev/${fileName}`);
  const line = workbench.locator('[data-testid^="vn-devtools-line-"]').filter({ hasText: previewText }).first();
  await expect(line.locator(".vn-devtools-preview-button")).toBeEnabled();
  await line.locator(".vn-devtools-preview-button").click();
  await expect.poll(async () => (await readEffectsSnapshot(page)).workbench.runtimeScriptPath)
    .toBe(`game-a/dev/${fileName}`);
  await expect(page.getByTestId("vn-dialog-text")).toContainText(previewText);
}

export async function triggerAndObserveTask(page: Page, currentText: string, kind: string, target: string): Promise<GameAEffectsSnapshot> {
  await advanceVn(page);
  await page.waitForTimeout(24);
  let snapshot = await readEffectsSnapshot(page);
  if (snapshot.story.text?.includes(currentText) && !findRunningTask(snapshot, kind, target)) await advanceVn(page);
  await expect.poll(async () => Boolean(findRunningTask(await readEffectsSnapshot(page), kind, target)), {
    intervals: [8, 12, 20, 30], timeout: 1_500
  }).toBe(true);
  snapshot = await readEffectsSnapshot(page);
  expect(snapshot.pixi.animate).toBe(true);
  expect(snapshot.pixi.presentationTasks.filter((task) => task.status === "running" && task.kind === kind && task.target === target))
    .toEqual([expect.objectContaining({ kind, target })]);
  return snapshot;
}

export function findRunningTask(snapshot: GameAEffectsSnapshot, kind: string, target: string) {
  return snapshot.pixi.presentationTasks.find((task) => task.kind === kind && task.target === target && task.status === "running");
}

export async function advanceUntilChoices(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if ((await readEffectsSnapshot(page)).story.choices.length > 0) return;
    await advanceVn(page); await page.waitForTimeout(80);
  }
  await expect(page.getByTestId("vn-choice-0")).toBeVisible();
}

export async function advanceUntilStoryText(page: Page, expected: string, maxSteps = 12): Promise<void> {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if ((await readEffectsSnapshot(page)).story.text?.includes(expected)) return;
    await advanceVn(page); await page.waitForTimeout(120);
  }
  await expect.poll(async () => (await readEffectsSnapshot(page)).story.text, { timeout: 12_000 }).toContain(expected);
}

export async function waitForStoryText(page: Page, expected: string, timeout = 12_000): Promise<void> {
  await expect.poll(async () => (await readEffectsSnapshot(page)).story.text, { timeout }).toContain(expected);
}

export async function advanceVn(page: Page): Promise<void> {
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-testid="vn-advance-hit-plane"]')?.click());
}

export async function capturePlayfield(page: Page, fileName: string): Promise<void> {
  await page.getByTestId("game-a-dev-viewport-stage").screenshot({ animations: "allow", path: `test-results/${fileName}` });
}

export async function frameFingerprint(page: Page): Promise<string> {
  const image = await page.locator('canvas[data-testid="pixi-canvas"]').screenshot({ animations: "allow" });
  return createHash("sha256").update(image).digest("hex");
}

export async function measureFrameProfile(page: Page, sampleCount: number, warmupFrames: number): Promise<FrameProfile> {
  return page.evaluate(async ({ count, warmupFrames: warmupCount }) => new Promise<FrameProfile>((resolve) => {
    const samples: number[] = []; let previous: number | undefined; let warmup = warmupCount;
    const frame = (now: number) => {
      if (previous !== undefined) { if (warmup > 0) warmup -= 1; else samples.push(now - previous); }
      previous = now;
      if (samples.length < count) requestAnimationFrame(frame);
      else {
        const ordered = [...samples].sort((a, b) => a - b);
        const percentile = (amount: number) => ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * amount))] ?? 0;
        resolve({ medianMs: percentile(0.5), p95Ms: percentile(0.95), maxMs: ordered.at(-1) ?? 0,
          samples: ordered.length, over16_7Ratio: ordered.filter((sample) => sample > 16.7).length / ordered.length,
          over33_3Ratio: ordered.filter((sample) => sample > 33.3).length / ordered.length });
      }
    };
    requestAnimationFrame(frame);
  }), { count: sampleCount, warmupFrames });
}

export async function readRendererProfile(page: Page): Promise<{ renderer: string; vendor: string; hardwareAccelerated: boolean }> {
  return page.locator('canvas[data-testid="pixi-canvas"]').evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2") ?? (canvas as HTMLCanvasElement).getContext("webgl");
    if (!gl) return { renderer: "unavailable", vendor: "unavailable", hardwareAccelerated: false };
    const extension = gl.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number; UNMASKED_VENDOR_WEBGL: number } | null;
    const renderer = extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    const vendor = extension ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR));
    return { renderer, vendor, hardwareAccelerated: !/swiftshader|llvmpipe|software/iu.test(`${renderer} ${vendor}`) };
  });
}

export async function readEffectsSnapshot(page: Page): Promise<GameAEffectsSnapshot> {
  return page.evaluate(() => {
    const render = (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
    if (!render) throw new Error("Game A text snapshot is unavailable.");
    return JSON.parse(render()) as GameAEffectsSnapshot;
  });
}
