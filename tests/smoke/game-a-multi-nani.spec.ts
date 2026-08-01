import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const chapterSourceFile = fileURLToPath(
  new URL("../../apps/game-a/src/nani/chapter-02.nani", import.meta.url)
);

test.setTimeout(240_000);

test("FastDebug previews the current script cold, switches without mutating the scene, and preserves Entry mode", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("game-a-fast-debug-smoke-ready") !== "true") {
      indexedDB.deleteDatabase("v-ronpa-game-a-saves-v11");
      sessionStorage.removeItem("v-ronpa:game-a:nani-devtools:v4");
      sessionStorage.setItem("game-a-fast-debug-smoke-ready", "true");
    }
  });
  await page.goto("/");

  const workbench = page.getByTestId("vn-devtools-dock");
  const toggle = workbench.getByTestId("vn-devtools-fast-debug-toggle");
  await expect(workbench).toBeVisible();
  await expect.poll(async () => (await readSnapshot(page)).workbench.phase).toBe("ready");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toContainText("FAST");
  await toggle.click();
  await expect.poll(async () => (await readSnapshot(page)).workbench.phase).toBe("ready");
  expect((await readSnapshot(page)).workbench.previewableLineCount).toBeGreaterThan(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  const scriptPicker = workbench.locator("details.vn-devtools-script-picker");
  await scriptPicker.locator("summary").click();
  await workbench.getByRole("option", { name: /chapter-02\.nani/ }).click();
  const target = workbench.locator('[data-testid^="vn-devtools-line-"]')
    .filter({ hasText: "原味。购物清单" })
    .first();
  await expect(target.locator(".vn-devtools-preview-button")).toBeEnabled();
  await target.locator(".vn-devtools-preview-button").click();
  await expect(page.getByTestId("vn-dialog-text")).toContainText("原味。购物清单", { timeout: 15_000 });
  const fast = await readSnapshot(page);
  expect(fast.workbench).toMatchObject({
    materializationMode: "fast-current-script",
    runtimeScriptPath: "game-a/chapter-02.nani"
  });
  expect(fast.stableCheckpoint?.media.bgmByGroup).toEqual({});
  expect(fast.stableCheckpoint?.media.loopingSfxByKey).toEqual({});

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toContainText("ENTRY");
  const afterSwitch = await readSnapshot(page);
  expect(afterSwitch.story.text).toBe(fast.story.text);
  expect(afterSwitch.stableCheckpoint?.media).toEqual(fast.stableCheckpoint?.media);
  expect(afterSwitch.workbench.pinned).toBe(false);
  const switchedSession = await page.evaluate(() => JSON.parse(
    sessionStorage.getItem("v-ronpa:game-a:nani-devtools:v4") ?? "null"
  ) as { pinnedTarget?: unknown; decisions?: unknown[] });
  expect(switchedSession.pinnedTarget).toBeUndefined();
  expect(switchedSession.decisions).toEqual([]);

  await target.locator(".vn-devtools-preview-button").click();
  await expect.poll(async () => (await readSnapshot(page)).workbench.phase).toBe("ready");
  const canonical = await readSnapshot(page);
  expect(canonical.workbench.materializationMode).toBe("canonical-entry");
  expect(canonical.stableCheckpoint?.media.bgmByGroup.music?.sourceRef).toBe("bgm:dead-fish-riffle");
  expect(canonical.stableCheckpoint?.media.loopingSfxByKey.rain?.sourceRef).toBe("sfx:gentle-rain-loop");
  await page.screenshot({ path: "test-results/game-a-fast-debug-entry-mode.png", fullPage: true });

  await page.reload();
  await expect(workbench).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect((await readSnapshot(page)).workbench.materializationMode).toBe("canonical-entry");
  expect(consoleErrors).toEqual([]);
});

