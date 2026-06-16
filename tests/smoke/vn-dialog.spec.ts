import { expect, test, type Page } from "@playwright/test";

function collectConsoleErrors(page: Page) {
  const consoleErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  return consoleErrors;
}

test("VN dialog advances from line to choices and then ended state", async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);

  await page.goto("/?scenario=vn-dialog");

  const shell = page.getByTestId("vn-dialog-shell");
  const dialog = page.getByTestId("vn-dialog-surface");
  const eventLog = page.getByTestId("harness-event-log");

  await expect(shell).toHaveAttribute("data-state", "line");
  await expect(dialog).toHaveAttribute("data-state", "line");
  await expect(page.getByTestId("vn-dialog-speaker")).toHaveText("Felix");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("hallway camera");
  await expect(page.getByTestId("vn-dialog-choices")).toHaveCount(0);
  await page.screenshot({ path: "test-results/vn-dialog.png", fullPage: true });

  await dialog.focus();
  await page.keyboard.press("Enter");

  await expect(shell).toHaveAttribute("data-state", "choices");
  await expect(dialog).toHaveAttribute("data-state", "choices");
  await expect(page.getByTestId("vn-dialog-choices")).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to the hallway" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Follow the witness" })).toBeVisible();
  await expect(eventLog).toContainText("advance: line->choices");
  await page.screenshot({ path: "test-results/vn-dialog-choices.png", fullPage: true });

  await page.getByTestId("vn-dialog-choice-0").click();

  await expect(shell).toHaveAttribute("data-state", "ended");
  await expect(dialog).toHaveAttribute("data-state", "ended");
  await expect(page.getByTestId("vn-dialog-ended")).toContainText("Advance is blocked");
  await expect(page.getByTestId("vn-dialog-advance")).toBeDisabled();
  await expect(eventLog).toContainText("choice: 0:Return to the hallway");
  await expect(eventLog).toContainText("ended: final-line-visible");
  await page.screenshot({ path: "test-results/vn-dialog-ended.png", fullPage: true });

  expect(consoleErrors).toEqual([]);
});

test("VN dialog keyboard confirm selects the first choice and ended Enter is blocked", async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);

  await page.goto("/?scenario=vn-dialog");

  const shell = page.getByTestId("vn-dialog-shell");
  const dialog = page.getByTestId("vn-dialog-surface");
  const eventLog = page.getByTestId("harness-event-log");

  await dialog.focus();
  await page.keyboard.press("Enter");
  await expect(shell).toHaveAttribute("data-state", "choices");

  await dialog.focus();
  await page.keyboard.press("Enter");
  await expect(shell).toHaveAttribute("data-state", "ended");
  await expect(eventLog).toContainText("choice: 0:Return to the hallway");

  const endedText = await page.getByTestId("vn-dialog-text").innerText();
  await dialog.focus();
  await page.keyboard.press("Enter");

  await expect(shell).toHaveAttribute("data-state", "ended");
  await expect(page.getByTestId("vn-dialog-text")).toHaveText(endedText);
  await expect(eventLog).toContainText("advance-blocked:ended: ended");

  expect(consoleErrors).toEqual([]);
});

test("VN dialog initial state hides choices and Escape records cancel", async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);

  await page.goto("/?scenario=vn-dialog");

  const shell = page.getByTestId("vn-dialog-shell");
  const dialog = page.getByTestId("vn-dialog-surface");
  const eventLog = page.getByTestId("harness-event-log");

  await expect(shell).toHaveAttribute("data-state", "line");
  await expect(page.getByTestId("vn-dialog-choices")).toHaveCount(0);

  await dialog.focus();
  await page.keyboard.press("Escape");

  await expect(shell).toHaveAttribute("data-state", "line");
  await expect(eventLog).toContainText("cancel: line");

  expect(consoleErrors).toEqual([]);
});
