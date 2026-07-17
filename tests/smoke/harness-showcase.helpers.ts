import { expect, type Page } from "@playwright/test";

export function watchUnexpectedConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isExpectedPointerLockError(message.text())) {
      errors.push(`${message.text()} @ ${message.location().url || "unknown"}`);
    }
  });
  return errors;
}

export async function bootHarness(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem("v-ronpa:settings:v2");
    indexedDB.deleteDatabase("v-ronpa-harness-showcase-v9");
  });
  await page.goto("/");

  await expect(page.getByTestId("playfield")).toBeVisible();
  await expect(page.getByTestId("harness-scenario-id")).toHaveText("harness-showcase");
  await expect(page.getByTestId("harness-showcase-shell")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(2);
  await expect(page.getByTestId("harness-showcase-debug-sidebar")).toBeVisible();
  await expect(page.getByTestId("harness-showcase-debug-panel-runtime")).toBeVisible();
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-character-outline", "enabled");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-character-preparation", "ready", { timeout: 30_000 });
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-rendering", "paused");
  await expect(page.getByTestId("r3f-canvas")).toHaveAttribute("data-r3f-rendering", "paused");
  await expect(page.getByTestId("playfield").getByTestId("harness-commands")).toHaveCount(0);
  await expect(page.getByTestId("harness-showcase-debug-panel-runtime").getByTestId("harness-showcase-runtime-controls")).toBeVisible();
  await expectNoRuntimeAssetDiagnostics(page);
  await expect(page.getByTestId("title-surface")).toBeVisible();
  await expect(page.getByTestId("title-new-game")).toBeEnabled();
}

export async function configureTitleDisplay(
  page: Page,
  options: { textSpeed?: string; textSize?: string }
) {
  await page.getByTestId("title-settings").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  if (options.textSpeed) await page.getByTestId("settings-display-text-speed").fill(options.textSpeed);
  if (options.textSize) await page.getByTestId("settings-display-text-size").selectOption(options.textSize);
  await page.getByTestId("settings-overlay-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();
}

export async function startNavi(page: Page) {
  await page.getByTestId("title-new-game").click();
  await expect(page.getByTestId("title-surface")).toBeHidden();
  await expect(page.getByTestId("harness-status")).toHaveText("Navi 探索");
  await expect(page.getByTestId("r3f-canvas")).toHaveAttribute("data-r3f-rendering", "active");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-rendering", "paused");
}

export async function startStoryOverlay(page: Page) {
  await page.getByTestId("harness-showcase-move-witness").click();
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText("interactable:witness");
  await page.getByTestId("harness-showcase-confirm").click();
  await expect(page.getByTestId("harness-showcase-substate")).toHaveText("vn2d-overlay");
  await expect(page.getByTestId("vn-dialog-surface")).toBeVisible();
  await expect(page.getByTestId("r3f-canvas")).toHaveAttribute("data-r3f-rendering", "paused");
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("data-pixi-rendering", "active");
}

export async function walkForwardUntilActive(page: Page, interactableId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await movementPulse(page, "ArrowUp");
    if ((await page.getByTestId("harness-showcase-active-interactable").textContent()) === interactableId) return;
  }
  await expect(page.getByTestId("harness-showcase-active-interactable")).toHaveText(interactableId);
}

export async function expectNoDocumentScroll(page: Page) {
  const hasDocumentScroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
  expect(hasDocumentScroll).toBe(false);
}

export async function expectNoRuntimeAssetDiagnostics(page: Page) {
  await expect(page.getByTestId("harness-showcase-asset-diagnostics-count")).toHaveText("0");
  await expect(page.getByTestId("harness-showcase-latest-diagnostic")).not.toContainText(":asset:");
}

export async function advanceUntilChoices(page: Page) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await page.getByTestId("vn-choice-overlay").count()) > 0) return;
    await advanceVn(page);
  }
  await expect(page.getByTestId("vn-choice-overlay")).toBeVisible();
}

export async function advanceUntilOverlayClosed(page: Page) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await page.getByTestId("harness-showcase-substate").textContent()) === "walk") return;
    await advanceVn(page);
  }
  await expect(page.getByTestId("harness-showcase-substate")).toHaveText("walk");
}