test("Game A traverses, saves, previews, restores, and completes its production multi-Nani entry", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    indexedDB.deleteDatabase("v-ronpa-game-a-saves-v11");
    sessionStorage.removeItem("v-ronpa:game-a:nani-devtools:v4");
  });
  await page.goto("/");

  const workbench = page.getByTestId("vn-devtools-dock");
  await expect(workbench).toBeVisible();
  await expect.poll(async () => Math.round((await workbench.boundingBox())?.width ?? 0)).toBe(504);
  const scriptPicker = workbench.locator("details.vn-devtools-script-picker");
  await scriptPicker.locator("summary").click();
  await expect(workbench.getByRole("listbox", { name: "VN scripts" })).toBeVisible();
  await expect(workbench.getByRole("option")).toHaveCount(2);
  await page.screenshot({ path: "test-results/game-a-multi-nani-script-selector-504.png", fullPage: true });
  await workbench.getByRole("option", { name: /chapter-02\.nani/ }).click();
  await expect.poll(async () => (await readSnapshot(page)).workbench.viewedScriptPath)
    .toBe("game-a/chapter-02.nani");
  expect((await readSnapshot(page)).workbench.runtimeScriptPath).toBe("game-a/opening.nani");

  await page.getByTestId("vn-devtools-resizer").focus();
  await page.keyboard.press("Home");
  await expect.poll(async () => Math.round((await workbench.boundingBox())?.width ?? 0)).toBe(320);
  await page.screenshot({ path: "test-results/game-a-multi-nani-chapter-02-view-320.png", fullPage: true });

  await expect(page.getByTestId("title-new-game")).toBeEnabled({ timeout: 15_000 });
  await clickByTestId(page, "title-new-game");
  await advanceProductionStoryToFinalOpeningChoice(page);
  const beforeNavigation = await readSnapshot(page);
  expect(beforeNavigation.workbench.runtimeScriptPath).toBe("game-a/opening.nani");
  expect(beforeNavigation.stableCheckpoint?.media.loopingSfxByKey.rain?.sourceRef).toBe("sfx:gentle-rain-loop");
  expect(beforeNavigation.stableCheckpoint?.media.bgmByGroup.music?.sourceRef).toBe("bgm:dead-fish-riffle");

  await clickByTestId(page, "vn-choice-0");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("这还差不多", { timeout: 15_000 });
  const afterNavigation = await readSnapshot(page);
  expect(afterNavigation.workbench.runtimeScriptPath).toBe("game-a/chapter-02.nani");
  expect(afterNavigation.stableCheckpoint?.media).toEqual(beforeNavigation.stableCheckpoint?.media);
  expect(afterNavigation.pixi.characters).toContain("alice");
  expect(afterNavigation.pixi.weather).toContain("rain");

  await expect(page.getByTestId("vn-command-save")).toBeEnabled();
  await clickByTestId(page, "vn-command-save");
  await clickByTestId(page, "save-slot-1");
  await expect(page.getByTestId("save-slot-1")).toContainText("这还差不多");
  await clickByTestId(page, "pause-return-title");
  await expect(page.getByTestId("game-a-mode")).toHaveText("标题");
  await expect(page.getByTestId("title-load")).toBeEnabled();
  await clickByTestId(page, "title-load");
  await clickByTestId(page, "save-slot-1");
  await clickByTestId(page, "load-confirm");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("这还差不多", { timeout: 15_000 });
  const restored = await readSnapshot(page);
  expect(restored.workbench.runtimeScriptPath).toBe("game-a/chapter-02.nani");
  expect(restored.stableCheckpoint?.media).toEqual(afterNavigation.stableCheckpoint?.media);
  await page.screenshot({ path: "test-results/game-a-multi-nani-chapter-02-load.png", fullPage: true });

  const previewTarget = workbench.locator('[data-testid^="vn-devtools-line-"]')
    .filter({ hasText: "原味。购物清单" })
    .first();
  await previewTarget.hover();
  await previewTarget.locator(".vn-devtools-preview-button").click();
  await expect(page.getByTestId("vn-dialog-text")).toContainText("原味。购物清单", { timeout: 15_000 });
  expect((await readSnapshot(page)).workbench.runtimeScriptPath).toBe("game-a/chapter-02.nani");
  await page.setViewportSize({ width: 820, height: 720 });
  await expect.poll(async () => workbench.evaluate((dock) => getComputedStyle(dock).position)).toBe("fixed");
  await page.screenshot({ path: "test-results/game-a-multi-nani-cross-script-preview-overlay.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  await advanceUntilTitle(page, 48);
  await expect(page.getByTestId("title-surface")).toBeVisible();
  await expect(page.getByTestId("game-a-mode")).toHaveText("标题");
  await expect(workbench.getByLabel("Current runtime position")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test("an opening fixed point never blocks viewing or previewing chapter-02 before and after runtime navigation", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("game-a-fixed-point-smoke-ready") !== "true") {
      indexedDB.deleteDatabase("v-ronpa-game-a-saves-v11");
      sessionStorage.removeItem("v-ronpa:game-a:nani-devtools:v4");
      sessionStorage.setItem("game-a-fixed-point-smoke-ready", "true");
    }
  });
  await page.goto("/");

  const workbench = page.getByTestId("vn-devtools-dock");
  await expect(workbench).toBeVisible();
  await expect.poll(async () => (await readSnapshot(page)).workbench.phase).toBe("ready");
  const openingChoice = workbench.locator('[data-testid^="vn-devtools-line-"]')
    .filter({ hasText: "最喜欢雨天了" })
    .first();
  await expect(openingChoice.locator(".vn-devtools-preview-button")).toBeEnabled();
  await openingChoice.locator(".vn-devtools-preview-button").click();
  await expect.poll(async () => (await readSnapshot(page)).workbench.phase).toBe("ready");
  await expect.poll(async () => (await readSnapshot(page)).workbench.runtimeScriptPath)
    .toBe("game-a/opening.nani");

  const scriptPicker = workbench.locator("details.vn-devtools-script-picker");
  await scriptPicker.locator("summary").click();
  await workbench.getByRole("option", { name: /chapter-02\.nani/ }).click();
  await expect.poll(async () => (await readSnapshot(page)).workbench.viewedScriptPath)
    .toBe("game-a/chapter-02.nani");
  await expect.poll(async () => (await readSnapshot(page)).workbench.phase).toBe("ready");
  const viewedBeforeNavigation = await readSnapshot(page);
  expect(viewedBeforeNavigation.workbench.previewableLineCount).toBeGreaterThan(0);
  expect(viewedBeforeNavigation.workbench.blockedLineCount)
    .toBeLessThan(viewedBeforeNavigation.workbench.lineCount);
  await page.reload();
  await expect(workbench).toBeVisible();
  await expect.poll(async () => (await readSnapshot(page)).workbench.viewedScriptPath)
    .toBe("game-a/chapter-02.nani");
  await expect.poll(async () => (await readSnapshot(page)).workbench.phase).toBe("ready");
  const viewedAfterRefresh = await readSnapshot(page);
  expect(viewedAfterRefresh.workbench.runtimeScriptPath).toBe("game-a/opening.nani");
  expect(viewedAfterRefresh.workbench.previewableLineCount).toBeGreaterThan(0);
  await page.screenshot({
    path: "test-results/game-a-multi-nani-fixed-point-chapter-view.png",
    fullPage: true
  });

  await advanceProductionStoryToFinalOpeningChoice(page);
  await clickByTestId(page, "vn-choice-0");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("这还差不多", { timeout: 15_000 });
  const viewedAfterNavigation = await readSnapshot(page);
  expect(viewedAfterNavigation.workbench).toMatchObject({
    phase: "ready",
    viewedScriptPath: "game-a/chapter-02.nani",
    runtimeScriptPath: "game-a/chapter-02.nani"
  });
  expect(viewedAfterNavigation.workbench.previewableLineCount).toBeGreaterThan(0);
  const chapterTarget = workbench.locator('[data-testid^="vn-devtools-line-"]')
    .filter({ hasText: "原味。购物清单" })
    .first();
  await expect(chapterTarget.locator(".vn-devtools-preview-button")).toBeEnabled();
});

