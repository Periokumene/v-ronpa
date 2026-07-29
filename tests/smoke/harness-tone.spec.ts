import { expect, test, type Page } from "@playwright/test";
import {
  advanceUntilChoices,
  advanceUntilText,
  bootHarness,
  configureTitleDisplay,
  expectNoRuntimeAssetDiagnostics,
  startNavi,
  startStoryOverlay,
  watchUnexpectedConsoleErrors
} from "./harness-showcase.helpers";

test.setTimeout(180_000);

test("global character tone presets, cleanup, and save restore stay on the canonical VN path", async ({ page }) => {
  const consoleErrors = watchUnexpectedConsoleErrors(page);
  await bootHarness(page);
  await configureTitleDisplay(page, { textSpeed: "1" });
  await startNavi(page);
  await startStoryOverlay(page);
  await advanceUntilChoices(page);
  await expect(page.getByTestId("vn-choice-4")).toHaveText("分支5：全局角色 Tone 验收");
  await page.getByTestId("vn-choice-4").click();

  await advanceUntilText(page, "CHECKPOINT TONE 00");
  await expectTone(page, "rain@0.5");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("[hidden]");
  await page.waitForTimeout(200);
  const hiddenCharacterFrame = await capturePixiLayer(page);

  await advanceUntilText(page, "CHECKPOINT TONE 01");
  await expectTone(page, "rain@0.5");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText(
    "Ema/default@0.50,0.00[visible]"
  );
  await page.waitForTimeout(200);
  const visibleCharacterFrame = await capturePixiLayer(page);
  await expectMeaningfulCanvasDifference(page, hiddenCharacterFrame, visibleCharacterFrame);
  await page.screenshot({ path: "test-results/harness-tone-rain-050.png", fullPage: true });

  await advanceUntilText(page, "CHECKPOINT TONE 02");
  await expectTone(page, "fog@1");
  await page.screenshot({ path: "test-results/harness-tone-fog-100.png", fullPage: true });

  await advanceUntilText(page, "CHECKPOINT TONE 03");
  await expectTone(page, "sunset@2");
  await page.screenshot({ path: "test-results/harness-tone-sunset-200.png", fullPage: true });

  await advanceUntilText(page, "CHECKPOINT TONE 04");
  await expectTone(page, "night@1");
  await advanceUntilText(page, "CHECKPOINT TONE 05");
  await expectTone(page, "alert@1.25");
  await page.screenshot({ path: "test-results/harness-tone-alert-125.png", fullPage: true });

  await advanceUntilText(page, "CHECKPOINT TONE 06");
  await expectTone(page, "fluorescent@3");
  await page.screenshot({ path: "test-results/harness-tone-fluorescent-overdrive-300.png", fullPage: true });

  await advanceUntilText(page, "CHECKPOINT TONE 07");
  await expectTone(page, "fluorescent@0.5");
  await advanceUntilText(page, "CHECKPOINT TONE SAVE");
  await expectTone(page, "rain@1");
  await page.getByTestId("vn-command-quick-save").click();
  await expect(page.getByTestId("vn-command-quick-load")).toBeEnabled();

  await advanceUntilText(page, "CHECKPOINT TONE 08");
  await expectTone(page, "sunset@1.5");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText(
    "Ema/Pensive1,ArmR3@0.50,0.00[visible]"
  );
  await page.screenshot({ path: "test-results/harness-tone-expression-crossfade-settled.png", fullPage: true });

  await page.getByTestId("vn-command-quick-load").click();
  await expect(page.getByTestId("load-confirmation")).toHaveCount(0);
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT TONE SAVE");
  await expectTone(page, "rain@1");
  await expect(page.getByTestId("harness-showcase-pixi-tasks")).toHaveText("empty");

  await advanceUntilText(page, "CHECKPOINT TONE 08");
  await advanceUntilText(page, "CHECKPOINT TONE 09");
  await expectTone(page, "none");
  await advanceUntilText(page, "CHECKPOINT TONE 10");
  await expectTone(page, "none");
  await expect(page.getByTestId("harness-showcase-pixi-background")).toHaveText("bg:harness");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("[visible]");
  await expect(page.getByTestId("vn-dialog-surface")).toBeVisible();
  await expectNoRuntimeAssetDiagnostics(page);
  await page.screenshot({ path: "test-results/harness-tone-cleared.png", fullPage: true });

  expect(consoleErrors).toEqual([]);
});

async function expectTone(page: Page, value: string): Promise<void> {
  await expect(page.getByTestId("harness-showcase-character-tone")).toHaveText(value);
  await expect(page.getByTestId("harness-showcase-pixi-tasks")).toHaveText("empty");
}

async function capturePixiLayer(page: Page): Promise<Buffer> {
  const bounds = await page.getByTestId("pixi-layer").boundingBox();
  expect(bounds).not.toBeNull();
  return page.screenshot({
    clip: {
      x: Math.round(bounds?.x ?? 0),
      y: Math.round(bounds?.y ?? 0),
      width: Math.round(bounds?.width ?? 1),
      height: Math.round(bounds?.height ?? 1)
    }
  });
}

async function expectMeaningfulCanvasDifference(
  page: Page,
  before: Buffer,
  after: Buffer
): Promise<void> {
  const changedPixels = await page.evaluate(async ({ beforeBase64, afterBase64 }) => {
    const decode = async (base64: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D screenshot comparison context is unavailable");
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height);
    };
    const beforePixels = await decode(beforeBase64);
    const afterPixels = await decode(afterBase64);
    if (
      beforePixels.width !== afterPixels.width ||
      beforePixels.height !== afterPixels.height
    ) {
      throw new Error("Pixi comparison frames have different dimensions");
    }
    let changed = 0;
    for (let index = 0; index < beforePixels.data.length; index += 4) {
      const delta = Math.max(
        Math.abs(beforePixels.data[index]! - afterPixels.data[index]!),
        Math.abs(beforePixels.data[index + 1]! - afterPixels.data[index + 1]!),
        Math.abs(beforePixels.data[index + 2]! - afterPixels.data[index + 2]!)
      );
      if (delta >= 24) changed += 1;
    }
    return changed;
  }, {
    beforeBase64: before.toString("base64"),
    afterBase64: after.toString("base64")
  });

  expect(changedPixels).toBeGreaterThan(2_000);
}
