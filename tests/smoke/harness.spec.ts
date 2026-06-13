import { expect, test } from "@playwright/test";

test("harness validates Navi and Trial mode boundaries", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");

  await expect(page.getByTestId("playfield")).toBeVisible();
  await expect(page.getByTestId("scenario-navi")).toHaveAttribute("data-state", "active");
  await expect(page.getByTestId("current-mode")).toHaveText(/navi/i);
  await expect(page.getByTestId("current-detail")).toHaveText(/walk/i);
  await expect(page.getByTestId("current-input-lock")).toHaveText("none");
  await expect(page.getByTestId("current-camera-mode")).toHaveText("first-person");
  await expect(page.locator("canvas")).toHaveCount(2);
  await page.screenshot({ path: "test-results/navi-walk.png", fullPage: true });

  await page.getByTestId("inspect-case-file").click();
  await expect(page.getByText(/Navi granted evidence:keycard/)).toBeVisible();

  await page.getByTestId("navi-vn2d").click();
  await expect(page.getByTestId("current-detail")).toHaveText(/vn2d-overlay/i);
  await expect(page.getByTestId("current-input-lock")).toHaveText("dialog");
  await expect(page.getByTestId("current-camera-mode")).toHaveText("locked");
  await expect(page.getByTestId("pixi-layer")).toBeVisible();
  await page.screenshot({ path: "test-results/navi-vn2d.png", fullPage: true });

  await page.getByTestId("advance-story").click();
  await expect(page.getByText("This room is a contract harness, not a final scene.")).toBeVisible();

  await page.getByTestId("open-inventory").click();
  await expect(page.getByTestId("current-input-lock")).toHaveText("inventory");
  await expect(page.getByTestId("inventory-panel")).toBeVisible();
  await expect(page.getByTestId("inventory-panel").getByText("evidence:keycard")).toBeVisible();
  await page.screenshot({ path: "test-results/navi-inventory.png", fullPage: true });

  await page.getByTestId("scenario-trial").click();
  await expect(page.getByTestId("scenario-trial")).toHaveAttribute("data-state", "active");
  await expect(page.getByTestId("current-mode")).toHaveText(/trial/i);

  await page.getByTestId("trial-vn3d").click();
  await expect(page.getByTestId("current-detail")).toHaveText(/vn3d/i);
  await expect(page.getByTestId("current-input-lock")).toHaveText("dialog");
  await expect(page.getByTestId("current-camera-mode")).toHaveText("scripted-focus");
  await page.screenshot({ path: "test-results/trial-vn3d.png", fullPage: true });

  await page.getByTestId("trial-debate3d").click();
  await expect(page.getByTestId("current-detail")).toHaveText(/debate3d/i);
  await expect(page.getByTestId("current-input-lock")).toHaveText("trial-targeting");
  await expect(page.getByTestId("current-camera-mode")).toHaveText("trial-targeting");
  await page.screenshot({ path: "test-results/trial-debate3d.png", fullPage: true });

  await page.getByTestId("break-keyword").click();
  await expect(page.getByText(/Trial outcome: correct/)).toBeVisible();
  await expect(page.getByTestId("current-input-lock")).toHaveText("dialog");
  await expect(page.getByTestId("current-camera-mode")).toHaveText("locked");
  await page.screenshot({ path: "test-results/trial-keyword-break.png", fullPage: true });

  await page.screenshot({ path: "test-results/harness-baseline.png", fullPage: true });
  expect(consoleErrors).toEqual([]);
});
