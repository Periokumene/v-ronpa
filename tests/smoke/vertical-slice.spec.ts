import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

test("vertical slice connects Navi exploration, gameplay state, VN dialog, and branch outcomes", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isExpectedPointerLockError(message.text())) consoleErrors.push(message.text());
  });

  await page.addInitScript(() => localStorage.removeItem("v-ronpa:settings:v1"));
  await page.goto("/?scenario=vertical-slice");

  await expect(page.getByTestId("playfield")).toBeVisible();
  await expect(page.getByTestId("harness-scenario-id")).toHaveText("vertical-slice");
  await expect(page.getByTestId("vertical-slice-shell")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(2);
  await expect(page.getByTestId("vertical-slice-debug-sidebar")).toBeVisible();
  await expect(page.getByTestId("vertical-slice-debug-panel-runtime")).toBeVisible();
  await expect(page.getByTestId("playfield").getByTestId("harness-commands")).toHaveCount(0);
  await expect(page.getByTestId("vertical-slice-debug-panel-runtime").getByTestId("vertical-slice-runtime-controls")).toBeVisible();
  await expect(page.getByTestId("title-surface")).toBeVisible();
  await expect(page.getByTestId("title-new-game")).toBeEnabled();
  await expect(page.getByTestId("title-load")).toBeEnabled();
  await expect(page.getByTestId("title-settings")).toBeEnabled();
  await page.screenshot({ path: "test-results/vertical-slice-title.png", fullPage: true });
  await page.getByTestId("title-settings").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await expect(page.getByTestId("settings-group-system")).toBeVisible();
  await expect(page.getByTestId("settings-group-display")).toBeVisible();
  await expect(page.getByTestId("settings-group-sound")).toBeVisible();
  await expect(page.getByTestId("settings-overlay").getByTestId("vn-dialog-text")).toHaveCount(0);
  await page.getByTestId("settings-display-text-size").selectOption("large");
  await page.getByTestId("settings-display-textbox-opacity").fill("50");
  await page.getByTestId("settings-overlay-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();
  await page.getByTestId("title-settings").click();
  await expect(page.getByTestId("settings-display-text-size")).toHaveValue("large");
  await expect(page.getByTestId("settings-display-textbox-opacity")).toHaveValue("50");
  await expect(page.getByTestId("settings-display-textbox-opacity-value")).toHaveText("50%");
  await page.getByTestId("settings-overlay-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();
  await page.getByTestId("title-load").click();
  await expect(page.getByTestId("save-load-overlay")).toBeVisible();
  await expect(page.getByTestId("save-load-mode")).toHaveText("load");
  await page.getByTestId("save-load-overlay-close").click();
  await expect(page.getByTestId("save-load-overlay")).toBeHidden();
  await page.getByTestId("title-new-game").click();
  await expect(page.getByTestId("title-surface")).toBeHidden();
  await expect(page.getByTestId("harness-status")).toHaveText("Navi 探索");
  await expect(page.getByTestId("vertical-slice-move-spawn")).toHaveText("移至：出生点");
  await expect(page.getByTestId("vertical-slice-confirm")).toHaveText("确认交互");
  await expect(page.getByTestId("vertical-slice-debug-tab-runtime")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("vertical-slice-debug-tab-inspector").click();
  await expect(page.getByTestId("inspector-lite")).toBeVisible();
  await expect(page.getByTestId("harness-commands")).toHaveCount(0);
  await expect(page.getByTestId("vertical-slice-debug-tab-inspector")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("vertical-slice-debug-tab-runtime").click();
  await expect(page.getByTestId("vertical-slice-debug-tab-runtime")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("vertical-slice-debug-panel-runtime").getByTestId("vertical-slice-runtime-controls")).toBeVisible();
  await expect(page.getByTestId("vertical-slice-map")).toHaveText("map:academy-hall");
  await expect(page.getByTestId("vertical-slice-pointer-lock-status")).toHaveText("idle");
  await expectNoDocumentScroll(page);
  await page.screenshot({ path: "test-results/vertical-slice-navi.png", fullPage: true });

  await requestPointerLockAndRelease(page, "vertical-slice-pointer-lock", "vertical-slice-pointer-lock-status");
  await expect(page.getByTestId("vertical-slice-active-interactable")).toHaveText("none");
  await blurActiveElement(page);
  await expectKeyNeverFocuses(page, "KeyW", "vertical-slice-active-interactable");
  await page.keyboard.press("KeyE");
  await expect(page.getByTestId("vertical-slice-map")).toHaveText("map:academy-hall");
  await expect(page.getByTestId("vertical-slice-last-outcome")).toHaveText("reset");

  await walkForwardUntilActive(page, "interactable:classroom-door");
  await expect(page.getByTestId("vertical-slice-can-confirm")).toHaveText("true");
  await page.keyboard.press("KeyE");
  await expect(page.getByTestId("vertical-slice-map")).toHaveText("map:academy-hall");
  await expect(page.getByTestId("vertical-slice-last-outcome")).toHaveText("reset");
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

  await page.getByTestId("vertical-slice-move-trial-stand").click();
  await expect(page.getByTestId("vertical-slice-active-interactable")).toHaveText("interactable:trial-stand");
  await page.getByTestId("vertical-slice-confirm").click();
  await expect(page.getByTestId("harness-status")).toHaveText("Trial 模式");
  await expect(page.getByTestId("vertical-slice-mode")).toHaveText("trial");
  await expect(page.getByTestId("vertical-slice-last-outcome")).toHaveText("start-trial:trial:door-lock");
  await expect(page.getByTestId("vertical-slice-trial-segment")).toHaveText("debate:door-lock");
  await expect(page.getByTestId("vertical-slice-trial-presentation")).toHaveText("debate3d");
  await expect(page.getByTestId("vertical-slice-trial-input-lock")).toHaveText("trial-targeting");
  await expect(page.getByTestId("trial-r3f-canvas")).toBeVisible();
  await expect(page.getByTestId("vn-command-bar")).toBeHidden();
  await page.getByTestId("vertical-slice-trial-correct").click();
  await expect(page.getByTestId("vertical-slice-trial-keywords")).toContainText("kw:door-lock:broken");
  await expect(page.getByTestId("vertical-slice-trial-segment")).toHaveText("discussion:trial-close");
  await expect(page.getByTestId("vertical-slice-trial-outcome")).toHaveText("correct:discussion:trial-close");
  await page.screenshot({ path: "test-results/vertical-slice-trial-entry.png", fullPage: true });
  await page.getByTestId("vertical-slice-trial-exit").click();
  await expect(page.getByTestId("harness-status")).toHaveText("Navi 探索");
  await expect(page.getByTestId("vertical-slice-mode")).toHaveText("navi");
  await expect(page.getByTestId("vertical-slice-trial-segment")).toHaveText("none");

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
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-text-size", "large");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-textbox-opacity", "0.5");
  await expect(page.getByTestId("pixi-layer")).toBeVisible();
  await expect(page.getByTestId("pixi-layer")).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByTestId("vn-dialog-speaker")).toHaveText("旁白");
  await expect(page.getByTestId("vn-dialog-state")).toHaveText("可继续");
  await expect(page.getByTestId("vn-dialog-advance")).toHaveText("继续");
  await expect(page.getByTestId("vn-dialog-cancel")).toHaveText("取消");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("请选择测试路径");
  await advanceUntilChoices(page);
  await expect(page.getByTestId("vn-dialog-state")).toHaveText("等待选择");
  await expect(page.getByTestId("vertical-slice-pixi-background")).toHaveText("bg:harness");
  await expect(page.getByTestId("vertical-slice-pixi-slots")).toContainText("center:character:felix/portrait:felix:neutral");
  await expect(page.getByTestId("vertical-slice-pixi-tasks")).toBeVisible();
  await expect(page.getByTestId("vn-command-bar")).toBeVisible();
  await expect(page.getByTestId("vn-command-backlog")).toBeEnabled();
  await expect(page.getByTestId("vn-command-save")).toBeEnabled();
  await expect(page.getByTestId("vn-command-load")).toBeEnabled();
  await expect(page.getByTestId("vn-command-settings")).toBeEnabled();
  await page.getByTestId("vn-command-settings").click();
  await expect(page.getByTestId("settings-overlay")).toBeVisible();
  await page.getByTestId("settings-display-text-size").selectOption("small");
  await page.getByTestId("settings-display-textbox-opacity").fill("40");
  await expect(page.getByTestId("settings-display-textbox-opacity-value")).toHaveText("40%");
  await expect(page.getByTestId("settings-overlay").getByTestId("vn-dialog-text")).toHaveCount(0);
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-text-size", "small");
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-textbox-opacity", "0.4");
  await page.getByTestId("settings-overlay-close").click();
  await expect(page.getByTestId("settings-overlay")).toBeHidden();
  await page.screenshot({ path: "test-results/vertical-slice-vn-toolbar.png", fullPage: true });
  await page.getByTestId("vn-command-backlog").click();
  await expect(page.getByTestId("backlog-overlay")).toBeVisible();
  await expect(page.getByTestId("backlog-entry-0")).toContainText("视觉小说联调剧本");
  await page.screenshot({ path: "test-results/vertical-slice-backlog.png", fullPage: true });
  await page.getByTestId("backlog-overlay-close").click();
  await expect(page.getByTestId("backlog-overlay")).toBeHidden();
  const savedDialogText = (await page.getByTestId("vn-dialog-text").textContent()) ?? "";
  expect(savedDialogText.length).toBeGreaterThan(0);
  const savedDialogExcerpt = savedDialogText.slice(0, 12);
  await page.getByTestId("vn-command-save").click();
  await expect(page.getByTestId("save-load-overlay")).toBeVisible();
  await expect(page.getByTestId("save-load-mode")).toHaveText("save");
  await page.getByTestId("save-slot-1").click();
  await expect(page.getByTestId("save-slot-1")).toContainText(savedDialogExcerpt);
  await page.screenshot({ path: "test-results/vertical-slice-save-load.png", fullPage: true });
  await page.getByTestId("save-load-overlay-close").click();
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
  await expect(page.getByTestId("vn-dialog-surface")).toHaveAttribute("data-textbox-opacity", "0.4");
  await blurActiveElement(page);
  await page.keyboard.press("Space");
  await movementPulse(page, "ArrowUp");
  await expect(page.getByTestId("vertical-slice-substate")).toHaveText("vn2d-overlay");
  await expect(page.getByTestId("vn-dialog-text")).toContainText(savedDialogExcerpt);
  await expect(page.getByTestId("vertical-slice-pixi-background")).toHaveText("bg:harness");
  await expect(page.getByTestId("vertical-slice-pixi-slots")).toContainText("center:character:felix/portrait:felix:neutral");
  await expect(page.getByTestId("vertical-slice-pixi-tasks")).toHaveText("empty");
  await expectNoDocumentScroll(page);
  await page.screenshot({ path: "test-results/vertical-slice-vn-choice.png", fullPage: true });

  await expect(page.getByTestId("vn-dialog-choices")).toBeVisible();
  await expect(page.getByTestId("vn-dialog-state")).toHaveText("等待选择");
  await expect(page.getByTestId("vn-dialog-choice-0")).toHaveText("分支1：快速结束剧情逻辑测试");
  await expect(page.getByTestId("vn-dialog-choice-1")).toHaveText("分支2：完整 Pixi 命令视觉验收");
  await page.getByTestId("vn-dialog-choice-0").click();
  await expect(page.getByTestId("vertical-slice-route")).toHaveText("return");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("分支 1 检查点");
  await advanceUntilOverlayClosed(page);
  await expect(page.getByTestId("vertical-slice-substate")).toHaveText("walk");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu-overlay")).toBeVisible();
  await expect(page.getByTestId("pause-save")).toBeEnabled();
  await expect(page.getByTestId("pause-load")).toBeEnabled();
  await expect(page.getByTestId("pause-settings")).toBeEnabled();
  await page.screenshot({ path: "test-results/vertical-slice-pause-menu.png", fullPage: true });
  await page.getByTestId("pause-menu-overlay-close").click();
  await expect(page.getByTestId("pause-menu-overlay")).toBeHidden();

  await page.getByTestId("vertical-slice-reset").click();
  await page.getByTestId("vertical-slice-move-witness").click();
  await page.getByTestId("vertical-slice-confirm").click();
  await advanceUntilChoices(page);
  await page.getByTestId("vn-dialog-choice-1").click();
  await expect(page.getByTestId("vertical-slice-route")).toHaveText("classroom");
  await expect(page.getByTestId("vertical-slice-evidence")).toContainText("evidence:keycard");
  await expect(page.getByTestId("vn-dialog-text")).toContainText("分支 2 开始");
  await page.screenshot({ path: "test-results/vertical-slice-branch-b.png", fullPage: true });

  expect(consoleErrors).toEqual([]);
});

async function walkForwardUntilActive(page: Page, interactableId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await movementPulse(page, "ArrowUp");
    if ((await page.getByTestId("vertical-slice-active-interactable").textContent()) === interactableId) return;
  }

  await expect(page.getByTestId("vertical-slice-active-interactable")).toHaveText(interactableId);
}

