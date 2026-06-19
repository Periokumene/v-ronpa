import { expect, test } from "@playwright/test";

const scenarios = ["vertical-slice"];

test("fixed harness scenario routes boot without app edits from subsystem lines", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  for (const scenario of scenarios) {
    await page.goto(`/?scenario=${scenario}`);
    await expect(page.getByTestId("playfield")).toBeVisible();
    await expect(page.getByTestId("harness-scenario-id")).toHaveText(scenario);
  }

  await page.screenshot({ path: "test-results/harness-registry.png", fullPage: true });
  expect(consoleErrors).toEqual([]);
});
