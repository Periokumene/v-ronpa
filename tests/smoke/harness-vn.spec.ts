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
  await expect(page.getByTestId("harness-showcase-pixi-background")).toHaveText("bg/showcase");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-inner-background", "bg/inner/academy-hall");
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
  await expect(page.getByTestId("harness-showcase-pixi-background")).toHaveText("bg/showcase");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-inner-background", "bg/inner/academy-hall");
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

test("harness stages dialogue, print, and Cue through manual, AUTO, SKIP, save, and backlog", async ({ page }) => {
  const consoleErrors = watchUnexpectedConsoleErrors(page);
  const voiceRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/assets/voice/zh/voice-validation-0001.ogg")) voiceRequests.push(request.url());
  });

  await bootHarness(page);
  await configureTitleDisplay(page, { textSpeed: "0", textSize: "large" });
  await startNavi(page);
  await startStoryOverlay(page);
  await advanceUntilText(page, "请选择测试路径");
  await advanceUntilChoices(page);
  await expect(page.getByTestId("vn-choice-6")).toHaveText("分支7：单句分阶段停靠验收");
  await page.getByTestId("vn-choice-6").click();
  await expect(page.getByTestId("harness-showcase-route")).toHaveText("staged-text");
  await page.getByTestId("harness-showcase-debug-tab-inspector").click();

  const backlogCount = page.getByTestId("inspector-lite").getByText("Backlog", { exact: true })
    .locator("..").locator("dd");
  await expect(backlogCount).toHaveText("0");

  await advanceHarness(page);
  await expect(page.getByTestId("vn-dialog-text")).toHaveText("下落");
  await advanceHarness(page);
  await advanceHarness(page);
  await expect(page.getByTestId("vn-dialog-text")).toHaveText("下落，下落");
  await expect(backlogCount).toHaveText("0");
  await page.screenshot({ path: "test-results/harness-staged-dialog-stage-2.png", fullPage: true });

  await page.getByTestId("vn-command-quick-save").click();
  await expect(page.getByTestId("vn-command-quick-load")).toBeEnabled();
  await advanceHarness(page);
  await advanceHarness(page);
  await expect(page.getByTestId("vn-dialog-text")).toHaveText("下落，下落，下落，仿佛没有尽头");
  await expect(backlogCount).toHaveText("1");

  await page.getByTestId("vn-command-quick-load").click();
  await expect(page.getByTestId("load-confirmation")).toHaveCount(0);
  await expect(page.getByTestId("vn-dialog-text")).toHaveText("下落，下落");
  await expect(backlogCount).toHaveText("0");
  await advanceHarness(page);
  await advanceHarness(page);
  await expect(page.getByTestId("vn-dialog-text")).toHaveText("下落，下落，下落，仿佛没有尽头");
  await expect(backlogCount).toHaveText("1");

  await page.getByTestId("vn-command-backlog").click();
  await expect(page.getByTestId("backlog-entry-0")).toContainText("下落，下落，下落，仿佛没有尽头");
  await expect(page.locator('[data-testid^="backlog-entry-"]')).toHaveCount(1);
  await page.getByTestId("pause-surface-close").click();

  await advanceHarnessUntilChoices(page);
  await page.getByTestId("vn-choice-0").click();
  await expect(page.getByTestId("vn-dialog-text")).toHaveText(/下|下落/);
  await page.getByTestId("vn-command-auto").click();
  await expect(page.getByTestId("vn-command-auto")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => page.getByTestId("vn-dialog-text").textContent(), { timeout: 10_000 })
    .toBe("下落，下落");
  await page.screenshot({ path: "test-results/harness-staged-print-auto-stage-2.png", fullPage: true });
  await expect.poll(async () => page.getByTestId("vn-dialog-text").textContent(), { timeout: 10_000 })
    .toBe("下落，下落，下落，仿佛没有尽头");
  await advanceHarnessUntilChoices(page);
  expect(voiceRequests).toHaveLength(1);
  await expect(backlogCount).toHaveText("2");

  await page.getByTestId("vn-choice-0").click();
  await expect(page.getByTestId("vn-cue-text")).toHaveText(/向|向下/);
  await page.getByTestId("vn-command-skip").click();
  await expect(page.getByTestId("vn-command-skip")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("vn-cue-text")).toHaveText(
    "向下，向下，再向下。这样的坠落难道永远不会结束吗？",
    { timeout: 10_000 }
  );
  await advanceHarnessUntilChoices(page);
  await expect(backlogCount).toHaveText("3");
  await page.screenshot({ path: "test-results/harness-staged-cue-skip-final.png", fullPage: true });

  await page.getByTestId("vn-choice-0").click();
  await expect(page.getByTestId("vn-dialog-text")).toContainText("CHECKPOINT STAGED DONE", { timeout: 5_000 });
  await page.getByTestId("harness-showcase-debug-tab-runtime").click();
  await expectNoRuntimeAssetDiagnostics(page);
  expect(consoleErrors).toEqual([]);
});

