import { expect, test, type Page } from "@playwright/test";

test.setTimeout(240_000);

test("game-a ships product UI while exercising the test-only VN entry", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.addInitScript(() => {
    localStorage.removeItem("v-ronpa:game-a:settings:v1");
    indexedDB.deleteDatabase("v-ronpa-game-a-saves-v8");
  });
  await page.goto("/?vnEntry=smoke");

  await expect(page.getByTestId("game-a-playfield")).toBeVisible();
  await expect(page.getByTestId("game-a-app-id")).toHaveText("game-a");
  await expect(page.getByTestId("title-surface")).toHaveClass(/game-a-title-surface/);
  await page.screenshot({ path: "test-results/game-a-title.png", fullPage: true });

  await clickByTestId(page, "title-settings");
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await clickByTestId(page, "settings-subtab-display");
  await clickByTestId(page, "settings-display-text-size-next");
  await clickByTestId(page, "settings-display-text-speed-next");
  await page.screenshot({ path: "test-results/game-a-settings.png", fullPage: true });
  await clickByTestId(page, "settings-overlay-close");

  await clickByTestId(page, "title-new-game");
  await expect(page.getByTestId("game-a-mode")).toHaveText("视觉小说");
  await advanceUntilText(page, "CHECKPOINT SMOKE 00", 6);
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-frame", "resolved");
  await expect(page.getByTestId("pixi-layer")).toBeVisible();
  await page.screenshot({ path: "test-results/game-a-vn-dialog.png", fullPage: true });

  await advanceUntilChoices(page, 4);
  await expect(page.getByTestId("vn-choice-0")).toHaveText("交互与存档");
  await expectChoiceButtonCentered(page, "vn-choice-0");
  await page.screenshot({ path: "test-results/game-a-vn-choice.png", fullPage: true });
  await clickByTestId(page, "vn-choice-0");

  await advanceUntilText(page, "CHECKPOINT SMOKE UI", 10);
  await expect(page.getByTestId("vn-command-bar")).toHaveAttribute("data-ui-phase", "shown");
  await expect(page.getByTestId("vn-command-save")).toBeEnabled();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu-overlay")).toBeVisible();
  await page.screenshot({ path: "test-results/game-a-pause.png", fullPage: true });
  await clickByTestId(page, "pause-log");
  await expect(page.getByTestId("backlog-overlay")).toHaveAttribute("data-active-tab", "backlog");
  await clickByTestId(page, "backlog-overlay-close");
  await expect(page.getByTestId("pause-menu-overlay")).toBeVisible();
  await clickByTestId(page, "pause-menu-overlay-close");
  await expect(page.getByTestId("game-a-mode")).toHaveText("视觉小说");

  await clickByTestId(page, "vn-command-quick-save");
  await expect(page.getByTestId("vn-command-quick-load")).toBeEnabled();
  await clickByTestId(page, "vn-command-quick-load");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT SMOKE UI");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("vn-command-save")).toBeEnabled();

  await clickByTestId(page, "vn-command-save");
  await expect(page.getByTestId("save-load-overlay")).toHaveAttribute("data-active-tab", "save");
  await expect(page.getByTestId("save-slot-1")).toBeEnabled();
  await clickByTestId(page, "save-slot-1");
  await expect(page.getByTestId("save-slot-1")).toContainText("CHECKPOINT SMOKE UI");
  await page.screenshot({ path: "test-results/game-a-save.png", fullPage: true });
  await clickByTestId(page, "save-load-overlay-close");
  await clickByTestId(page, "vn-command-load");
  await expect(page.getByTestId("save-load-overlay")).toHaveAttribute("data-active-tab", "load");
  await expect(page.getByTestId("save-slot-1")).toBeEnabled();
  await clickByTestId(page, "save-slot-1");
  await expect(page.getByTestId("load-confirmation")).toBeVisible();
  await page.screenshot({ path: "test-results/game-a-save-load.png", fullPage: true });
  await clickByTestId(page, "load-confirm");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT SMOKE UI");

  await advanceUntilInputPrompt(page);
  await expect(page.getByTestId("runtime-input-prompt")).toBeVisible();
  await page.getByTestId("runtime-input-field").fill("Codex");
  await clickByTestId(page, "runtime-input-submit");
  await advanceUntilText(page, "CHECKPOINT SMOKE INPUT", 4);
  await advanceUntilText(page, "CHECKPOINT SMOKE PAUSE", 6);
  await advanceUntilChoices(page, 5);
  await clickByTestId(page, "vn-choice-0");

  await advanceUntilChoices(page, 10);
  await expect(page.getByTestId("vn-choice-0")).toHaveText("继续媒体测试");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-active-tasks", "empty");
  await page.screenshot({ path: "test-results/game-a-pixi.png", fullPage: true });
  await clickByTestId(page, "vn-choice-0");
  await advanceUntilText(page, "CHECKPOINT SMOKE VOICE", 4);
  await advanceUntilMovie(page, 5);
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/game-a-movie.png", fullPage: true });
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-testid="runtime-movie-skip"]')?.click();
  });
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT SMOKE MOVIE");

  expect(consoleErrors).toEqual([]);
});

async function advanceUntilText(page: Page, text: string, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    const currentText = (await page.getByTestId("vn-dialog-text").textContent({ timeout: 250 }).catch(() => null)) ?? "";
    if (currentText.includes(text)) return;
    await advanceVn(page);
    await page.waitForTimeout(160);
  }
  await expect(page.getByTestId("vn-dialog-text")).toContainText(text);
}

async function advanceVn(page: Page) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
}

async function clickByTestId(page: Page, testId: string) {
  const clicked = await page.evaluate((id) => {
    const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    element?.click();
    return Boolean(element);
  }, testId);
  expect(clicked).toBe(true);
}

async function expectChoiceButtonCentered(page: Page, testId: string) {
  const geometry = await page.evaluate((id) => {
    const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      deltaX: Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2),
      deltaY: Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2)
    };
  }, testId);
  expect(geometry).not.toBeNull();
  expect(geometry?.deltaX).toBeLessThanOrEqual(4);
  expect(geometry?.deltaY).toBeLessThanOrEqual(48);
}

async function advanceUntilChoices(page: Page, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if ((await page.getByTestId("vn-choice-overlay").count()) > 0) return;
    await advanceVn(page);
    await page.waitForTimeout(160);
  }
  await expect(page.getByTestId("vn-choice-overlay")).toBeVisible();
}

async function advanceUntilMovie(page: Page, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if ((await page.getByTestId("runtime-movie-overlay").count()) > 0) return;
    await advanceVn(page);
    await page.waitForTimeout(160);
  }
  await expect(page.getByTestId("runtime-movie-overlay")).toBeVisible();
}

async function advanceUntilInputPrompt(page: Page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await page.getByTestId("runtime-input-prompt").count()) > 0) return;
    await advanceVn(page);
    await page.waitForTimeout(120);
  }
  await expect(page.getByTestId("runtime-input-prompt")).toBeVisible();
}
