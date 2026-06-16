import { expect, test, type Page } from "@playwright/test";

test.setTimeout(60_000);

test("vertical slice connects Navi exploration, gameplay state, VN dialog, and branch outcomes", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/?scenario=vertical-slice");

  await expect(page.getByTestId("playfield")).toBeVisible();
  await expect(page.getByTestId("harness-scenario-id")).toHaveText("vertical-slice");
  await expect(page.getByTestId("vertical-slice-shell")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(2);
  await expect(page.getByTestId("vertical-slice-map")).toHaveText("map:academy-hall");
  await page.screenshot({ path: "test-results/vertical-slice-spawn.png", fullPage: true });

  await walkForwardUntilActive(page, "interactable:classroom-door");
  await expect(page.getByTestId("vertical-slice-can-confirm")).toHaveText("true");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("vertical-slice-map")).toHaveText("map:classroom");
  await expect(page.getByTestId("vertical-slice-last-outcome")).toHaveText("change-map:map:classroom");
  await page.getByTestId("vertical-slice-move-hall-door").click();
  await page.getByTestId("vertical-slice-confirm").click();
  await expect(page.getByTestId("vertical-slice-map")).toHaveText("map:academy-hall");

  await page.getByTestId("vertical-slice-move-empty").click();
  await expect(page.getByTestId("vertical-slice-active-interactable")).toHaveText("none");
  await expect(page.getByTestId("vertical-slice-can-confirm")).toHaveText("false");
  await expect(page.getByTestId("vertical-slice-blocked-reason")).toHaveText("no-target");
  await page.getByTestId("vertical-slice-confirm").click();
  await expect(page.getByTestId("vertical-slice-last-outcome")).toHaveText("none");

  await page.getByTestId("vertical-slice-move-notebook").click();
  await expect(page.getByTestId("vertical-slice-active-interactable")).toHaveText("interactable:notebook");
  await expect(page.getByTestId("vertical-slice-can-confirm")).toHaveText("true");
  await page.getByTestId("vertical-slice-confirm").click();
  await expect(page.getByTestId("vertical-slice-inventory")).toContainText("tool:notebook:1");

  await page.getByTestId("vertical-slice-move-keycard").click();
  await expect(page.getByTestId("vertical-slice-active-interactable")).toHaveText("interactable:keycard");
  await page.getByTestId("vertical-slice-confirm").click();
  await expect(page.getByTestId("vertical-slice-evidence")).toContainText("evidence:keycard");

  await page.getByTestId("vertical-slice-move-door").click();
  await expect(page.getByTestId("vertical-slice-active-interactable")).toHaveText("interactable:classroom-door");
  await page.getByTestId("vertical-slice-confirm").click();
  await expect(page.getByTestId("vertical-slice-map")).toHaveText("map:classroom");
  await expect(page.getByTestId("vertical-slice-last-outcome")).toHaveText("change-map:map:classroom");
  await page.screenshot({ path: "test-results/vertical-slice-map-change.png", fullPage: true });

  await page.getByTestId("vertical-slice-move-hall-door").click();
  await page.getByTestId("vertical-slice-confirm").click();
  await expect(page.getByTestId("vertical-slice-map")).toHaveText("map:academy-hall");

  await page.getByTestId("vertical-slice-move-witness").click();
  await expect(page.getByTestId("vertical-slice-active-interactable")).toHaveText("interactable:witness");
  await page.getByTestId("vertical-slice-confirm").click();
  await expect(page.getByTestId("vertical-slice-substate")).toHaveText("vn2d-overlay");
  await expect(page.getByTestId("vn-dialog-surface")).toBeVisible();
  await expect(page.getByTestId("pixi-layer")).toBeVisible();
  await expect(page.getByTestId("vn-dialog-text")).toContainText("first playable slice");
  await page.screenshot({ path: "test-results/vertical-slice-vn-choice.png", fullPage: true });

  await page.getByTestId("vn-dialog-advance").click();
  await expect(page.getByTestId("vn-dialog-choices")).toBeVisible();
  await page.getByTestId("vn-dialog-choice-0").click();
  await expect(page.getByTestId("vertical-slice-route")).toHaveText("return");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("stay here");
  await page.getByTestId("vn-dialog-advance").click();
  await expect(page.getByTestId("vertical-slice-substate")).toHaveText("walk");

  await page.getByTestId("vertical-slice-reset").click();
  await page.getByTestId("vertical-slice-move-witness").click();
  await page.getByTestId("vertical-slice-confirm").click();
  await page.getByTestId("vn-dialog-advance").click();
  await page.getByTestId("vn-dialog-choice-1").click();
  await expect(page.getByTestId("vertical-slice-route")).toHaveText("classroom");
  await expect(page.getByTestId("vertical-slice-evidence")).toContainText("evidence:keycard");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("keycard matters");
  await page.screenshot({ path: "test-results/vertical-slice-branch-b.png", fullPage: true });

  expect(consoleErrors).toEqual([]);
});

async function walkForwardUntilActive(page: Page, interactableId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(90);
    await page.keyboard.up("ArrowUp");
    if ((await page.getByTestId("vertical-slice-active-interactable").textContent()) === interactableId) return;
  }

  await expect(page.getByTestId("vertical-slice-active-interactable")).toHaveText(interactableId);
}
