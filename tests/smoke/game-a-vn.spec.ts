import { expect, test, type Page } from "@playwright/test";

test.setTimeout(240_000);

test("game-a boots the VN-first framework path", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.addInitScript(() => {
    localStorage.removeItem("v-ronpa:game-a:settings:v1");
    localStorage.removeItem("v-ronpa:game-a:saves:v1");
    localStorage.removeItem("v-ronpa:game-a:saves:v2");
  });
  await page.goto("/");

  await expect(page.getByTestId("game-a-playfield")).toBeVisible();
  await expect(page.getByTestId("game-a-app-id")).toHaveText("game-a");
  await expect(page.getByTestId("title-surface")).toBeVisible();
  await expect(page.getByTestId("title-surface")).toHaveClass(/game-a-title-surface/);
  await page.screenshot({ path: "test-results/game-a-title.png", fullPage: true });

  await clickByTestId(page, "title-settings");
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await clickByTestId(page, "settings-subtab-display");
  await expect(page.getByTestId("settings-page")).toHaveAttribute("data-settings-tab", "display");
  await clickByTestId(page, "settings-display-text-size-next");
  await expect(page.getByTestId("settings-page")).toHaveAttribute("data-settings-tab", "display");
  await clickByTestId(page, "settings-display-text-speed-next");
  await expect(page.getByTestId("settings-page")).toHaveAttribute("data-settings-tab", "display");
  await clickByTestId(page, "settings-overlay-close");

  await clickByTestId(page, "title-new-game");
  await expect(page.getByTestId("game-a-mode")).toHaveText("视觉小说");
  await expect(page.getByTestId("vn-choice-overlay")).toBeVisible();
  await expect(page.getByTestId("vn-choice-0")).toHaveClass(/game-a-choice-button/);
  await expect(page.getByTestId("vn-choice-0")).toHaveText("吃下我！");
  await expectChoiceButtonCentered(page, "vn-choice-0");
  await page.screenshot({ path: "test-results/game-a-choice-centered.png", fullPage: true });
  await clickByTestId(page, "vn-choice-0");

  await advanceUntilChoiceText(page, "喂！", 24);
  await clickByTestId(page, "vn-choice-0");
  await advanceUntilChoiceText(page, "为什么？", 18);
  await clickByTestId(page, "vn-choice-0");

  await advanceUntilText(page, "Game A VN framework smoke", 24);
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-frame", "resolved");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveClass(/game-a-dialog-surface/);
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-ui-phase", "shown");
  await expect(page.getByTestId("pixi-layer")).toBeVisible();
  await page.screenshot({ path: "test-results/game-a-vn-dialog.png", fullPage: true });

  await advanceUntilText(page, "第一层验证", 4);
  await advanceUntilChoices(page, 4);
  await expect(page.getByTestId("vn-choice-overlay")).toBeVisible();
  await expect(page.getByTestId("vn-choice-0")).toHaveClass(/game-a-choice-button/);
  await page.screenshot({ path: "test-results/game-a-vn-choice.png", fullPage: true });
  await clickByTestId(page, "vn-choice-0");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("记录了房间里的异常光线");

  await advanceUntilText(page, "CHECKPOINT GAME-A UI FADE", 8);
  await expect(page.getByTestId("vn-command-bar")).toBeVisible();
  await expect(page.getByTestId("vn-command-bar")).toHaveClass(/game-a-command-bar/);
  await expect(page.getByTestId("vn-command-bar")).toHaveAttribute("data-ui-phase", "shown");
  await expect.poll(() => surfaceOpacity(page, ".game-a-dialog-surface")).toBe("1");
  await expect.poll(() => surfaceOpacity(page, ".game-a-command-bar")).toBe("1");

  await clickByTestId(page, "vn-command-backlog");
  await expect(page.getByTestId("backlog-overlay")).toBeVisible();
  await clickByTestId(page, "backlog-overlay-close");
  await clickByTestId(page, "vn-command-settings");
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await clickByTestId(page, "settings-overlay-close");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("backlog-overlay")).toBeVisible();
  await expect(page.getByTestId("backlog-overlay")).toHaveAttribute("data-active-tab", "log");
  await clickByTestId(page, "backlog-overlay-close");

  await expect(page.getByTestId("vn-command-auto")).toBeEnabled();
  await expect(page.getByTestId("vn-command-skip")).toBeEnabled();

  await advanceUntilText(page, "CHECKPOINT GAME-A WAIT", 6);
  await advanceUntilMovie(page, 4);
  await expect(page.getByTestId("runtime-movie-overlay")).toBeVisible();
  await page.screenshot({ path: "test-results/game-a-movie.png", fullPage: true });
  await clickByTestId(page, "runtime-movie-skip");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT GAME-A MOVIE");

  await clickByTestId(page, "vn-command-save");
  await expect(page.getByTestId("save-load-overlay")).toHaveAttribute("data-active-tab", "save");
  await clickByTestId(page, "save-slot-1");
  await clickByTestId(page, "save-load-overlay-close");
  await clickByTestId(page, "vn-command-load");
  await expect(page.getByTestId("save-load-overlay")).toHaveAttribute("data-active-tab", "load");
  await clickByTestId(page, "save-slot-1");
  await clickByTestId(page, "load-confirm");
  await expect(page.getByTestId("save-load-overlay")).toBeHidden();
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT GAME-A MOVIE");
  await page.screenshot({ path: "test-results/game-a-save-load.png", fullPage: true });

  expect(consoleErrors).toEqual([]);
});

async function advanceUntilText(page: Page, text: string, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    const dialogText = page.getByTestId("vn-dialog-text");
    const currentText = (await dialogText.textContent({ timeout: 250 }).catch(() => null)) ?? "";
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
  expect(geometry?.deltaY).toBeLessThanOrEqual(4);
}

async function advanceUntilChoices(page: Page, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if ((await page.getByTestId("vn-choice-overlay").count()) > 0) return;
    await advanceVn(page);
    await page.waitForTimeout(160);
  }

  await expect(page.getByTestId("vn-choice-overlay")).toBeVisible();
}

async function advanceUntilChoiceText(page: Page, text: string, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if ((await page.getByTestId("vn-choice-overlay").count()) > 0) {
      const currentText = ((await page.getByTestId("vn-choice-0").textContent()) ?? "").trim();
      if (currentText === text) return;
      await page.waitForTimeout(160);
      continue;
    }
    await advanceVn(page);
    await page.waitForTimeout(160);
  }

  await expect(page.getByTestId("vn-choice-0")).toHaveText(text);
}

async function advanceUntilMovie(page: Page, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if ((await page.getByTestId("runtime-movie-overlay").count()) > 0) return;
    await advanceVn(page);
    await page.waitForTimeout(160);
  }

  await expect(page.getByTestId("runtime-movie-overlay")).toBeVisible();
}

async function surfaceOpacity(page: Page, selector: string) {
  return page.evaluate((surfaceSelector) => {
    const element = document.querySelector<HTMLElement>(surfaceSelector);
    return element ? getComputedStyle(element).opacity : "missing";
  }, selector);
}
