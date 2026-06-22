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

  await expect(page.getByTestId("vn-dialog-text")).toContainText("视觉小说联调剧本的第一句");
  await expect(page.getByTestId("vn-command-auto")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("vn-command-skip")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("我会记录每一次状态变化", { timeout: 8_000 });

  await page.getByTestId("vn-command-settings").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await page.getByTestId("settings-automation-auto-speed").fill("100");
  await expect(page.getByTestId("settings-automation-auto-speed-value")).toHaveText("100%");
  await page.getByTestId("settings-overlay-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();

  await page.getByTestId("vn-command-auto").click();
  await expect(page.getByTestId("vn-command-auto")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("先别急着追问", { timeout: 1_500 });

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
  await expect(page.getByTestId("vn-dialog-choices")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId("vn-command-skip")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("vn-command-skip")).toBeDisabled();
  await expect(page.getByTestId("vn-command-auto")).toBeDisabled();

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

function isExpectedPointerLockError(text: string): boolean {
  return text.includes("PointerLockControls: Unable to use Pointer Lock API");
}
