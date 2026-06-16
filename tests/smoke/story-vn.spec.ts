import { expect, test } from "@playwright/test";

test("story-vn harness proves advance, choice branch, gameplay effect, and ended evidence", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/?scenario=story-vn");

  await expect(page.getByTestId("playfield")).toBeVisible();
  await expect(page.getByTestId("harness-scenario-id")).toHaveText("story-vn");
  await expect(page.getByTestId("story-vn-text")).toHaveText("Advance to the first readable stop.");

  await page.getByTestId("story-vn-advance").click();
  await expect(page.getByTestId("story-vn-speaker")).toHaveText("Felix");
  await expect(page.getByTestId("story-vn-text")).toHaveText(
    "This is the first playable slice. Move, inspect, then choose a route."
  );
  await expect(page.getByTestId("story-vn-pending-choices")).toHaveText("none");

  await page.getByTestId("story-vn-advance").click();
  await expect(page.getByTestId("story-vn-pending-choices")).toContainText("Return to the hallway");
  await expect(page.getByTestId("story-vn-pending-choices")).toContainText("Follow the witness into class");

  await page.getByTestId("story-vn-choice-b").click();
  await expect(page.getByTestId("story-vn-pending-choices")).toHaveText("none");

  await page.getByTestId("story-vn-advance").click();
  await expect(page.getByTestId("story-vn-variables")).toHaveText("route: classroom");
  await expect(page.getByTestId("story-vn-latest-gameplay-effect")).toHaveText(
    "grant-evidence evidence:keycard"
  );
  await expect(page.getByTestId("story-vn-speaker")).toHaveText("Mira");
  await expect(page.getByTestId("story-vn-text")).toHaveText("Then the keycard matters after all.");

  await page.getByTestId("story-vn-advance").click();
  await expect(page.getByTestId("story-vn-ended")).toHaveText("true");
  await expect(page.getByTestId("story-vn-diagnostics")).toHaveText("none");

  await page.screenshot({ path: "test-results/story-vn.png", fullPage: true });
  expect(consoleErrors).toEqual([]);
});