export async function advanceMainInteractionShowcase(page: Page) {
  await advanceVn(page);
  await advanceUntilText(page, "CHECKPOINT MAIN 01B");
  await expect(page.getByTestId("vn-command-bar")).toBeVisible();
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-ui-phase", "shown");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveCSS("opacity", "1");
  await expect(page.getByTestId("vn-command-bar")).toHaveAttribute("data-ui-phase", "shown");
  await expect(page.getByTestId("vn-command-bar")).toHaveCSS("opacity", "1");
  await advanceUntilText(page, "附加文本验证");
  await advanceUntilInputPrompt(page);
  await expect(page.getByTestId("runtime-input-prompt")).toBeVisible();
  await expect(page.getByTestId("vn-advance-hit-plane")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-surface")).toHaveCount(0);
  const dialogTextBeforeInputPromptSubmit = await currentDialogText(page);
  await page.getByTestId("runtime-input-field").fill("Smoke");
  await expect(page.getByTestId("vn-dialog-text")).toHaveText(dialogTextBeforeInputPromptSubmit);
  await page.getByTestId("runtime-input-submit").click();
  await advanceUntilText(page, "CHECKPOINT MAIN 02");
  await advanceUntilText(page, "CHECKPOINT MAIN 03");
  await advanceUntilText(page, "CHECKPOINT MAIN 03B");
  await advanceUntilText(page, "CHECKPOINT MAIN 03C");
  await advanceUntilText(page, "CHECKPOINT MAIN 04");
  await advanceVn(page);
  await expect(page.getByTestId("runtime-movie-overlay")).toBeVisible();
  await expect(page.getByTestId("vn-advance-hit-plane")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-surface")).toHaveCount(0);
  await page.getByTestId("runtime-movie-skip").click();
  await advanceUntilText(page, "CHECKPOINT MAIN 05");
  await advanceUntilText(page, "CHECKPOINT MAIN 06");
  await advanceUntilOverlayClosed(page);
}

export async function advanceUntilText(page: Page, text: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const dialogText = page.getByTestId("vn-dialog-text");
    if ((await dialogText.count()) === 0) {
      const substate = await page.getByTestId("harness-showcase-substate").textContent();
      if (substate === "vn2d-overlay") {
        await advanceVn(page);
        await page.waitForTimeout(120);
        continue;
      }
      const lastAction = await page.getByTestId("harness-showcase-last-action").textContent();
      throw new Error(`VN overlay closed before '${text}' was reached. substate=${substate ?? "unknown"} lastAction=${lastAction ?? "unknown"}`);
    }
    if (((await dialogText.textContent()) ?? "").includes(text)) {
      await waitForDialogTextToSettle(page);
      return;
    }
    await advanceVn(page);
    await page.waitForTimeout(120);
  }
  await expect(page.getByTestId("vn-dialog-text")).toContainText(text);
  await waitForDialogTextToSettle(page);
}

export async function advanceUntilTextOrOverlayClosed(page: Page, text: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if ((await page.getByTestId("vn-dialog-text").count()) === 0) {
      if ((await page.getByTestId("harness-showcase-substate").textContent()) === "walk") return;
      await page.waitForTimeout(120);
      continue;
    }
    if (((await page.getByTestId("vn-dialog-text").textContent()) ?? "").includes(text)) {
      await waitForDialogTextToSettle(page);
      return;
    }
    await advanceVn(page);
    await page.waitForTimeout(120);
  }
  await expect(page.getByTestId("harness-showcase-substate")).toHaveText("walk");
}

export async function currentDialogText(page: Page) {
  await waitForDialogTextToSettle(page);
  return (await page.getByTestId("vn-dialog-text").textContent()) ?? "";
}

export function changedByteCount(left: Buffer, right: Buffer, threshold = 0): number {
  const byteCount = Math.min(left.length, right.length);
  let changed = 0;
  for (let index = 0; index < byteCount; index += 1) {
    if (Math.abs(left[index] - right[index]) > threshold) changed += 1;
  }
  return changed;
}

export async function expectKeyNeverFocuses(page: Page, key: string, activeTestId: string) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await movementPulse(page, key);
    await expect(page.getByTestId(activeTestId)).toHaveText("none");
  }
}

export async function movementPulse(page: Page, key: string) {
  await page.keyboard.down(key);
  await page.waitForTimeout(90);
  await page.keyboard.up(key);
  await page.waitForTimeout(25);
}

export async function blurActiveElement(page: Page) {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
}

export async function requestPointerLockAndRelease(page: Page, triggerTestId: string, statusTestId: string) {
  await page.getByTestId(triggerTestId).click();
  await expect(page.getByTestId(statusTestId)).toHaveText(/requested|locked|unlocked|denied/);
  await page.waitForTimeout(650);
  const status = (await page.getByTestId(statusTestId).textContent()) ?? "";
  expect(status).toMatch(/locked|unlocked|denied/);
  if (!status.includes("locked")) return;
  await page.keyboard.press("Escape");
  await expect(page.getByTestId(statusTestId)).toHaveText("unlocked");
}

async function advanceUntilInputPrompt(page: Page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await page.getByTestId("runtime-input-prompt").count()) > 0) return;
    await advanceVn(page);
    await page.waitForTimeout(120);
  }
  await expect(page.getByTestId("runtime-input-prompt")).toBeVisible();
}

async function advanceVn(page: Page) {
  const hitPlane = page.getByTestId("vn-advance-hit-plane");
  if (await hitPlane.isVisible()) {
    await hitPlane.click();
    return;
  }
  const debugAdvance = page.getByTestId("harness-showcase-advance");
  await expect(debugAdvance).toBeEnabled({ timeout: 5_000 });
  await debugAdvance.click();
}

async function waitForDialogTextToSettle(page: Page) {
  let previous = (await page.getByTestId("vn-dialog-text").textContent()) ?? "";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.waitForTimeout(120);
    if ((await page.getByTestId("vn-dialog-text").count()) === 0) return;
    const current = (await page.getByTestId("vn-dialog-text").textContent()) ?? "";
    if (current === previous) return;
    previous = current;
  }
}

function isExpectedPointerLockError(text: string): boolean {
  return text.includes("PointerLockControls: Unable to use Pointer Lock API");
}
