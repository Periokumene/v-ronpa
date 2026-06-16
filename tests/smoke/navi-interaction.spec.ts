import { expect, test } from "@playwright/test";

test("navi interaction scenario focuses, confirms, and shows no-op boundaries", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/?scenario=navi-interaction");
  await expect(page.getByTestId("playfield")).toBeVisible();
  await expect(page.getByTestId("harness-scenario-id")).toHaveText("navi-interaction");
  await expect(page.getByTestId("navi-interaction-active-map")).toHaveText("map:academy-hall");
  await expect(page.getByTestId("navi-interaction-substate")).toHaveText("walk");
  await expect(page.getByTestId("navi-interaction-input-lock")).toHaveText("none");

  await page.getByTestId("navi-interaction-move-notebook").click();
  await page.getByTestId("navi-interaction-focus").click();
  await expect(page.getByTestId("navi-interaction-active-interactable")).toHaveText("interactable:notebook");
  await expect(page.getByTestId("navi-interaction-last-outcome")).toHaveText("focused:interactable:notebook");
  await page.screenshot({ path: "test-results/navi-interaction-focus.png", fullPage: true });

  await page.getByTestId("navi-interaction-confirm").click();
  await expect(page.getByTestId("navi-interaction-inventory")).toHaveText("tool:notebook:1");
  await expect(page.getByTestId("navi-interaction-last-outcome")).toHaveText("grant-item:tool:notebook:1");

  await page.getByTestId("navi-interaction-move-keycard").click();
  await page.getByTestId("navi-interaction-focus").click();
  await expect(page.getByTestId("navi-interaction-active-interactable")).toHaveText("interactable:keycard");
  await page.getByTestId("navi-interaction-confirm").click();
  await expect(page.getByTestId("navi-interaction-evidence")).toHaveText("evidence:keycard");
  await expect(page.getByTestId("navi-interaction-last-outcome")).toHaveText("grant-evidence:evidence:keycard");
  await page.screenshot({ path: "test-results/navi-interaction-grants.png", fullPage: true });

  await page.getByTestId("navi-interaction-move-empty").click();
  await page.getByTestId("navi-interaction-focus").click();
  await expect(page.getByTestId("navi-interaction-active-interactable")).toHaveText("none");
  await page.getByTestId("navi-interaction-confirm").click();
  await expect(page.getByTestId("navi-interaction-last-outcome")).toHaveText("none");
  await expect(page.getByTestId("navi-interaction-inventory")).toHaveText("tool:notebook:1");
  await expect(page.getByTestId("navi-interaction-evidence")).toHaveText("evidence:keycard");

  await page.getByTestId("navi-interaction-move-witness").click();
  await page.getByTestId("navi-interaction-focus").click();
  await page.getByTestId("navi-interaction-confirm").click();
  await expect(page.getByTestId("navi-interaction-substate")).toHaveText("vn2d-overlay");
  await expect(page.getByTestId("navi-interaction-input-lock")).toHaveText("dialog");
  await expect(page.getByTestId("navi-interaction-overlay-script")).toHaveText("harness/vertical-slice.nani");
  await expect(page.getByTestId("navi-interaction-last-outcome")).toHaveText("start-script:harness/vertical-slice.nani");
  await page.screenshot({ path: "test-results/navi-interaction-overlay.png", fullPage: true });

  await page.getByTestId("navi-interaction-close-overlay").click();
  await expect(page.getByTestId("navi-interaction-substate")).toHaveText("walk");
  await expect(page.getByTestId("navi-interaction-input-lock")).toHaveText("none");
  await page.getByTestId("navi-interaction-close-overlay").click();
  await expect(page.getByTestId("navi-interaction-substate")).toHaveText("walk");
  await expect(page.getByTestId("navi-interaction-input-lock")).toHaveText("none");

  await page.getByTestId("navi-interaction-move-classroom-door").click();
  await page.getByTestId("navi-interaction-focus").click();
  await expect(page.getByTestId("navi-interaction-active-interactable")).toHaveText("interactable:classroom-door");
  await page.getByTestId("navi-interaction-confirm").click();
  await expect(page.getByTestId("navi-interaction-active-map")).toHaveText("map:classroom");
  await expect(page.getByTestId("navi-interaction-pose")).toHaveText("0.0,1.7,3.2 yaw:3.14 pitch:0.00");
  await expect(page.getByTestId("navi-interaction-last-outcome")).toHaveText("change-map:map:classroom");
  await page.screenshot({ path: "test-results/navi-interaction-map.png", fullPage: true });

  expect(consoleErrors).toEqual([]);
});