async function expectNoDocumentScroll(page: Page) {
  const hasDocumentScroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
  expect(hasDocumentScroll).toBe(false);
}

async function advanceUntilChoices(page: Page) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await page.getByTestId("vn-dialog-choices").count()) > 0) return;
    await page.getByTestId("vn-dialog-advance").click();
  }

  await expect(page.getByTestId("vn-dialog-choices")).toBeVisible();
}

async function advanceUntilOverlayClosed(page: Page) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await page.getByTestId("vertical-slice-substate").textContent()) === "walk") return;
    await page.getByTestId("vn-dialog-advance").click();
  }

  await expect(page.getByTestId("vertical-slice-substate")).toHaveText("walk");
}

async function expectKeyNeverFocuses(page: Page, key: string, activeTestId: string) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await movementPulse(page, key);
    await expect(page.getByTestId(activeTestId)).toHaveText("none");
  }
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

async function requestPointerLockAndRelease(page: Page, triggerTestId: string, statusTestId: string) {
  await page.getByTestId(triggerTestId).click();
  await expect(page.getByTestId(statusTestId)).toHaveText(/requested|locked|unlocked|denied/);
  await page.waitForTimeout(650);

  const status = (await page.getByTestId(statusTestId).textContent()) ?? "";
  expect(status).toMatch(/locked|unlocked|denied/);
  if (!status.includes("locked")) return;

  await page.keyboard.press("Escape");
  await expect(page.getByTestId(statusTestId)).toHaveText("unlocked");
}

function isExpectedPointerLockError(text: string): boolean {
  return text.includes("PointerLockControls: Unable to use Pointer Lock API");
}
