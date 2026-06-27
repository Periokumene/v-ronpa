import { expect, test, type Page } from "@playwright/test";

test.setTimeout(60_000);

test("VN AUTO, SKIP, autoNext, and overlay stop behavior work end to end", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isExpectedPointerLockError(message.text())) consoleErrors.push(message.text());
  });

  await page.addInitScript(() => localStorage.removeItem("v-ronpa:settings:v1"));
  await page.goto("/?scenario=vertical-slice");
  await page.getByTestId("title-new-game").click();
  await startWitnessStory(page);

  await advanceUntilText(page, "请选择测试路径", 2);
  await advanceUntilChoices(page);
  await expect(page.getByTestId("vn-command-auto")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("vn-command-skip")).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("vn-dialog-choice-1").click();
  await expect(page.getByTestId("vn-dialog-text")).toContainText("分支 2 开始");

  await page.getByTestId("vn-command-settings").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await page.getByTestId("settings-automation-auto-speed").fill("100");
  await expect(page.getByTestId("settings-automation-auto-speed-value")).toHaveText("100%");
  await page.getByTestId("settings-overlay-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();

  await page.getByTestId("vn-command-auto").click();
  await expect(page.getByTestId("vn-command-auto")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT 01A", { timeout: 4_000 });

  await page.getByTestId("vn-dialog-advance").click();
  await expect(page.getByTestId("vn-command-auto")).toHaveAttribute("aria-pressed", "false");

  for (const overlay of [
    { command: "vn-command-backlog", panel: "backlog-overlay", close: "backlog-overlay-close" },
    { command: "vn-command-save", panel: "save-load-overlay", close: "save-load-overlay-close" },
    { command: "vn-command-load", panel: "save-load-overlay", close: "save-load-overlay-close" },
    { command: "vn-command-settings", panel: "settings-overlay", close: "settings-overlay-close" }
  ]) {
    await page.getByTestId("vn-command-auto").click();
    await expect(page.getByTestId("vn-command-auto")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId(overlay.command).click();
    await expect(page.getByTestId(overlay.panel)).toBeVisible();
    await expect(page.getByTestId("vn-command-auto")).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId(overlay.close).click();
    await expect(page.getByTestId(overlay.panel)).toBeHidden();
  }

  await page.getByTestId("vn-command-skip").click();
  await expect(page.getByTestId("vn-command-skip")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("vertical-slice-substate")).toHaveText("walk", { timeout: 15_000 });
  await expect(page.getByTestId("vertical-slice-pixi-tasks")).toHaveText("empty");

  expect(consoleErrors).toEqual([]);
});

test("VN wait! resumes from Pixi task completion and manual continue settles the task", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isExpectedPointerLockError(message.text())) consoleErrors.push(message.text());
  });

  await page.addInitScript(() => localStorage.removeItem("v-ronpa:settings:v1"));
  await page.goto("/?scenario=vertical-slice");
  await page.getByTestId("title-new-game").click();
  await startWitnessStory(page);

  await advanceUntilChoices(page);
  await page.getByTestId("vn-dialog-choice-1").click();
  await expect(page.getByTestId("vn-dialog-text")).toContainText("分支 2 开始");
  await advanceUntilText(page, "CHECKPOINT 04", 24);
  await expect(page.getByTestId("vertical-slice-pixi-tasks")).toHaveText("empty");

  await page.getByTestId("vn-dialog-advance").click();
  await expect(page.getByTestId("vertical-slice-pixi-tasks")).toContainText("actor-transition:Ema", { timeout: 1_000 });
  await page.getByTestId("vn-dialog-advance").click();

  await expect(page.getByTestId("vn-dialog-text")).toContainText(/CHECKPOINT 0[56]/, { timeout: 2_000 });
  await expect(page.getByTestId("vertical-slice-pixi-tasks")).toHaveText("empty");
  expect(consoleErrors).toEqual([]);
});

async function startWitnessStory(page: Page) {
  await page.getByTestId("vertical-slice-move-witness").click();
  await expect(page.getByTestId("vertical-slice-active-interactable")).toHaveText("interactable:witness");
  await page.getByTestId("vertical-slice-confirm").click();
  await expect(page.getByTestId("vertical-slice-substate")).toHaveText("vn2d-overlay");
  await expect(page.getByTestId("vn-dialog-surface")).toBeVisible();
  await expect(page.getByTestId("vn-command-bar")).toBeVisible();
}

async function advanceUntilText(page: Page, text: string, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if (((await page.getByTestId("vn-dialog-text").textContent()) ?? "").includes(text)) return;
    await page.getByTestId("vn-dialog-advance").click();
  }

  await expect(page.getByTestId("vn-dialog-text")).toContainText(text);
}

async function advanceUntilChoices(page: Page) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if ((await page.getByTestId("vn-dialog-choices").count()) > 0) return;
    await page.getByTestId("vn-dialog-advance").click();
  }

  await expect(page.getByTestId("vn-dialog-choices")).toBeVisible();
}

function isExpectedPointerLockError(text: string): boolean {
  return text.includes("PointerLockControls: Unable to use Pointer Lock API");
}