test("a future-script HMR installs only its catalog record even when opening has a fixed point", async ({ page }) => {
  const originalSource = await readFile(chapterSourceFile, "utf8");
  const updatedSource = originalSource.replace(
    "Alice: 这还差不多。跟紧一点，别又站在雨里发呆。",
    "Alice: 这还差不多（future HMR probe）。跟紧一点，别又站在雨里发呆。"
  );
  expect(updatedSource).not.toBe(originalSource);
  await page.addInitScript(() => {
    indexedDB.deleteDatabase("v-ronpa-game-a-saves-v11");
    sessionStorage.removeItem("v-ronpa:game-a:nani-devtools:v4");
  });

  try {
    await page.goto("/");
    const workbench = page.getByTestId("vn-devtools-dock");
    await expect(workbench).toBeVisible();
    await page.waitForFunction(() =>
      typeof (window as Window & { render_game_to_text?: () => string }).render_game_to_text === "function"
    );
    await expect.poll(async () => (await readSnapshot(page)).workbench.phase).toBe("ready");
    await expect(page.getByTestId("title-new-game")).toBeEnabled();
    await clickByTestId(page, "title-new-game");
    const openingTarget = workbench.locator('[data-testid^="vn-devtools-line-"]')
      .filter({ hasText: "最喜欢雨天了" })
      .first();
    await openingTarget.hover();
    await openingTarget.locator(".vn-devtools-preview-button").click();
    await expect.poll(async () => (await readSnapshot(page)).workbench.phase).toBe("ready");
    const before = await readSnapshot(page);
    expect(before.story.executedScriptPaths).toEqual(["game-a/opening.nani"]);

    await writeFile(chapterSourceFile, updatedSource, "utf8");
    const scriptPicker = workbench.locator("details.vn-devtools-script-picker");
    await scriptPicker.locator("summary").click();
    await expect(workbench.getByRole("option", { name: /chapter-02\.nani/ })).toContainText("Updated", {
      timeout: 15_000
    });
    await workbench.getByRole("option", { name: /chapter-02\.nani/ }).click();
    await expect.poll(async () => (await readSnapshot(page)).workbench.message).toContain("future navigation");
    const after = await readSnapshot(page);
    expect(after.story).toEqual(before.story);
    expect(after.pixi).toEqual(before.pixi);
    expect(after.workbench.runtimeScriptPath).toBe("game-a/opening.nani");
    expect(after.workbench.viewedScriptPath).toBe("game-a/chapter-02.nani");
    await page.screenshot({
      path: "test-results/game-a-multi-nani-future-hmr-stage-unchanged.png",
      fullPage: true
    });
  } finally {
    await writeFile(chapterSourceFile, originalSource, "utf8");
  }
});

