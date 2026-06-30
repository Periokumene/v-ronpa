import { expect, test } from "@playwright/test";

test("harness root boots the integrated showcase game", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByTestId("playfield")).toBeVisible();
  await expect(page.getByTestId("harness-scenario-id")).toHaveText("harness-showcase");
  await expect(page.getByTestId("title-surface")).toBeVisible();
  await expect(page.getByTestId("title-new-game")).toBeVisible();

  await page.screenshot({ path: "test-results/harness-root.png", fullPage: true });
  expect(consoleErrors).toEqual([]);
});
