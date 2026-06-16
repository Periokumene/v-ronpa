import { expect, test, type Page } from "@playwright/test";

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
  await expect(page.getByTestId("current-active-interactable")).toHaveText("none");
  await expect(page.getByTestId("current-can-confirm")).toHaveText("false");
  await expect(page.locator("canvas")).toHaveCount(2);
  await page.screenshot({ path: "test-results/navi-walk.png", fullPage: true });

  await blurActiveElement(page);
  await expectKeyNeverFocuses(page, "KeyW", "current-active-interactable");
  await walkWithKeyUntilActive(page, "ArrowUp", "current-active-interactable", "interactable:case-file");
  await expect(page.getByTestId("current-can-confirm")).toHaveText("true");
  await page.keyboard.press("KeyE");
  await expect(page.getByTestId("current-notice")).toHaveText("Navi walk: 3D exploration baseline");
  await page.keyboard.press("Space");
  await expect(page.getByText(/Navi granted evidence:keycard/)).toBeVisible();

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

async function expectKeyNeverFocuses(page: Page, key: string, activeTestId: string) {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    await movementPulse(page, key);
    await expect(page.getByTestId(activeTestId)).toHaveText("none");
  }
}

async function walkWithKeyUntilActive(page: Page, key: string, activeTestId: string, interactableId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await movementPulse(page, key);
    if ((await page.getByTestId(activeTestId).textContent()) === interactableId) return;
  }

  await expect(page.getByTestId(activeTestId)).toHaveText(interactableId);
}

async function movementPulse(page: Page, key: string) {
  await page.keyboard.down(key);
  await page.waitForTimeout(90);
  await page.keyboard.up(key);
  await page.waitForTimeout(25);
}

async function blurActiveElement(page: Page) {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
}
