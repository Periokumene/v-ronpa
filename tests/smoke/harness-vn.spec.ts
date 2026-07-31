import { expect, test, type Page } from "@playwright/test";
import {
  advanceMainInteractionShowcase,
  advanceUntilChoices,
  advanceUntilText,
  blurActiveElement,
  bootHarness,
  configureTitleDisplay,
  currentDialogText,
  expectNoDocumentScroll,
  expectNoRuntimeAssetDiagnostics,
  movementPulse,
  setSettingsOption,
  startNavi,
  startStoryOverlay,
  watchUnexpectedConsoleErrors
} from "./harness-showcase.helpers";

test.setTimeout(180_000);

test("harness VN shell, save/load, and main interaction branch", async ({ page }) => {
  const consoleErrors = watchUnexpectedConsoleErrors(page);
  await bootHarness(page);
  await configureTitleDisplay(page, { textSpeed: "1", textSize: "large" });
  await startNavi(page);
  await startStoryOverlay(page);

  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-text-size", "large");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-dialog-background-opacity", "1");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-ui-phase", "shown");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByTestId("vn-dialog-speaker")).toHaveText("旁白");
  await expect(page.getByTestId("vn-dialog-state")).toHaveText("阅读中");
  await expect(page.getByTestId("vn-dialog-advance")).toHaveCount(0);
  await expect(page.getByTestId("vn-dialog-cancel")).toHaveCount(0);
  await advanceUntilText(page, "请选择测试路径");
  await advanceUntilChoices(page);
  await expect(page.getByTestId("vn-dialog-state")).toHaveText("等待选择");
  await expect(page.getByTestId("harness-showcase-pixi-background")).toHaveText("bg:harness");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-inner-background", "bg:inner-academy-hall");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/default@0.50,0.00");
  await expect(page.getByTestId("harness-showcase-pixi-tasks")).toBeVisible();
  await expect(page.getByTestId("vn-command-bar")).toBeVisible();
  await expect(page.getByTestId("vn-command-bar")).toHaveAttribute("data-ui-phase", "shown");
  await expect(page.getByTestId("vn-command-backlog")).toBeEnabled();
  await expect(page.getByTestId("vn-command-save")).toBeEnabled();
  await expect(page.getByTestId("vn-command-quick-save")).toBeEnabled();
  await expect(page.getByTestId("vn-command-load")).toBeEnabled();
  await expect(page.getByTestId("vn-command-quick-load")).toBeDisabled();
  await expect(page.getByTestId("vn-command-settings")).toBeEnabled();

  const dialogTextBeforeCommandOverlay = await currentDialogText(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-surface")).toHaveAttribute("data-pause-section", "backlog");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveCount(0);
  await expect(page.getByTestId("vn-choice-overlay")).toHaveCount(0);
  await expect(page.getByTestId("vn-command-bar")).toHaveCount(0);
  await page.getByTestId("pause-tab-save").click();
  await page.getByTestId("pause-tab-load").click();
  await expect(page.getByTestId("pause-surface")).toHaveAttribute("data-pause-section", "load");
  await page.getByTestId("pause-surface-close").click();
  await expect(page.getByTestId("pause-surface")).toBeHidden();
  await expect(page.getByTestId("vn-dialog-surface")).toBeVisible();
  await expect(page.getByTestId("vn-command-bar")).toBeVisible();
  await expect(page.getByTestId("vn-dialog-text")).toHaveText(dialogTextBeforeCommandOverlay);

  await page.getByTestId("vn-command-settings").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await expect(page.getByTestId("vn-dialog-surface")).toHaveCount(0);
  await setSettingsOption(page, "settings-display-text-size", "small", ["small", "medium", "large"]);
  await expect(page.getByTestId("settings-display-textbox-opacity")).toHaveCount(0);
  await page.getByTestId("pause-surface-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-text-size", "small");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-dialog-background-opacity", "1");

  await page.getByTestId("vn-command-backlog").click();
  await expect(page.getByTestId("backlog-overlay")).toBeVisible();
  await expect(page.getByTestId("backlog-entry-0")).toContainText("视觉小说联调剧本");
  await page.getByTestId("pause-surface-close").click();
  await expect(page.getByTestId("backlog-overlay")).toBeHidden();
  const savedDialogText = (await page.getByTestId("vn-dialog-text").textContent()) ?? "";
  expect(savedDialogText.length).toBeGreaterThan(0);
  const savedDialogExcerpt = savedDialogText.slice(0, 12);
  await page.getByTestId("vn-command-quick-save").click();
  await expect(page.getByTestId("vn-command-quick-load")).toBeEnabled();
  await page.getByTestId("vn-command-quick-load").click();
  await expect(page.getByTestId("load-confirmation")).toHaveCount(0);
  await expect(page.getByTestId("vn-dialog-text")).toContainText(savedDialogExcerpt);
  await page.getByTestId("vn-command-save").click();
  await expect(page.getByTestId("save-load-overlay")).toBeVisible();
  await expect(page.getByTestId("save-load-mode")).toHaveText("save");
  await page.getByTestId("save-slot-1").click();
  await expect(page.getByTestId("save-slot-1")).toContainText(savedDialogExcerpt);
  await expect(page.getByTestId("save-slot-1-thumbnail")).toHaveAttribute("src", /^blob:/);
  await expect(page.getByTestId("save-slot-1-thumbnail")).toHaveJSProperty("draggable", false);
  await page.getByTestId("pause-surface-close").click();
  await expect(page.getByTestId("save-load-overlay")).toBeHidden();
  await page.getByTestId("vn-command-load").click();
  await expect(page.getByTestId("save-load-overlay")).toBeVisible();
  await expect(page.getByTestId("save-load-mode")).toHaveText("load");
  await page.getByTestId("save-slot-1").click();
  await expect(page.getByTestId("load-confirmation")).toBeVisible();
  await page.getByTestId("load-confirm").click();
  await expect(page.getByTestId("save-load-overlay")).toBeHidden();
  await expect(page.getByTestId("vn-dialog-surface")).toBeVisible();
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-text-size", "small");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-dialog-background-opacity", "1");
  await blurActiveElement(page);
  await page.keyboard.press("Space");
  await movementPulse(page, "ArrowUp");
  await expect(page.getByTestId("harness-showcase-substate")).toHaveText("vn2d-overlay");
  await expect(page.getByTestId("vn-dialog-text")).toContainText(savedDialogExcerpt);
  await expect(page.getByTestId("harness-showcase-pixi-background")).toHaveText("bg:harness");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-inner-background", "bg:inner-academy-hall");
  await expect(page.getByTestId("harness-showcase-pixi-characters")).toContainText("Ema/default@0.50,0.00");
  await expect(page.getByTestId("harness-showcase-pixi-tasks")).toHaveText("empty");
  await expectNoDocumentScroll(page);
  await page.screenshot({ path: "test-results/harness-vn-choice.png", fullPage: true });

  await expect(page.getByTestId("vn-choice-0")).toHaveText("分支1：主交互流程验证入口");
  await expect(page.getByTestId("vn-choice-1")).toHaveText("分支2：完整 Pixi 命令视觉验收");
  await expect(page.getByTestId("vn-choice-overlay")).toBeVisible();
  await expect(page.getByTestId("vn-dialog-surface").getByTestId("vn-choice-overlay")).toHaveCount(0);
  await expect(page.getByTestId("vn-dialog-state")).toHaveText("等待选择");
  await expect(page.getByTestId("vn-advance-hit-plane")).toHaveCount(0);
  await page.getByTestId("vn-choice-0").click();
  await expect(page.getByTestId("harness-showcase-route")).toHaveText("return");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveCount(0);
  await expect(page.getByTestId("vn-command-bar")).toBeHidden();
  await expect(page.getByTestId("harness-showcase-debug-sidebar")).toBeVisible();
  await expect(page.getByTestId("playfield").getByTestId("harness-status")).toBeVisible();
  await advanceMainInteractionShowcase(page);
  await expect(page.getByTestId("harness-showcase-substate")).toHaveText("walk");
  await expect(page.getByTestId("r3f-canvas")).toHaveAttribute("data-r3f-rendering", "active");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-rendering", "paused");
  await expectNoRuntimeAssetDiagnostics(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-surface")).toHaveAttribute("data-pause-section", "save");
  await expect(page.getByTestId("pause-tab-save")).toBeEnabled();
  await expect(page.getByTestId("pause-tab-load")).toBeEnabled();
  await expect(page.getByTestId("pause-tab-settings")).toBeEnabled();
  await page.getByTestId("pause-surface-close").click();
  await expect(page.getByTestId("pause-surface")).toBeHidden();

  expect(consoleErrors).toEqual([]);
});