test("harness renders, replaces, saves, restores, and hides the formal Pinp surface", async ({ page }) => {
  const consoleErrors = watchUnexpectedConsoleErrors(page);
  await bootHarness(page);
  await configureTitleDisplay(page, { textSpeed: "0", textSize: "large" });
  await startNavi(page);
  await startStoryOverlay(page);
  await advanceUntilText(page, "请选择测试路径");
  await advanceUntilChoices(page);
  await expect(page.getByTestId("vn-choice-7")).toHaveText("分支8：Pinp 画中画验收");
  await page.getByTestId("vn-choice-7").click();
  await expect(page.getByTestId("harness-showcase-route")).toHaveText("pinp");
  await advanceHarnessUntilSurfaceText(page, "vn-dialog-text", "CHECKPOINT PINP 00");

  const pinp = page.getByTestId("runtime-pinp-surface");
  const image = page.getByTestId("runtime-pinp-image");
  await expect(pinp).toBeVisible();
  await expect(pinp).toHaveAttribute("data-pinp-asset-id", "thumb/evidence-keycard");
  await expect(pinp).toHaveAttribute("data-ui-phase", "shown");
  await expect(pinp).toHaveCSS("z-index", "8");
  await expect(pinp).toHaveCSS("pointer-events", "none");
  await expect(image).toHaveAttribute("alt", "门禁卡证据缩略图");
  await expectPinpGeometry(page, { centerX: 0.5, centerY: 0.5, height: 0.2, ratio: 16 / 9 });
  await image.evaluate((element) => { element.setAttribute("data-replay-probe", "old-image"); });
  await page.screenshot({ path: "test-results/harness-pinp-default.png", fullPage: true });

  await page.getByTestId("vn-command-quick-save").click();
  await expect(page.getByTestId("vn-command-quick-load")).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-surface")).toBeVisible();
  await expect(pinp).toHaveCount(0);
  await page.getByTestId("pause-surface-close").click();
  await expect(pinp).toBeVisible();

  await advanceHarnessUntilChoices(page);
  await page.getByTestId("vn-choice-0").click();
  await advanceHarnessUntilSurfaceText(page, "vn-dialog-text", "CHECKPOINT PINP 01");
  await expect(page.getByTestId("runtime-pinp-image")).not.toHaveAttribute("data-replay-probe", "old-image");
  await expect(page.getByTestId("runtime-pinp-image")).toHaveAttribute("alt", "左上方门禁卡证据");
  await expectPinpGeometry(page, { centerX: 0.25, centerY: 0.35, height: 0.3, ratio: 4 / 3 });
  await page.screenshot({ path: "test-results/harness-pinp-custom.png", fullPage: true });

  await advanceHarnessUntilChoices(page);
  await page.getByTestId("vn-choice-0").click();
  await advanceHarnessUntilSurfaceText(page, "vn-dialog-text", "CHECKPOINT PINP 02");
  await expect(pinp).toHaveCount(0, { timeout: 5_000 });

  await page.getByTestId("vn-command-quick-load").click();
  await expect(page.getByTestId("load-confirmation")).toHaveCount(0);
  await expect(pinp).toBeVisible();
  await expect(pinp).toHaveAttribute("data-ui-phase", "shown");
  await expect(page.getByTestId("runtime-pinp-image")).toHaveAttribute("alt", "门禁卡证据缩略图");
  await expectPinpGeometry(page, { centerX: 0.5, centerY: 0.5, height: 0.2, ratio: 16 / 9 });
  await page.screenshot({ path: "test-results/harness-pinp-restored.png", fullPage: true });

  await page.getByTestId("runtime-pinp-image").evaluate((element) => {
    (element as HTMLImageElement).src = "data:text/plain,not-an-image";
  });
  await expect(page.getByTestId("runtime-pinp-missing")).toContainText("thumb/evidence-keycard");
  await page.screenshot({ path: "test-results/harness-pinp-error.png", fullPage: true });
  await expectNoRuntimeAssetDiagnostics(page);
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

async function expectPinpGeometry(
  page: Page,
  expected: { centerX: number; centerY: number; height: number; ratio: number }
) {
  const geometry = await page.evaluate(() => {
    const pinp = document.querySelector<HTMLElement>('[data-testid="runtime-pinp-surface"]');
    const playfield = document.querySelector<HTMLElement>('[data-testid="playfield"]');
    if (!pinp || !playfield) return null;
    const rect = pinp.getBoundingClientRect();
    const playfieldRect = playfield.getBoundingClientRect();
    return {
      centerX: (rect.left + rect.width / 2 - playfieldRect.left) / playfieldRect.width,
      centerY: (rect.top + rect.height / 2 - playfieldRect.top) / playfieldRect.height,
      height: rect.height / playfieldRect.height,
      ratio: rect.width / rect.height
    };
  });
  expect(geometry).not.toBeNull();
  expect(geometry?.centerX).toBeCloseTo(expected.centerX, 2);
  expect(geometry?.centerY).toBeCloseTo(expected.centerY, 2);
  expect(geometry?.height).toBeCloseTo(expected.height, 2);
  expect(geometry?.ratio).toBeCloseTo(expected.ratio, 2);
}
