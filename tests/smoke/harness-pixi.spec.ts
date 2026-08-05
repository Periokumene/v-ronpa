import { expect, test } from "@playwright/test";
import {
  advanceUntilChoices,
  advanceUntilText,
  advanceUntilTextOrOverlayClosed,
  bootHarness,
  changedByteCount,
  configureTitleDisplay,
  expectNoRuntimeAssetDiagnostics,
  startNavi,
  startStoryOverlay,
  watchUnexpectedConsoleErrors
} from "./harness-showcase.helpers";

test.setTimeout(240_000);

test("harness Pixi command and layered-character visual flow", async ({ page }) => {
  const consoleErrors = watchUnexpectedConsoleErrors(page);
  await bootHarness(page);
  await configureTitleDisplay(page, { textSpeed: "1" });
  await startNavi(page);
  await startStoryOverlay(page);
  await advanceUntilChoices(page);
  await page.getByTestId("vn-choice-1").click();
  await expect(page.getByTestId("harness-showcase-route")).toHaveText("classroom");
  await expect(page.getByTestId("harness-showcase-evidence")).toContainText("evidence:keycard");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("分支 2 开始");

  await advanceUntilText(page, "CHECKPOINT 01A-L1");
  await advanceUntilText(page, "CHECKPOINT 01A-L2");
  await advanceUntilText(page, "CHECKPOINT 01A-L3");
  await expect(page.getByTestId("harness-showcase-pixi-weather")).toContainText("rain@1");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-pixi-rain-full-right-magenta.png", fullPage: true });
  const rainMotionBefore = await page.getByTestId("pixi-layer").screenshot();
  await page.waitForTimeout(350);
  const rainMotionAfter = await page.getByTestId("pixi-layer").screenshot();
  expect(rainMotionBefore.length).toBeGreaterThan(0);
  expect(changedByteCount(rainMotionBefore, rainMotionAfter)).toBeGreaterThan(100);
  await advanceUntilText(page, "CHECKPOINT 01A-OFF");
  await expect(page.getByTestId("harness-showcase-pixi-weather")).toHaveText("empty");
  await expect(page.getByTestId("harness-showcase-pixi-tasks")).toHaveText("empty");

  await advanceUntilText(page, "CHECKPOINT 01B-L1");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/Pensive1,ArmR3@0.50,0.00");
  await advanceUntilText(page, "CHECKPOINT 01B-L2");
  await advanceUntilText(page, "CHECKPOINT 01B-L3");
  await advanceUntilText(page, "CHECKPOINT 01B-L4");
  await expect(page.getByTestId("harness-showcase-pixi-weather")).toContainText("snow@1");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-pixi-snow-storm.png", fullPage: true });
  const snowMotionBefore = await page.getByTestId("pixi-layer").screenshot();
  await page.waitForTimeout(350);
  const snowMotionAfter = await page.getByTestId("pixi-layer").screenshot();
  expect(changedByteCount(snowMotionBefore, snowMotionAfter)).toBeGreaterThan(100);

  await advanceUntilText(page, "CHECKPOINT 01C");
  await expect(page.getByTestId("harness-showcase-pixi-weather")).toContainText("sun@0.3");
  await expect(page.getByTestId("harness-showcase-pixi-actor-effects")).toContainText("MainBackground:blur@0.12");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-inner-background", "bg/inner/academy-hall");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-pixi-sun-blur.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 01D");
  await expect(page.getByTestId("harness-showcase-pixi-weather")).toHaveText("empty");
  await expect(page.getByTestId("harness-showcase-pixi-actor-effects")).toHaveText("empty");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-inner-background", "bg/inner/snow-outskirts");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-pixi-inback-real-image.png", fullPage: true });

  await advanceUntilText(page, "CHECKPOINT 02A");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/default@0.50,0.00");
  await advanceUntilText(page, "CHECKPOINT 02B");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/Pensive1@0.50,0.00");
  await advanceUntilText(page, "CHECKPOINT 02C");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/Pensive1,ArmR3@0.50,0.00");
  await expectNoRuntimeAssetDiagnostics(page);
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/harness-pixi-character-arm-outline.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 02D");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/Pensive1,ArmR3,ArmR4@0.50,0.00");
  await advanceUntilText(page, "CHECKPOINT 02E");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText(
    "Ema/Pensive1,ArmR4,Angle01/Head01/Facial01/Mouth01>Mouth01_Smile_Open@0.50,0.00"
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/harness-pixi-character-mouth-override.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 02F");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText(
    "Ema/Pensive1,ArmR4,Angle01/Head01/Facial01/Sweat01+Sweat01_01@0.50,0.00"
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/harness-pixi-character-sweat-add.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 02G");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText(
    "Ema/Pensive1,ArmR4,Angle01/Head01/Facial01/Sweat01+Sweat01_01,Angle01/Head01/Facial01/Sweat01-@0.50,0.00"
  );
  await advanceUntilText(page, "CHECKPOINT 02H");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/Pensive1,ArmR3@0.50,0.00");

  await advanceUntilText(page, "CHECKPOINT 07");
  await expect(page.getByTestId("harness-showcase-pixi-screen-filters")).toContainText("bokeh@0.55");

  await advanceUntilText(page, "CHECKPOINT 07B-L1");
  await advanceUntilText(page, "CHECKPOINT 07B-L2");
  await advanceUntilText(page, "CHECKPOINT 07B-L3");
  await advanceUntilText(page, "CHECKPOINT 07B-L4");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-pixi-glitch-stress.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 08");
  await advanceUntilText(page, "CHECKPOINT 08A");
  await expect(page.getByTestId("harness-showcase-pixi-screen-filters")).toContainText("glitch@0.54");
  await expect(page.getByTestId("harness-showcase-pixi-tasks")).toHaveText("empty");
  await advanceUntilText(page, "CHECKPOINT 08B");
  const persistentGlitchBefore = await page.getByTestId("pixi-layer").screenshot();
  await page.waitForTimeout(1000);
  const persistentGlitchAfter = await page.getByTestId("pixi-layer").screenshot();
  expect(changedByteCount(persistentGlitchBefore, persistentGlitchAfter)).toBeGreaterThan(100);
  await page.screenshot({ path: "test-results/harness-pixi-glitch-persistent-later.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 08C");
  await expect(page.getByTestId("harness-showcase-pixi-screen-filters")).toContainText("glitch@0.54");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-pixi-glitch-persistent-plus-pulse.png", fullPage: true });
  await advanceUntilText(page, "CHECKPOINT 08D");
  await expect(page.getByTestId("harness-showcase-pixi-screen-filters")).toHaveText("empty");
  await expect(page.getByTestId("harness-showcase-pixi-tasks")).toHaveText("empty");
  await advanceUntilText(page, "CHECKPOINT 09");
  await expect(page.getByTestId("harness-showcase-pixi-weather")).toContainText("rain@0.85");
  await expect(page.getByTestId("harness-showcase-pixi-weather")).toContainText("snow@0.85");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-pixi-rain-snow-coexist.png", fullPage: true });
  await advanceUntilTextOrOverlayClosed(page, "CHECKPOINT 11");
  await expect(page.getByTestId("harness-showcase-pixi-weather")).toHaveText("empty");
  await expect(page.getByTestId("harness-showcase-pixi-screen-filters")).toHaveText("empty");
  await expect(page.getByTestId("harness-showcase-pixi-actor-effects")).toHaveText("empty");
  await expect(page.getByTestId("harness-showcase-pixi-tasks")).toHaveText("empty");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/harness-pixi-final-cleanup.png", fullPage: true });
  await expectNoRuntimeAssetDiagnostics(page);

  expect(consoleErrors).toEqual([]);
});
