import { expect, test, type Page } from "@playwright/test";

interface PoseReadout {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

test("r3f first-person scenario proves movement, focus, interact, clamp, and fallback", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pointerLockLimitations: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (message.text().includes("PointerLockControls: Unable to use Pointer Lock API")) {
      pointerLockLimitations.push(message.text());
      return;
    }
    consoleErrors.push(message.text());
  });

  await page.goto("/?scenario=r3f-first-person");

  await expect(page.getByTestId("playfield")).toBeVisible();
  await expect(page.getByTestId("harness-scenario-id")).toHaveText("r3f-first-person");
  await expect(page.getByTestId("r3f-first-person-shell")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByTestId("r3f-current-map")).toHaveText("map:academy-hall");
  await expect(page.getByTestId("r3f-pose-readout")).not.toHaveText("pending");

  const initialPose = await readPose(page);

  await page.getByTestId("r3f-activate-look").click();
  await expect(page.getByTestId("r3f-pointer-lock-status")).toHaveText(/requested|locked|unlocked|denied/);

  await holdKey(page, "w", 350);
  const movedPose = await readPose(page);
  expect(movedPose.z).toBeLessThan(initialPose.z - 0.2);

  await page.getByTestId("r3f-reset-spawn").click();
  await expect.poll(() => readPose(page).then((pose) => pose.z)).toBeCloseTo(4, 1);

  await holdKey(page, "w", 1700);
  await expect(page.getByTestId("r3f-focused-interactable")).toHaveText("interactable:classroom-door");

  await page.getByTestId("r3f-trigger-interact").click();
  await expect(page.getByTestId("r3f-current-map")).toHaveText("map:classroom");
  await expect(page.getByTestId("r3f-last-action")).toHaveText("interactable:classroom-door:change-map");

  await page.getByTestId("r3f-reset-spawn").click();
  await expect.poll(() => readPose(page).then((pose) => pose.z)).toBeCloseTo(3.2, 1);
  await expect(page.getByTestId("r3f-fallback-status")).toContainText(/active|loaded/);
  await page.screenshot({ path: "test-results/r3f-first-person.png", fullPage: true });

  await holdKey(page, "w", 2500);
  const clampedPose = await readPose(page);
  expect(clampedPose.z).toBeGreaterThanOrEqual(-3.4);
  expect(clampedPose.z).toBeLessThanOrEqual(3.6);

  await page.getByTestId("r3f-show-fallback").click();
  await expect(page.getByTestId("r3f-current-map")).toHaveText("map:r3f-missing-model");
  await expect(page.getByTestId("r3f-fallback-status")).toContainText("active");
  await expect(page.getByTestId("r3f-fallback-status")).toContainText("map:r3f-missing-model");
  await page.screenshot({ path: "test-results/r3f-first-person-fallback.png", fullPage: true });

  expect(consoleErrors).toEqual([]);
  expect(pointerLockLimitations.length).toBeLessThanOrEqual(1);
});

async function holdKey(page: Page, key: string, durationMs: number) {
  await page.keyboard.down(key);
  try {
    await page.waitForTimeout(durationMs);
  } finally {
    await page.keyboard.up(key);
  }
}

async function readPose(page: Page): Promise<PoseReadout> {
  return JSON.parse((await page.getByTestId("r3f-pose-readout").innerText()) || "{}") as PoseReadout;
}
