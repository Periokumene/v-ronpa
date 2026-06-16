import { expect, test } from "@playwright/test";

test("pixi-vn scenario renders portraits fallback and local controls", async ({ page }) => {
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
    if (message.type() === "warning") consoleWarnings.push(message.text());
  });

  await page.goto("/?scenario=pixi-vn");

  await expect(page.getByTestId("playfield")).toBeVisible();
  await expect(page.getByTestId("harness-scenario-id")).toHaveText("pixi-vn");
  await expect(page.getByTestId("pixi-vn-shell")).toBeVisible();
  await expect(page.getByTestId("pixi-layer")).toBeVisible();
  await expect(page.getByTestId("pixi-canvas")).toBeVisible();
  await expect(page.getByTestId("harness-event-log")).toContainText("Commands: 6");
  await expect(page.getByTestId("harness-event-log")).toContainText("left=mira, center=fallback, right=felix");

  await expect
    .poll(() => consoleWarnings.some((warning) => warning.includes("Missing portrait asset")), { timeout: 5000 })
    .toBe(true);

  await page.getByTestId("pixi-vn-clear").click();
  await expect(page.getByTestId("harness-event-log")).toContainText("Commands: 0");
  await expect(page.getByTestId("harness-event-log")).toContainText("cleared scenario-local command state");

  await page.getByTestId("pixi-vn-replay").click();
  await expect(page.getByTestId("harness-event-log")).toContainText("Commands: 6");
  await expect(page.getByTestId("harness-event-log")).toContainText("replayed default command sequence");

  await page.getByTestId("pixi-vn-effects").click();
  await expect(page.getByTestId("harness-event-log")).toContainText("Commands: 8");
  await expect(page.getByTestId("harness-event-log")).toContainText("triggered flash and shake");
  await page.waitForTimeout(120);
  await page.screenshot({ path: "test-results/pixi-vn.png", fullPage: true });

  expect(consoleErrors).toEqual([]);
});
