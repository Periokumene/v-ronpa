import { expect, test } from "@playwright/test";
import {
  blurActiveElement,
  bootHarness,
  expectKeyNeverFocuses,
  expectNoDocumentScroll,
  expectNoRuntimeAssetDiagnostics,
  requestPointerLockAndRelease,
  setSettingsOption,
  startNavi,
  walkForwardUntilActive,
  watchUnexpectedConsoleErrors
} from "./harness-showcase.helpers";

test.setTimeout(120_000);

test("harness Navi, settings, interaction, and Trial flow", async ({ page }) => {
  const consoleErrors = watchUnexpectedConsoleErrors(page);
  await bootHarness(page);

  await expect(page.getByTestId("title-load")).toBeEnabled();
  await expect(page.getByTestId("title-settings")).toBeEnabled();
  await page.getByTestId("title-settings").click();
  await expect(page.getByTestId("settings-group-system")).toBeVisible();
  await expect(page.getByTestId("settings-group-display")).toBeVisible();
  await expect(page.getByTestId("settings-group-sound")).toBeVisible();
  await expect(page.getByTestId("settings-overlay").getByTestId("vn-dialog-text")).toHaveCount(0);
  await setSettingsOption(page, "settings-display-text-size", "large", ["small", "medium", "large"]);
  await expect(page.getByTestId("settings-display-textbox-opacity")).toHaveCount(0);
  await page.getByTestId("settings-overlay-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();
  await page.getByTestId("title-settings").click();
  await expect(page.getByTestId("settings-display-text-size")).toHaveAttribute("data-value", "large");
  await expect(page.getByTestId("settings-display-textbox-opacity")).toHaveCount(0);
  await page.getByTestId("settings-overlay-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();
  await page.getByTestId("title-load").click();
  await expect(page.getByTestId("save-load-overlay")).toBeVisible();
  await expect(page.getByTestId("save-load-mode")).toHaveText("load");
  await page.getByTestId("save-load-overlay-close").click();
  await expect(page.getByTestId("save-load-overlay")).toBeHidden();

  await startNavi(page);
  await expect(page.getByTestId("harness-showcase-move-spawn")).toHaveText("移至：出生点");
  await expect(page.getByTestId("harness-showcase-confirm")).toHaveText("确认交互");
  await expect(page.getByTestId("harness-showcase-debug-tab-runtime")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("harness-showcase-debug-tab-inspector").click();
  await expect(page.getByTestId("inspector-lite")).toBeVisible();
  await expect(page.getByTestId("harness-commands")).toHaveCount(0);
  await expect(page.getByTestId("harness-showcase-debug-tab-inspector")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("harness-showcase-debug-tab-runtime").click();
  await expect(page.getByTestId("harness-showcase-debug-tab-runtime")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("harness-showcase-debug-panel-runtime").getByTestId("harness-showcase-runtime-controls")).toBeVisible();
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:academy-hall");
  await expect(page.getByTestId("harness-showcase-pointer-lock-status")).toHaveText("idle");
  await expectNoRuntimeAssetDiagnostics(page);
  await expectNoDocumentScroll(page);
  await page.screenshot({ path: "test-results/harness-navigation-navi.png", fullPage: true });

  await requestPointerLockAndRelease(page, "harness-showcase-pointer-lock", "harness-showcase-pointer-lock-status");
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText("none");
  await blurActiveElement(page);
  await expectKeyNeverFocuses(page, "KeyW", "harness-showcase-active-interactable");
  await page.keyboard.press("KeyE");
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:academy-hall");
  await expect(page.getByTestId("harness-showcase-last-outcome")).toHaveText("reset");

  await walkForwardUntilActive(page, "interactable:classroom-door");
  await expect(page.getByTestId("harness-showcase-can-confirm")).toHaveText("true");
  await page.keyboard.press("KeyE");
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:academy-hall");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:classroom");
  await expect(page.getByTestId("harness-showcase-last-outcome")).toHaveText("change-map:map:classroom");
  await page.getByTestId("harness-showcase-move-hall-door").click();
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:academy-hall");

  await page.getByTestId("harness-showcase-move-empty").click();
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText("none");
  await expect(page.getByTestId("harness-showcase-can-confirm")).toHaveText("false");
  await expect(page.getByTestId("harness-showcase-blocked-reason")).toHaveText("no-target");
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-last-outcome")).toHaveText("none");

  await page.getByTestId("harness-showcase-move-notebook").click();
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText("interactable:notebook");
  await expect(page.getByTestId("harness-showcase-can-confirm")).toHaveText("true");
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-inventory")).toContainText("tool:notebook:1");
  await page.getByTestId("harness-showcase-move-keycard").click();
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText("interactable:keycard");
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-evidence")).toContainText("evidence:keycard");

  await page.getByTestId("harness-showcase-move-trial-stand").click();
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-status")).toHaveText("Trial 模式");
  await expect(page.getByTestId("harness-showcase-mode")).toHaveText("trial");
  await expect(page.getByTestId("harness-showcase-last-outcome")).toHaveText("start-trial:trial:door-lock");
  await expect(page.getByTestId("harness-showcase-trial-segment")).toHaveText("debate:door-lock");
  await expect(page.getByTestId("harness-showcase-trial-presentation")).toHaveText("debate3d");
  await expect(page.getByTestId("harness-showcase-trial-input-lock")).toHaveText("trial-targeting");
  await expect(page.getByTestId("trial-r3f-canvas")).toBeVisible();
  await expect(page.getByTestId("vn-command-bar")).toBeHidden();
  await page.getByTestId("harness-showcase-trial-correct").click();
  await expect(page.getByTestId("harness-showcase-trial-keywords")).toContainText("kw:door-lock:broken");
  await expect(page.getByTestId("harness-showcase-trial-segment")).toHaveText("discussion:trial-close");
  await expect(page.getByTestId("harness-showcase-trial-outcome")).toHaveText("correct:discussion:trial-close");
  await page.screenshot({ path: "test-results/harness-navigation-trial.png", fullPage: true });
  await page.getByTestId("harness-showcase-trial-exit").click();
  await expect(page.getByTestId("harness-status")).toHaveText("Navi 探索");
  await expect(page.getByTestId("harness-showcase-mode")).toHaveText("navi");
  await expect(page.getByTestId("harness-showcase-trial-segment")).toHaveText("none");
  await expect(page.getByTestId("r3f-canvas")).toHaveAttribute("data-r3f-rendering", "active");

  await page.getByTestId("harness-showcase-move-door").click();
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText("interactable:classroom-door");
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:classroom");
  await page.getByTestId("harness-showcase-move-hall-door").click();
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-map")).toHaveText("map:academy-hall");

  expect(consoleErrors).toEqual([]);
});
