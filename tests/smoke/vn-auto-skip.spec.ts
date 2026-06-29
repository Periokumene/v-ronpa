import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

test("VN AUTO, SKIP, autoNext, and overlay stop behavior work end to end", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isExpectedPointerLockError(message.text())) consoleErrors.push(message.text());
  });

  await page.addInitScript(() => localStorage.removeItem("v-ronpa:settings:v1"));
  await page.goto("/?scenario=vertical-slice");
  await page.getByTestId("title-new-game").click();
  await startWitnessStory(page);

  await expectManualAdvanceCompletesRevealBeforeStoryStep(page);
  await advanceUntilText(page, "请选择测试路径", 3);
  await advanceUntilChoices(page);
  await expect(page.getByTestId("vn-command-auto")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("vn-command-skip")).toHaveAttribute("aria-pressed", "false");
  await chooseAutomationSmokeBranch(page);

  await page.getByTestId("vn-command-settings").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await page.getByTestId("settings-automation-auto-speed").fill("100");
  await expect(page.getByTestId("settings-automation-auto-speed-value")).toHaveText("100%");
  await page.getByTestId("settings-overlay-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();

  await page.getByTestId("vn-command-auto").click();
  await expect(page.getByTestId("vn-command-auto")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT AUTO 01", { timeout: 10_000 });

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
  await expect(page.getByTestId("vertical-slice-substate")).toHaveText("walk", { timeout: 30_000 });
  await expect(page.getByTestId("vertical-slice-pixi-tasks")).toHaveText("empty");

  expect(consoleErrors).toEqual([]);
});

test("VN opening autoNext completes reveal without manual input", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isExpectedPointerLockError(message.text())) consoleErrors.push(message.text());
  });

  await page.addInitScript(() => localStorage.removeItem("v-ronpa:settings:v1"));
  await page.goto("/?scenario=vertical-slice");
  await page.getByTestId("title-new-game").click();
  await startWitnessStory(page);

  const observed = await observeOpeningAutoNext(page);
  expect(observed.sawCompletedFirstLine).toBe(true);
  expect(observed.sawSecondLine).toBe(true);
  await expect(page.getByTestId("vertical-slice-last-action")).toHaveText("story:auto-next");
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
  await chooseAutomationSmokeBranch(page);
  await advanceUntilText(page, "CHECKPOINT AUTO 03", 16);
  await expect(page.getByTestId("vertical-slice-pixi-tasks")).toHaveText("empty");

  await page.getByTestId("vn-dialog-advance").click();
  await expect(page.getByTestId("vertical-slice-pixi-tasks")).toContainText("actor-transition:Ema", { timeout: 1_000 });
  await page.getByTestId("vn-dialog-advance").click();

  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT AUTO 04", { timeout: 2_000 });
  await expect(page.getByTestId("vertical-slice-pixi-tasks")).toHaveText("empty");
  expect(consoleErrors).toEqual([]);
});

test("VN AUTO voice gate advances branch 3 without returning to the baseline checkpoint", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isExpectedPointerLockError(message.text())) consoleErrors.push(message.text());
  });

  await page.addInitScript(() => localStorage.removeItem("v-ronpa:settings:v1"));
  await page.goto("/?scenario=vertical-slice&voiceSmoke=fast");
  await page.getByTestId("title-new-game").click();
  await startWitnessStory(page);
  await advanceUntilChoices(page);

  await page.getByTestId("vn-command-settings").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await page.getByTestId("settings-automation-auto-speed").fill("100");
  await expect(page.getByTestId("settings-automation-auto-speed-value")).toHaveText("100%");
  await page.getByTestId("settings-overlay-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();

  await page.getByTestId("vn-dialog-choice-2").click();
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT VOICE REAL 00");
  await advanceUntilText(page, "夜里的牢房", 4);
  await advanceUntilText(page, "如果把证据广播出去", 4);

  await page.getByTestId("vn-command-auto").click();
  await expect(page.getByTestId("vn-command-auto")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("也会知道信号从这里发出", { timeout: 6_000 });
  await expect(page.getByTestId("vn-dialog-text")).not.toContainText("CHECKPOINT 00 - baseline");

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

async function chooseAutomationSmokeBranch(page: Page) {
  await page.getByTestId("vn-dialog-choice-3").click();
  await expect(page.getByTestId("vertical-slice-route")).toHaveText("automation-smoke");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT AUTO 00");
}

async function advanceUntilText(page: Page, text: string, maxSteps: number) {
  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if (((await page.getByTestId("vn-dialog-text").textContent()) ?? "").includes(text)) {
      await waitForDialogTextToSettle(page);
      return;
    }
    await page.getByTestId("vn-dialog-advance").click();
    await page.waitForTimeout(120);
  }

  await expect(page.getByTestId("vn-dialog-text")).toContainText(text);
  await waitForDialogTextToSettle(page);
}

async function advanceUntilChoices(page: Page) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if ((await page.getByTestId("vn-dialog-choices").count()) > 0) return;
    await page.getByTestId("vn-dialog-advance").click();
    await page.waitForTimeout(120);
  }

  await expect(page.getByTestId("vn-dialog-choices")).toBeVisible();
}

async function expectManualAdvanceCompletesRevealBeforeStoryStep(page: Page) {
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT 00", { timeout: 2_000 });
  await page.getByTestId("vn-dialog-advance").click();
  await expect(page.getByTestId("vn-dialog-text")).toContainText("请先确认背景");
  await expect(page.getByTestId("vn-dialog-text")).not.toContainText("请选择测试路径");
}

async function observeOpeningAutoNext(page: Page) {
  const deadline = Date.now() + 10_000;
  let sawCompletedFirstLine = false;
  let sawSecondLine = false;

  while (Date.now() < deadline) {
    const text = (await page.getByTestId("vn-dialog-text").textContent()) ?? "";
    if (text.includes("layered character 可见。")) sawCompletedFirstLine = true;
    if (text.includes("请选择测试路径")) {
      sawSecondLine = true;
      break;
    }
    await page.waitForTimeout(100);
  }

  return { sawCompletedFirstLine, sawSecondLine };
}

async function waitForDialogTextToSettle(page: Page) {
  let previous = (await page.getByTestId("vn-dialog-text").textContent()) ?? "";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.waitForTimeout(120);
    const current = (await page.getByTestId("vn-dialog-text").textContent()) ?? "";
    if (current === previous) return;
    previous = current;
  }
}

function isExpectedPointerLockError(text: string): boolean {
  return text.includes("PointerLockControls: Unable to use Pointer Lock API");
}