async function advanceProductionStoryToFinalOpeningChoice(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const snapshot = await readSnapshot(page);
    const choices = snapshot.story.choices;
    if (choices.length > 0) {
      if (choices[0]?.includes("陪我去买牛奶吧")) return;
      await clickByTestId(page, "vn-choice-0");
      await page.waitForTimeout(120);
      continue;
    }
    expect(snapshot.workbench.runtimeScriptPath).toBe("game-a/opening.nani");
    await advanceVn(page);
    await page.waitForTimeout(120);
  }
  await expect(page.getByTestId("vn-choice-0")).toHaveText("陪我去买牛奶吧");
}

async function advanceUntilTitle(page: Page, maxSteps: number): Promise<void> {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if ((await page.getByTestId("title-surface").count()) > 0) return;
    await advanceVn(page);
    await page.waitForTimeout(140);
  }
  await expect(page.getByTestId("title-surface")).toBeVisible();
}

async function advanceVn(page: Page): Promise<void> {
  await page.evaluate(() => {
    const hitPlane = document.querySelector<HTMLElement>('[data-testid="vn-advance-hit-plane"]');
    hitPlane?.click();
  });
}

async function clickByTestId(page: Page, testId: string): Promise<void> {
  const element = page.getByTestId(testId);
  await expect(element).toBeVisible();
  await element.click();
}

interface GameASnapshot {
  workbench: {
    phase: string;
    message: string | null;
    viewedScriptPath: string;
    runtimeScriptPath: string;
    lineCount: number;
    previewableLineCount: number;
    blockedLineCount: number;
    pinned: boolean;
    materializationMode: "fast-current-script" | "canonical-entry";
    materializationModeLocked: boolean;
  };
  pixi: {
    revision: number;
    characters: string[];
    weather: string[];
  };
  story: {
    storySession: number;
    executedScriptPaths: string[];
    choices: string[];
    text: string | null;
  };
  stableCheckpoint?: {
    media: {
      bgmByGroup: Record<string, { sourceRef: string; volume: number }>;
      loopingSfxByKey: Record<string, { sourceRef: string; group: string; volume: number }>;
    };
  };
}

async function readSnapshot(page: Page): Promise<GameASnapshot> {
  return page.evaluate(() => {
    const render = (window as Window & { render_game_to_text?: () => string }).render_game_to_text;
    if (!render) throw new Error("Game A text snapshot is unavailable.");
    return JSON.parse(render()) as GameASnapshot;
  });
}