test("harness renders Cue independently, retains it under choices, and waits for fade-out before Dialog", async ({ page }) => {
  const consoleErrors = watchUnexpectedConsoleErrors(page);
  await bootHarness(page);
  await configureTitleDisplay(page, { textSpeed: "1", textSize: "large" });
  await startNavi(page);
  await startStoryOverlay(page);
  await advanceUntilText(page, "请选择测试路径");
  await advanceUntilChoices(page);
  await expect(page.getByTestId("vn-choice-5")).toHaveText("分支6：Cue 演出文本验收");
  await page.getByTestId("vn-choice-5").click();

  await advanceHarnessUntilSurfaceText(page, "vn-dialog-text", "CHECKPOINT CUE 00");
  await advanceHarnessUntilSurfaceText(page, "vn-cue-text", "CHECKPOINT CUE 01");
  const cue = page.getByTestId("vn-cue-surface");
  await expect(cue).toBeVisible();
  await expect(cue).toHaveAttribute("aria-label", "演出文本：Narrator");
  const richRun = cue.locator('[data-rich-text-run=""]');
  await expect(richRun).toContainText("CHECKPOINT CUE 01");
  await expect(richRun).toHaveCSS("font-weight", "700");
  await expect(cue).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(cue).toHaveCSS("border-top-style", "none");
  await expect(cue).toHaveCSS("box-shadow", "none");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveCount(0);
  await page.screenshot({ path: "test-results/harness-cue-centered-borderless.png", fullPage: true });

  await advanceHarnessUntilSurfaceText(page, "vn-cue-text", "CHECKPOINT CUE 02");
  await expect(cue).toHaveAttribute("data-ui-phase", "shown");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveCount(0);
  await expect(page.getByTestId("vn-command-bar")).toBeVisible();
  await page.screenshot({ path: "test-results/harness-cue-hide-ui-isolation.png", fullPage: true });

  await advanceHarnessUntilChoices(page);
  await expect(page.getByTestId("vn-choice-0")).toContainText("CHECKPOINT CUE CHOICE");
  await expect(cue).toBeVisible();
  await page.getByTestId("vn-choice-0").click();
  await expect(cue).toHaveAttribute("data-ui-phase", "hiding");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveCount(0);
  await page.screenshot({ path: "test-results/harness-cue-fading-before-dialog.png", fullPage: true });

  await expect(cue).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT CUE 03", { timeout: 5_000 });
  await page.screenshot({ path: "test-results/harness-cue-fade-complete-dialog.png", fullPage: true });
  expect(consoleErrors).toEqual([]);
});

async function advanceHarnessUntilSurfaceText(page: Page, testId: string, text: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const surface = page.getByTestId(testId);
    const surfaceText = (await surface.count()) > 0 ? (await surface.textContent()) ?? "" : "";
    if (surfaceText.includes(text)) return;
    await advanceHarness(page);
    await page.waitForTimeout(120);
  }
  await expect(page.getByTestId(testId)).toContainText(text);
}

async function advanceHarnessUntilChoices(page: Page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await page.getByTestId("vn-choice-overlay").count()) > 0) return;
    await advanceHarness(page);
    await page.waitForTimeout(120);
  }
  await expect(page.getByTestId("vn-choice-overlay")).toBeVisible();
}

async function advanceHarness(page: Page) {
  const hitPlane = page.getByTestId("vn-advance-hit-plane");
  if (await hitPlane.isVisible()) {
    await hitPlane.click();
    return;
  }
  await page.getByTestId("harness-showcase-advance").click();
}
